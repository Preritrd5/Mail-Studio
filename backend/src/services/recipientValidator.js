/**
 * Strict RFC 5322 compliant email regex
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Normalize email address for comparison and deduplication
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Validate a single recipient row against mandatory two-field (Full Name + Email Address) schema and duplicate map
 */
export function validateRecipientRow(rowObj, rowNumber, emailColumn, nameColumn, seenEmailsMap) {
  const rawEmail = emailColumn && rowObj[emailColumn] !== undefined ? String(rowObj[emailColumn]).trim() : '';
  const rawName = nameColumn && rowObj[nameColumn] !== undefined ? String(rowObj[nameColumn]).trim() : '';
  const normalized = normalizeEmail(rawEmail);

  const errors = [];

  // 1. Mandatory Field Checks (Full Name & Email Address)
  if (!rawName) {
    errors.push('Missing full name: Full Name is a mandatory recipient field.');
  }
  if (!rawEmail) {
    errors.push('Missing email address: Email Address is a mandatory recipient field.');
  } else if (!EMAIL_REGEX.test(normalized)) {
    errors.push(`Invalid email syntax format: "${rawEmail}".`);
  }

  if (errors.length > 0) {
    return {
      row_number: rowNumber,
      recipient_name: rawName,
      recipient_email: rawEmail,
      normalized_email: normalized,
      validation_status: 'invalid',
      validation_errors: errors,
      is_selected: false,
      raw_data: rowObj,
    };
  }

  // 2. Batch Duplicate Check
  if (seenEmailsMap.has(normalized)) {
    const firstSeenRow = seenEmailsMap.get(normalized);
    errors.push(`Duplicate email address: Identical to record at Row #${firstSeenRow}.`);
    return {
      row_number: rowNumber,
      recipient_name: rawName,
      recipient_email: rawEmail,
      normalized_email: normalized,
      validation_status: 'duplicate',
      validation_errors: errors,
      is_selected: false,
      raw_data: rowObj,
    };
  }

  // Register first valid occurrence in seenEmailsMap
  seenEmailsMap.set(normalized, rowNumber);

  return {
    row_number: rowNumber,
    recipient_name: rawName,
    recipient_email: rawEmail,
    normalized_email: normalized,
    validation_status: 'valid',
    validation_errors: [],
    is_selected: true,
    raw_data: rowObj,
  };
}

/**
 * Authoritative batch validation engine
 */
export function validateBatchRows(rawRows, emailColumn, nameColumn) {
  if (!emailColumn) {
    throw new Error('Email column mapping is required for recipient validation.');
  }
  if (!nameColumn) {
    throw new Error('Full Name column mapping is required for recipient validation.');
  }

  const seenEmailsMap = new Map(); // normalized_email -> first_row_number
  const validatedRows = [];

  let validCount = 0;
  let warningCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let selectedCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2; // Row 1 is header, data rows start at row 2
    const rowObj = rawRows[i];

    const validated = validateRecipientRow(rowObj, rowNumber, emailColumn, nameColumn, seenEmailsMap);
    validatedRows.push(validated);

    switch (validated.validation_status) {
      case 'valid':
        validCount++;
        if (validated.is_selected) selectedCount++;
        break;
      case 'warning':
        warningCount++;
        if (validated.is_selected) selectedCount++;
        break;
      case 'invalid':
        invalidCount++;
        break;
      case 'duplicate':
        duplicateCount++;
        break;
      default:
        break;
    }
  }

  return {
    rows: validatedRows,
    summary: {
      total_rows: rawRows.length,
      valid_count: validCount,
      warning_count: warningCount,
      invalid_count: invalidCount,
      duplicate_count: duplicateCount,
      selected_count: selectedCount,
    },
  };
}
