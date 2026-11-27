import * as XLSX from 'xlsx';

export const RECIPIENT_TEMPLATE_SAMPLE_ROWS: Array<{ 'Full Name': string; 'Email Address': string }> = [
  { 'Full Name': 'Alex Morgan', 'Email Address': 'alex.morgan@example.com' },
  { 'Full Name': 'Jordan Lee', 'Email Address': 'jordan.lee@example.com' },
  { 'Full Name': 'Taylor Smith', 'Email Address': 'taylor.smith@example.com' },
  { 'Full Name': 'Sam Wilson', 'Email Address': 'sam.wilson@example.com' },
];

export class ExportService {
  /**
   * Sanitizes cell values to prevent spreadsheet formula injection (CSV/Excel injection)
   * If a value begins with =, +, -, @, \t, or \r, prefix with a single quote.
   */
  public static sanitizeFormulaValue(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val);
    const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
    if (formulaChars.some((char) => str.startsWith(char))) {
      str = "'" + str;
    }
    return str;
  }

  /**
   * Export an array of objects to a CSV file and trigger client-side download with formula protection.
   */
  public static exportToCSV(data: Record<string, any>[], filename: string) {
    if (!data || data.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];

    // Header row
    csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

    // Data rows with formula injection protection
    for (const row of data) {
      const values = headers.map((header) => {
        const val = row[header] ?? '';
        const sanitized = this.sanitizeFormulaValue(val);
        const escaped = sanitized.replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    // Include UTF-8 BOM for clean opening in Microsoft Excel and Google Sheets
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\r\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private static buildSanitizedWorkbook(
    data: Record<string, any>[],
    sheetName: string
  ): XLSX.WorkBook {
    const sanitizedData = data.map((row) => {
      const sanitizedRow: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        sanitizedRow[key] = typeof val === 'number' || typeof val === 'boolean'
          ? val
          : this.sanitizeFormulaValue(val);
      }
      return sanitizedRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(sanitizedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const maxCols = Object.keys(data[0]).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...data.map((row) => String(row[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
    });
    worksheet['!cols'] = maxCols;

    return workbook;
  }

  /**
   * Export an array of objects to an Excel (.xlsx or .xls) file with formula protection.
   */
  public static exportToExcel(
    data: Record<string, any>[],
    filename: string,
    sheetName: string = 'Report',
    format: 'xlsx' | 'xls' = 'xlsx'
  ) {
    if (!data || data.length === 0) {
      alert('No data available to export.');
      return;
    }

    const workbook = this.buildSanitizedWorkbook(data, sheetName);
    const ext = format === 'xls' ? '.xls' : '.xlsx';
    const actualFilename = filename.endsWith(ext) ? filename : `${filename.replace(/\.(xlsx|xls)$/i, '')}${ext}`;
    XLSX.writeFile(workbook, actualFilename, {
      bookType: format === 'xls' ? 'biff8' : 'xlsx',
    });
  }

  /**
   * Download the official clean two-column recipient import template (.csv, .xlsx, or .xls).
   */
  public static downloadRecipientTemplate(format: 'csv' | 'xlsx' | 'xls'): string {
    const baseFilename = 'snpsunexus_recipient_template';
    if (format === 'csv') {
      const file = `${baseFilename}.csv`;
      this.exportToCSV(RECIPIENT_TEMPLATE_SAMPLE_ROWS, file);
      return file;
    }
    const file = `${baseFilename}.${format}`;
    this.exportToExcel(RECIPIENT_TEMPLATE_SAMPLE_ROWS, file, 'Recipients', format);
    return file;
  }
}
