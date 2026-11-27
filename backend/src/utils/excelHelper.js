import XLSX from 'xlsx';

/**
 * Excel Helper with Spreadsheet Formula Injection Protection
 * Builds genuine multi-sheet .xlsx binary buffers with auto-fit column widths
 */

export function sanitizeExcelValue(val) {
  if (val === null || val === undefined) return '';

  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }

  let str = String(val);
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some(char => str.startsWith(char))) {
    str = "'" + str;
  }

  return str;
}

/**
 * Generate genuine .xlsx buffer with one or multiple worksheets
 * @param {Array<{ sheetName: string, data: Array<Object>, columns?: Array<{ key: string, label: string }> }>} sheets
 * @returns {Buffer}
 */
export function generateExcelBuffer(sheets = []) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const sheetName = sheet.sheetName.substring(0, 31); // Excel worksheet names max 31 chars
    const rawData = sheet.data || [];
    const columns = sheet.columns || (rawData.length > 0 ? Object.keys(rawData[0]).map(k => ({ key: k, label: k })) : []);

    // Format data rows with formula protection and friendly labels
    const formattedRows = rawData.map(row => {
      const formatted = {};
      for (const col of columns) {
        formatted[col.label] = sanitizeExcelValue(row[col.key]);
      }
      return formatted;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);

    // Compute column widths
    const colWidths = columns.map(col => {
      const headerLen = col.label.length;
      const maxValLen = formattedRows.reduce((acc, r) => {
        const valStr = String(r[col.label] ?? '');
        return Math.max(acc, valStr.length);
      }, 0);
      return { wch: Math.min(Math.max(headerLen, maxValLen) + 3, 45) };
    });
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Build the full 3-sheet performance workbook
 * @param {{ overview?: Object, campaigns?: Array<Object>, activity?: Array<Object> }} data
 * @returns {Buffer}
 */
export function buildInstitutionalExcelWorkbook({ overview = {}, campaigns = [], activity = [] }) {
  const overviewRows = [
    { 'Metric': 'Total Unique Recipients', 'Value': overview.total_recipients ?? 0 },
    { 'Metric': 'Successfully Sent (SMTP Accepted)', 'Value': overview.total_sent ?? 0 },
    { 'Metric': 'Failed / Rejected Dispatches', 'Value': overview.total_failed ?? 0 },
    { 'Metric': 'Pending in Queue', 'Value': overview.total_pending ?? 0 },
    { 'Metric': 'Total Recorded Attempts', 'Value': overview.total_attempts ?? 0 },
    { 'Metric': 'Acceptance Rate (%)', 'Value': `${overview.acceptance_rate ?? 0}%` },
    { 'Metric': 'Failure Rate (%)', 'Value': `${overview.failure_rate ?? 0}%` },
    { 'Metric': 'Generated At', 'Value': new Date().toISOString() },
  ];

  const sheets = [
    {
      sheetName: 'Executive Overview',
      data: overviewRows,
      columns: [
        { key: 'Metric', label: 'Metric' },
        { key: 'Value', label: 'Value' },
      ],
    },
    {
      sheetName: 'Campaign Performance',
      data: campaigns,
      columns: [
        { key: 'id', label: 'Campaign ID' },
        { key: 'campaign_name', label: 'Campaign Name' },
        { key: 'campaign_type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'total_recipients', label: 'Total Target' },
        { key: 'sent_count', label: 'Sent Count' },
        { key: 'pending_count', label: 'Pending' },
        { key: 'failed_count', label: 'Failed' },
        { key: 'acceptance_rate', label: 'Acceptance Rate (%)' },
        { key: 'created_at', label: 'Created At' },
      ],
    },
    {
      sheetName: 'Recent Activity',
      data: activity,
      columns: [
        { key: 'id', label: 'Activity ID' },
        { key: 'recipient_name', label: 'Recipient Name' },
        { key: 'recipient_email', label: 'Recipient Email' },
        { key: 'campaign_name', label: 'Campaign Name' },
        { key: 'status', label: 'Status' },
        { key: 'attempt_count', label: 'Attempts' },
        { key: 'created_at', label: 'Created At' },
      ],
    },
  ];

  return generateExcelBuffer(sheets);
}
