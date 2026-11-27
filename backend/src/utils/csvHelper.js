/**
 * CSV Helper with Spreadsheet Formula Injection (CSV Injection) Protection
 * Sanitizes user-provided values starting with dangerous formula characters (=, +, -, @, \t, \r)
 */

/**
 * Sanitizes a raw value for spreadsheet safety by prefixing formula indicators with a single quote.
 * @param {any} val
 * @returns {string}
 */
export function sanitizeForSpreadsheet(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some(char => str.startsWith(char))) {
    return "'" + str;
  }
  return str;
}

/**
 * Sanitizes a value and wraps it for CSV inclusion with escaped double-quotes.
 * @param {any} val
 * @returns {string}
 */
export function sanitizeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  let sanitized = sanitizeForSpreadsheet(val);
  // Escape double quotes by doubling them
  sanitized = sanitized.replace(/"/g, '""');
  return `"${sanitized}"`;
}

export const escapeCsvField = sanitizeCsvValue;


/**
 * Generate CSV string from records with headers
 * @param {Array<Object>} records
 * @param {Array<{ key: string, label: string }>} columns
 * @returns {string}
 */
export function generateCsv(records = [], columns = []) {
  if (!columns || columns.length === 0) {
    if (records.length === 0) return '\uFEFF';
    columns = Object.keys(records[0]).map(k => ({ key: k, label: k }));
  }

  const headerRow = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const rows = [headerRow];

  for (const record of records) {
    const rowValues = columns.map(c => sanitizeCsvValue(record[c.key]));
    rows.push(rowValues.join(','));
  }

  // Include UTF-8 BOM for Microsoft Excel compatibility
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Helper to build CSV from raw headers array and rows array
 * @param {Array<string>} headers
 * @param {Array<Array<any>>} rows
 * @returns {string}
 */
export function buildCsv(headers = [], rows = []) {
  const headerRow = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
  const lines = [headerRow];

  for (const row of rows) {
    const rowValues = row.map(v => sanitizeCsvValue(v));
    lines.push(rowValues.join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}
