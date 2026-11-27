import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_RECIPIENT_ROWS = 10000;

export const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls'];

const EMAIL_HEADER_CANDIDATES = [
  'email',
  'email address',
  'emailaddress',
  'e-mail',
  'e mail',
  'e_mail',
  'recipient email',
  'recipient_email',
  'mail',
  'email id',
  'email_id',
  'mail id',
  'contact email',
  'work email',
  'primary email',
];

const NAME_HEADER_CANDIDATES = [
  'full name',
  'full_name',
  'fullname',
  'name',
  'recipient name',
  'recipient_name',
  'contact name',
  'customer name',
  'client name',
  'display name',
  'candidate name',
  'student name',
  'first name',
];

/**
 * Validate file signature (magic bytes) to prevent extension spoofing
 */
export function validateFileSignature(buffer, extension) {
  if (!buffer || buffer.length < 4) {
    throw new Error('File buffer is empty or corrupted.');
  }

  const ext = extension.toLowerCase();

  if (ext === 'xlsx') {
    // ZIP header: 50 4B 03 04 (PK..)
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
    if (!isZip) {
      throw new Error('Invalid XLSX file signature. File appears to be renamed or corrupted.');
    }
  } else if (ext === 'xls') {
    // Compound File Binary (CFB): D0 CF 11 E0 A1 B1 1A E1
    const isCfb = buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
    if (!isCfb) {
      throw new Error('Invalid legacy XLS file signature. File appears to be renamed or corrupted.');
    }
  } else if (ext === 'csv') {
    // CSV should be valid UTF-8/ASCII text without binary null bytes in first 512 bytes
    const checkLen = Math.min(buffer.length, 512);
    for (let i = 0; i < checkLen; i++) {
      if (buffer[i] === 0x00) {
        throw new Error('Invalid CSV file: Detected binary content or null bytes.');
      }
    }
  } else {
    throw new Error(`Unsupported file extension: .${ext}. Allowed extensions: .csv, .xlsx, .xls`);
  }

  return true;
}

/**
 * Automatically detect likely email and name columns from detected headers
 */
export function autoDetectColumns(headers) {
  let detectedEmail = '';
  let detectedName = '';

  const cleanHeaders = headers.map((h) => ({
    original: h,
    normalized: String(h).trim().toLowerCase().replace(/[-_]/g, ' '),
  }));

  // Match email column
  for (const item of cleanHeaders) {
    if (EMAIL_HEADER_CANDIDATES.includes(item.normalized)) {
      detectedEmail = item.original;
      break;
    }
  }
  if (!detectedEmail) {
    for (const item of cleanHeaders) {
      if (item.normalized.includes('email') || item.normalized.includes('mail')) {
        detectedEmail = item.original;
        break;
      }
    }
  }

  // Match name column
  for (const item of cleanHeaders) {
    if (NAME_HEADER_CANDIDATES.includes(item.normalized)) {
      detectedName = item.original;
      break;
    }
  }
  if (!detectedName) {
    for (const item of cleanHeaders) {
      if (item.normalized.includes('name') && !item.normalized.includes('file')) {
        detectedName = item.original;
        break;
      }
    }
  }

  return {
    emailColumn: detectedEmail,
    nameColumn: detectedName,
  };
}

/**
 * Parse CSV file buffer
 */
export function parseCSVBuffer(buffer) {
  // Strip UTF-8 BOM if present
  let csvText = buffer.toString('utf8');
  if (csvText.charCodeAt(0) === 0xFEFF) {
    csvText = csvText.substring(1);
  }

  const parseResult = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });

  if (parseResult.errors && parseResult.errors.length > 0) {
    const fatal = parseResult.errors.find((e) => e.type === 'Delimiter' || e.code === 'UndetectableDelimiter');
    if (fatal) {
      throw new Error(`CSV delimiter error: ${fatal.message}`);
    }
  }

  const rawRows = parseResult.data || [];
  const headers = parseResult.meta.fields || [];

  if (headers.length === 0) {
    throw new Error('CSV file contains no valid header row.');
  }

  return {
    headers,
    rawRows,
    availableSheets: ['Sheet1'],
    currentSheet: 'Sheet1',
  };
}

/**
 * Parse Excel (XLSX / XLS) buffer
 */
export function parseExcelBuffer(buffer, sheetName = null, headerRowIndex = 1) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false, // Do not evaluate formulas
    bookVBA: false,     // Do not execute macros
    dense: true,
  });

  const availableSheets = workbook.SheetNames || [];
  if (availableSheets.length === 0) {
    throw new Error('Excel workbook contains no sheets.');
  }

  const selectedSheetName = sheetName && availableSheets.includes(sheetName)
    ? sheetName
    : availableSheets[0];

  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    throw new Error(`Worksheet "${selectedSheetName}" not found in workbook.`);
  }

  // Convert worksheet to array of arrays to handle custom header row
  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (aoa.length === 0) {
    throw new Error('Selected worksheet is completely empty.');
  }

  const headerIdx = Math.max(0, headerRowIndex - 1);
  if (headerIdx >= aoa.length) {
    throw new Error(`Header row index (${headerRowIndex}) exceeds total sheet row count (${aoa.length}).`);
  }

  const rawHeaderRow = aoa[headerIdx] || [];
  const headers = rawHeaderRow
    .map((h, i) => (String(h).trim() ? String(h).trim() : `Column_${i + 1}`))
    .filter(Boolean);

  if (headers.length === 0) {
    throw new Error('No valid column headers found on specified header row.');
  }

  // Build rows starting after header row
  const rawRows = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const rowCells = aoa[r] || [];
    // Check if entire row is empty
    const hasValue = rowCells.some((val) => val !== null && val !== undefined && String(val).trim() !== '');
    if (!hasValue) continue;

    const rowObj = {};
    headers.forEach((h, colIdx) => {
      const cellVal = rowCells[colIdx];
      rowObj[h] = cellVal !== null && cellVal !== undefined ? String(cellVal).trim() : '';
    });
    rawRows.push(rowObj);
  }

  return {
    headers,
    rawRows,
    availableSheets,
    currentSheet: selectedSheetName,
  };
}

/**
 * Identify extra spreadsheet columns that are ignored by the two-field (Full Name + Email Address) import model
 */
export function getIgnoredColumns(headers = [], emailColumn = '', nameColumn = '') {
  if (!Array.isArray(headers)) return [];
  const mapped = new Set([emailColumn, nameColumn].filter(Boolean));
  return headers.filter((h) => h && !mapped.has(h));
}

/**
 * Universal parse entrypoint with security limits and validation
 */
export function parseSpreadsheet(buffer, filename, options = {}) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty (0 bytes).');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds maximum limit of 10 MB.`);
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: .${ext}. Only CSV (.csv), Excel (.xlsx), and legacy Excel (.xls) are accepted.`);
  }

  // Validate magic bytes
  validateFileSignature(buffer, ext);

  let parsed;
  if (ext === 'csv') {
    parsed = parseCSVBuffer(buffer);
  } else {
    parsed = parseExcelBuffer(buffer, options.worksheet_name, options.header_row || 1);
  }

  if (parsed.rawRows.length > MAX_RECIPIENT_ROWS) {
    throw new Error(`Row count (${parsed.rawRows.length}) exceeds maximum limit of ${MAX_RECIPIENT_ROWS} recipients.`);
  }

  // Auto-detect ONLY Full Name and Email Address columns if not explicitly passed
  const detected = autoDetectColumns(parsed.headers);
  const emailCol = options.email_column || detected.emailColumn;
  const nameCol = options.name_column || detected.nameColumn;
  const ignoredColumns = getIgnoredColumns(parsed.headers, emailCol, nameCol);

  return {
    headers: parsed.headers,
    rawRows: parsed.rawRows,
    availableSheets: parsed.availableSheets,
    currentSheet: parsed.currentSheet,
    headerRow: options.header_row || 1,
    detectedColumns: detected,
    ignoredColumns,
    mappingConfig: {
      emailColumn: emailCol,
      nameColumn: nameCol,
      headerRow: options.header_row || 1,
      worksheetName: parsed.currentSheet,
    },
  };
}
