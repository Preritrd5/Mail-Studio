import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { RecipientRecord } from '../types';

export interface ParseResult {
  fileName: string;
  fileSize: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  records: RecipientRecord[];
  headers: string[];
  ignoredColumns: string[];
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export class FileParserService {
  /**
   * Parse CSV, XLSX, or XLS file completely client-side.
   */
  public static async parseFile(file: File): Promise<ParseResult> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      return this.parseCSV(file);
    } else if (extension === 'xlsx' || extension === 'xls') {
      return this.parseExcel(file);
    } else {
      throw new Error(`Unsupported file type (.${extension}). Please upload CSV, XLSX, or XLS.`);
    }
  }

  private static parseCSV(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          try {
            const rawData = results.data as Record<string, string>[];
            const headers = results.meta.fields || [];
            const result = this.validateAndTransform(rawData, headers, file.name, file.size);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
        error: (error) => {
          reject(new Error(`CSV Parsing error: ${error.message}`));
        },
      });
    });
  }

  private static async parseExcel(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            throw new Error('Excel workbook contains no sheets.');
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, {
            defval: '',
          });

          const headers: string[] = [];
          if (rawData.length > 0 && typeof rawData[0] === 'object') {
            headers.push(...Object.keys(rawData[0]));
          }

          const result = this.validateAndTransform(rawData, headers, file.name, file.size);
          resolve(result);
        } catch (err: any) {
          reject(new Error(`Excel Parsing error: ${err?.message || 'Invalid file format'}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file from disk.'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Validates raw table rows distinguishing:
   * - Valid recipients
   * - Invalid email addresses (syntax regex)
   * - Duplicate recipient emails (detected across file rows)
   * - Missing required fields (email or name)
   */
  private static validateAndTransform(
    rows: Record<string, string>[],
    headers: string[],
    fileName: string,
    fileSizeBytes: number
  ): ParseResult {
    const records: RecipientRecord[] = [];
    const seenEmails = new Set<string>();

    let validRows = 0;
    let duplicateRows = 0;
    let invalidRows = 0;

    // Detect column keys flexibly
    const findKey = (possibleNames: string[]): string | undefined => {
      return headers.find((h) =>
        possibleNames.some((name) => h.toLowerCase().trim() === name.toLowerCase())
      );
    };

    const emailKey = findKey(['email', 'email address', 'emailaddress', 'e-mail', 'mail', 'email_address', 'recipient_email', 'recipient email']);
    const nameKey = findKey(['full name', 'name', 'recipient name', 'recipient_name', 'full_name', 'fullname', 'student name', 'student_name']);
    const mappedSet = new Set([emailKey, nameKey].filter(Boolean));
    const ignoredColumns = headers.filter((h) => h && !mappedSet.has(h));

    rows.forEach((row, idx) => {
      const rawEmail = (emailKey ? String(row[emailKey] ?? '') : '').trim();
      const rawName = (nameKey ? String(row[nameKey] ?? '') : '').trim();

      let status: RecipientRecord['status'] = 'valid';
      let reason: string | undefined = undefined;

      // Check mandatory two-field requirements (Full Name & Email Address)
      if (!rawEmail && !rawName) {
        status = 'missing_fields';
        reason = 'Missing required Full Name and Email Address fields';
        invalidRows++;
      } else if (!rawEmail) {
        status = 'missing_fields';
        reason = 'Missing required Email Address';
        invalidRows++;
      } else if (!rawName) {
        status = 'missing_fields';
        reason = 'Missing required Full Name';
        invalidRows++;
      }
      // Check invalid email syntax
      else if (!EMAIL_REGEX.test(rawEmail)) {
        status = 'invalid_email';
        reason = `Invalid email syntax: "${rawEmail}"`;
        invalidRows++;
      }
      // Check duplicates
      else if (seenEmails.has(rawEmail.toLowerCase())) {
        status = 'duplicate';
        reason = `Duplicate email already present in roster: ${rawEmail}`;
        duplicateRows++;
      } else {
        seenEmails.add(rawEmail.toLowerCase());
        status = 'valid';
        validRows++;
      }

      records.push({
        id: `REC-${Date.now()}-${idx + 1}`,
        name: rawName,
        email: rawEmail,
        status,
        reason,
        selected: status === 'valid',
      });
    });

    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    };

    return {
      fileName,
      fileSize: formatBytes(fileSizeBytes),
      totalRows: records.length,
      validRows,
      duplicateRows,
      invalidRows,
      records,
      headers,
      ignoredColumns,
    };
  }
}
