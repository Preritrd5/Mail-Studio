import { parseSpreadsheet, getIgnoredColumns } from '../services/fileParser.js';
import { validateBatchRows } from '../services/recipientValidator.js';
import * as importRepo from '../repositories/importRepository.js';
import { 
  uuidParamSchema, 
  updateMappingSchema, 
  updateSelectionSchema, 
  commitImportSchema 
} from '../validators/importValidator.js';

function formatIgnoredColumnsWarning(ignoredColumns = []) {
  if (!ignoredColumns || ignoredColumns.length === 0) return null;
  return `Extra spreadsheet columns ignored: ${ignoredColumns.join(', ')}. Recipient imports accept only Full Name and Email Address.`;
}

/**
 * Handle multipart upload, parse file, validate recipients, and persist staging batch
 */
export async function uploadAndProcess(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'FILE_REQUIRED', message: 'No spreadsheet file provided. Please upload a CSV, XLSX, or XLS file.' },
      });
    }

    const { originalname, buffer, size } = req.file;

    // Optional options passed in multipart form
    const options = {
      worksheet_name: req.body.worksheet_name || null,
      header_row: req.body.header_row ? parseInt(req.body.header_row, 10) : 1,
      email_column: req.body.email_column || null,
      name_column: req.body.name_column || null,
    };

    // 1. Parse spreadsheet with security limits & format validation
    const parsed = parseSpreadsheet(buffer, originalname, options);

    // 2. Authoritative two-field recipient validation
    const emailCol = parsed.mappingConfig.emailColumn;
    const nameCol = parsed.mappingConfig.nameColumn;
    const ignoredColumns = getIgnoredColumns(parsed.headers, emailCol, nameCol);
    const ignoredWarning = formatIgnoredColumnsWarning(ignoredColumns);

    let validated;
    if (emailCol && nameCol && emailCol !== nameCol) {
      validated = validateBatchRows(parsed.rawRows, emailCol, nameCol);
    } else {
      // Allow reaching Step 2 manual mapping when auto-detection cannot resolve both columns
      validated = {
        rows: parsed.rawRows.map((raw, idx) => ({
          row_number: idx + 2,
          recipient_name: nameCol && raw[nameCol] !== undefined ? String(raw[nameCol]).trim() : '',
          recipient_email: emailCol && raw[emailCol] !== undefined ? String(raw[emailCol]).trim() : '',
          normalized_email: '',
          validation_status: 'invalid',
          validation_errors: ['Column mapping incomplete: map both Full Name and Email Address columns before continuing.'],
          is_selected: false,
          raw_data: raw,
        })),
        summary: {
          total_rows: parsed.rawRows.length,
          valid_count: 0,
          warning_count: 0,
          invalid_count: parsed.rawRows.length,
          duplicate_count: 0,
          selected_count: 0,
        },
      };
    }

    const ext = originalname.split('.').pop()?.toLowerCase();

    // 3. Create persistent import batch
    const batchData = {
      created_by: req.user?.id || null,
      original_filename: originalname,
      file_type: ext,
      file_size_bytes: size,
      status: 'Ready',
      worksheet_name: parsed.currentSheet,
      available_sheets: parsed.availableSheets,
      header_row: parsed.headerRow,
      total_rows: validated.summary.total_rows,
      valid_count: validated.summary.valid_count,
      warning_count: validated.summary.warning_count,
      invalid_count: validated.summary.invalid_count,
      duplicate_count: validated.summary.duplicate_count,
      selected_count: validated.summary.selected_count,
      mapping_config: parsed.mappingConfig,
      detected_columns: parsed.detectedColumns,
      headers: parsed.headers,
      ignored_columns: ignoredColumns,
      ignored_columns_warning: ignoredWarning,
    };

    const batch = await importRepo.createBatch(batchData);
    importRepo.setTransientBatchFile(batch.id, buffer, originalname);

    // 4. Save staging rows
    await importRepo.saveBatchRows(batch.id, validated.rows);

    return res.status(201).json({
      success: true,
      data: {
        batch: {
          id: batch.id,
          original_filename: batch.original_filename,
          file_type: batch.file_type,
          file_size_bytes: batch.file_size_bytes,
          status: batch.status,
          worksheet_name: batch.worksheet_name,
          available_sheets: batch.available_sheets,
          header_row: batch.header_row,
          mapping_config: batch.mapping_config,
          detected_columns: batch.detected_columns,
          headers: parsed.headers,
          ignored_columns: ignoredColumns,
          ignored_columns_warning: ignoredWarning,
          total_rows: validated.summary.total_rows,
          valid_count: validated.summary.valid_count,
          warning_count: validated.summary.warning_count,
          invalid_count: validated.summary.invalid_count,
          duplicate_count: validated.summary.duplicate_count,
          selected_count: validated.summary.selected_count,
          summary: validated.summary,
          created_at: batch.created_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve batch metadata and validation summary
 */
export async function getBatch(req, res, next) {
  try {
    const parseParam = uuidParamSchema.safeParse(req.params.id);
    if (!parseParam.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Batch ID must be a valid UUID.' },
      });
    }

    const batch = await importRepo.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: 'Import batch not found.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: batch,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve paginated staging rows for a batch
 */
export async function getBatchRows(req, res, next) {
  try {
    const parseParam = uuidParamSchema.safeParse(req.params.id);
    if (!parseParam.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Batch ID must be a valid UUID.' },
      });
    }

    const batch = await importRepo.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: 'Import batch not found.' },
      });
    }

    const result = await importRepo.getBatchRows(req.params.id, req.query);
    // Strip raw_data from HTTP ledger response so only Full Name & Email Address fields are exposed to review UI
    const sanitizedRows = (result.rows || []).map(({ raw_data, ...rowFields }) => rowFields);

    return res.status(200).json({
      success: true,
      data: {
        rows: sanitizedRows,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update column mapping configuration and re-validate all staging rows
 */
export async function updateMapping(req, res, next) {
  try {
    const parseParam = uuidParamSchema.safeParse(req.params.id);
    if (!parseParam.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Batch ID must be a valid UUID.' },
      });
    }

    const bodyValidation = updateMappingSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: bodyValidation.error.issues[0]?.message || 'Invalid mapping configuration.',
        },
      });
    }

    const batch = await importRepo.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: 'Import batch not found.' },
      });
    }

    if (batch.status === 'Committed') {
      return res.status(400).json({
        success: false,
        error: { code: 'BATCH_COMMITTED', message: 'Cannot modify column mapping of a committed batch.' },
      });
    }

    const { emailColumn, nameColumn, headerRow, worksheetName } = bodyValidation.data;

    let rawRows;
    let headers = batch.headers || [];
    const targetWorksheet = worksheetName || batch.worksheet_name;
    const targetHeaderRow = headerRow || batch.header_row || 1;

    // Re-parse worksheet/header row when transient file buffer is available and sheet/header changed
    const transientFile = importRepo.getTransientBatchFile(req.params.id);
    if (transientFile && (targetHeaderRow !== batch.header_row || targetWorksheet !== batch.worksheet_name)) {
      const reparsed = parseSpreadsheet(transientFile.buffer, transientFile.filename, {
        worksheet_name: targetWorksheet,
        header_row: targetHeaderRow,
        email_column: emailColumn,
        name_column: nameColumn,
      });
      rawRows = reparsed.rawRows;
      headers = reparsed.headers;
    } else {
      const allRows = await importRepo.getBatchRows(req.params.id, { limit: 10000 });
      rawRows = allRows.rows.map((r) => r.raw_data);
      if (headers.length === 0 && rawRows.length > 0) {
        headers = Object.keys(rawRows[0] || {});
      }
    }

    // Re-validate with mandatory two-field mapping
    const revalidated = validateBatchRows(rawRows, emailColumn, nameColumn);
    const ignoredColumns = getIgnoredColumns(headers, emailColumn, nameColumn);
    const ignoredWarning = formatIgnoredColumnsWarning(ignoredColumns);

    // Persist updated batch metadata & rows
    await importRepo.updateBatchMetadata(batch.id, {
      worksheet_name: targetWorksheet,
      header_row: targetHeaderRow,
      headers,
      ignored_columns: ignoredColumns,
      ignored_columns_warning: ignoredWarning,
      mapping_config: {
        emailColumn,
        nameColumn,
        headerRow: targetHeaderRow,
        worksheetName: targetWorksheet,
      },
      total_rows: revalidated.summary.total_rows,
      valid_count: revalidated.summary.valid_count,
      warning_count: revalidated.summary.warning_count,
      invalid_count: revalidated.summary.invalid_count,
      duplicate_count: revalidated.summary.duplicate_count,
      selected_count: revalidated.summary.selected_count,
    });

    await importRepo.saveBatchRows(batch.id, revalidated.rows);

    return res.status(200).json({
      success: true,
      data: {
        batch,
        summary: revalidated.summary,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update recipient row selection status
 */
export async function updateSelection(req, res, next) {
  try {
    const parseParam = uuidParamSchema.safeParse(req.params.id);
    if (!parseParam.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Batch ID must be a valid UUID.' },
      });
    }

    const bodyValidation = updateSelectionSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: bodyValidation.error.issues[0]?.message || 'Invalid selection request.',
        },
      });
    }

    const batch = await importRepo.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: 'Import batch not found.' },
      });
    }

    if (batch.status === 'Committed') {
      return res.status(400).json({
        success: false,
        error: { code: 'BATCH_COMMITTED', message: 'Cannot modify selections of an already committed batch.' },
      });
    }

    const result = await importRepo.updateRowSelections(req.params.id, bodyValidation.data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Atomically commit import batch and create bulk campaign in ready state
 */
export async function commitImport(req, res, next) {
  try {
    const parseParam = uuidParamSchema.safeParse(req.params.id);
    if (!parseParam.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Batch ID must be a valid UUID.' },
      });
    }

    const bodyValidation = commitImportSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: bodyValidation.error.issues[0]?.message || 'Invalid commit parameters.',
        },
      });
    }

    const { campaignName, templateId, idempotencyKey } = bodyValidation.data;

    const result = await importRepo.commitBatch(req.params.id, {
      campaignName,
      templateId,
      adminId: req.user?.id || null,
      idempotencyKey,
    });

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel an uncommitted batch
 */
export async function cancelImport(req, res, next) {
  try {
    const parseParam = uuidParamSchema.safeParse(req.params.id);
    if (!parseParam.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Batch ID must be a valid UUID.' },
      });
    }

    const batch = await importRepo.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: 'Import batch not found.' },
      });
    }

    if (batch.status === 'Committed') {
      return res.status(400).json({
        success: false,
        error: { code: 'BATCH_COMMITTED', message: 'Cannot cancel an import batch that has already been committed to a campaign.' },
      });
    }

    await importRepo.cancelBatch(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Import batch successfully cancelled.',
    });
  } catch (error) {
    next(error);
  }
}
