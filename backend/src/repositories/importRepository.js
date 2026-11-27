import crypto from 'node:crypto';
import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';
import { getTemplateById } from './templateRepository.js';
import { inspectPlaceholders } from '../services/placeholderRegistry.js';

// Two-field bulk import provides recipient_name and recipient_email, plus global system constants
const BULK_IMPORT_AVAILABLE_TOKENS = new Set([
  'recipient_name',
  'recipient_email',
  'institution_name',
  'current_year',
  'campaign_name',
  'organization_name',
  'brand_name',
  'system_date',
  'unsubscribe_link',
]);

// Transient raw spreadsheet buffers held strictly in memory until batch commit/cancellation
const memoryRawFiles = new Map();

export function setTransientBatchFile(batchId, buffer, filename) {
  memoryRawFiles.set(batchId, { buffer, filename });
}

export function getTransientBatchFile(batchId) {
  return memoryRawFiles.get(batchId) || null;
}

export function clearTransientBatchFile(batchId) {
  memoryRawFiles.delete(batchId);
}

/**
 * Inspect template tokens to warn administrators if the selected template expects per-recipient fields
 * that are not included in the two-column (Full Name + Email Address) import format.
 */
export function analyzeTemplatePersonalizationCompatibility(template) {
  if (!template) return { missingFields: [], unsupportedTokens: [] };

  const combinedText = [
    template.subject || '',
    template.html_content || '',
    template.text_content || '',
  ].join('\n');

  const { found, unsupported } = inspectPlaceholders(combinedText);
  const unavailableTokens = found.filter((token) => {
    const key = token.replace(/^\{\{|\}\}$/g, '').trim().toLowerCase();
    return !BULK_IMPORT_AVAILABLE_TOKENS.has(key);
  });

  return {
    missingFields: unavailableTokens,
    unsupportedTokens: unsupported,
  };
}

function isMissingRpcError(error) {
  return error?.code === 'PGRST202' || String(error?.message || '').includes('Could not find the function');
}

/**
 * Create a new import batch strictly in PostgreSQL
 */
export async function createBatch(batchData) {
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();

  const dbRecord = {
    id: batchId,
    created_by: batchData.created_by || null,
    original_filename: batchData.original_filename,
    file_type: batchData.file_type,
    file_size_bytes: batchData.file_size_bytes || 0,
    status: batchData.status || 'Uploaded',
    worksheet_name: batchData.worksheet_name || 'Sheet1',
    available_sheets: batchData.available_sheets || ['Sheet1'],
    header_row: batchData.header_row || 1,
    total_rows: batchData.total_rows || 0,
    valid_count: batchData.valid_count || 0,
    warning_count: batchData.warning_count || 0,
    invalid_count: batchData.invalid_count || 0,
    duplicate_count: batchData.duplicate_count || 0,
    selected_count: batchData.selected_count || 0,
    mapping_config: {
      ...(batchData.mapping_config || {}),
      headers: batchData.headers || [],
      ignored_columns: batchData.ignored_columns || [],
      ignored_columns_warning: batchData.ignored_columns_warning || null,
    },
    detected_columns: batchData.detected_columns || {},
    error_message: null,
    idempotency_key: null,
    committed_at: null,
    committed_campaign_id: null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('import_batches')
    .insert(dbRecord)
    .select('*')
    .single();

  if (error) {
    throw createDatabaseError('importRepository.createBatch', error);
  }

  return {
    ...data,
    headers: batchData.headers || data.mapping_config?.headers || [],
    ignored_columns: batchData.ignored_columns || data.mapping_config?.ignored_columns || [],
    ignored_columns_warning: batchData.ignored_columns_warning || data.mapping_config?.ignored_columns_warning || null,
  };
}

/**
 * Update batch metadata (e.g., after re-mapping columns)
 */
export async function updateBatchMetadata(batchId, fields = {}) {
  const now = new Date().toISOString();
  const current = await getBatchById(batchId);
  const existingConfig = current?.mapping_config || {};

  const dbFields = { ...fields, updated_at: now };
  const mergedConfig = {
    ...existingConfig,
    ...(fields.mapping_config || {}),
    ...(fields.headers !== undefined ? { headers: fields.headers } : {}),
    ...(fields.ignored_columns !== undefined ? { ignored_columns: fields.ignored_columns } : {}),
    ...(fields.ignored_columns_warning !== undefined ? { ignored_columns_warning: fields.ignored_columns_warning } : {}),
  };
  dbFields.mapping_config = mergedConfig;
  delete dbFields.headers;
  delete dbFields.ignored_columns;
  delete dbFields.ignored_columns_warning;

  const { data, error } = await supabaseAdmin
    .from('import_batches')
    .update(dbFields)
    .eq('id', batchId)
    .select('*')
    .single();

  if (error) {
    throw createDatabaseError('importRepository.updateBatchMetadata', error);
  }

  return {
    ...data,
    headers: mergedConfig.headers || [],
    ignored_columns: mergedConfig.ignored_columns || [],
    ignored_columns_warning: mergedConfig.ignored_columns_warning || null,
  };
}

/**
 * Save staging rows with chunked persistence in PostgreSQL
 */
export async function saveBatchRows(batchId, rows) {
  const now = new Date().toISOString();
  const formattedRows = rows.map((r) => ({
    id: crypto.randomUUID(),
    batch_id: batchId,
    row_number: r.row_number,
    recipient_name: r.recipient_name || '',
    recipient_email: r.recipient_email || '',
    normalized_email: r.normalized_email || '',
    validation_status: r.validation_status,
    validation_errors: r.validation_errors || [],
    is_selected: r.is_selected !== false,
    raw_data: r.raw_data || {},
    created_at: now,
    updated_at: now,
  }));

  const { error: delErr } = await supabaseAdmin
    .from('import_batch_rows')
    .delete()
    .eq('batch_id', batchId);

  if (delErr) {
    throw createDatabaseError('importRepository.saveBatchRows.delete', delErr);
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < formattedRows.length; i += CHUNK_SIZE) {
    const chunk = formattedRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabaseAdmin.from('import_batch_rows').insert(chunk);
    if (error) {
      throw createDatabaseError('importRepository.saveBatchRows.insert', error);
    }
  }

  return formattedRows;
}

/**
 * Retrieve batch by ID from PostgreSQL
 */
export async function getBatchById(batchId) {
  const { data, error } = await supabaseAdmin
    .from('import_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();

  if (error) {
    throw createDatabaseError('importRepository.getBatchById', error);
  }

  if (!data) return null;

  return {
    ...data,
    headers: data.mapping_config?.headers || [],
    ignored_columns: data.mapping_config?.ignored_columns || [],
    ignored_columns_warning: data.mapping_config?.ignored_columns_warning || null,
  };
}

/**
 * Retrieve rows for a batch with search, filter, sorting, and pagination
 */
export async function getBatchRows(batchId, options = {}) {
  const page = Math.max(1, parseInt(options.page || '1', 10));
  const limit = Math.min(10000, Math.max(1, parseInt(options.limit || '20', 10)));
  const statusFilter = options.status;
  const search = options.search ? options.search.trim().toLowerCase() : '';
  const sortField = options.sortField || 'row_number';
  const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc';

  let query = supabaseAdmin
    .from('import_batch_rows')
    .select('*', { count: 'exact' })
    .eq('batch_id', batchId);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('validation_status', statusFilter);
  }
  if (search) {
    query = query.or(`recipient_name.ilike.%${search}%,recipient_email.ilike.%${search}%`);
  }

  const allowedSortCols = new Set(['row_number', 'recipient_name', 'recipient_email', 'validation_status', 'created_at']);
  const safeSortField = allowedSortCols.has(sortField) ? sortField : 'row_number';
  query = query.order(safeSortField, { ascending: sortOrder === 'asc' });

  const start = (page - 1) * limit;
  query = query.range(start, start + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    throw createDatabaseError('importRepository.getBatchRows', error);
  }

  const rows = data || [];
  const total = typeof count === 'number' ? count : rows.length;
  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Update row selection status (individually or in bulk)
 */
export async function updateRowSelections(batchId, { rowIds, isSelected, selectAllStatus }) {
  const { data: allRows, error: fetchErr } = await supabaseAdmin
    .from('import_batch_rows')
    .select('id, row_number, validation_status, is_selected')
    .eq('batch_id', batchId);

  if (fetchErr) {
    throw createDatabaseError('importRepository.updateRowSelections.fetch', fetchErr);
  }

  const rows = allRows || [];
  const eligibleIdsToUpdate = [];

  for (const row of rows) {
    let match = false;
    if (Array.isArray(rowIds) && rowIds.length > 0) {
      if (rowIds.includes(row.id) || rowIds.includes(row.row_number)) {
        match = true;
      }
    } else if (selectAllStatus) {
      if (selectAllStatus === 'all' || row.validation_status === selectAllStatus) {
        match = true;
      }
    }

    if (match && row.validation_status !== 'invalid' && row.validation_status !== 'duplicate') {
      eligibleIdsToUpdate.push(row.id);
      row.is_selected = !!isSelected;
    }
  }

  if (eligibleIdsToUpdate.length > 0) {
    const { error: updErr } = await supabaseAdmin
      .from('import_batch_rows')
      .update({ is_selected: !!isSelected, updated_at: new Date().toISOString() })
      .eq('batch_id', batchId)
      .in('id', eligibleIdsToUpdate);

    if (updErr) {
      throw createDatabaseError('importRepository.updateRowSelections.update', updErr);
    }
  }

  const selectedCount = rows.filter(
    (r) => r.is_selected && (r.validation_status === 'valid' || r.validation_status === 'warning')
  ).length;

  const { error: batchUpdErr } = await supabaseAdmin
    .from('import_batches')
    .update({ selected_count: selectedCount, updated_at: new Date().toISOString() })
    .eq('id', batchId);

  if (batchUpdErr) {
    throw createDatabaseError('importRepository.updateRowSelections.updateBatch', batchUpdErr);
  }

  return { selectedCount, updatedCount: eligibleIdsToUpdate.length };
}

/**
 * Update batch status
 */
export async function updateBatchStatus(batchId, status, errorMsg = null) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('import_batches')
    .update({ status, error_message: errorMsg, updated_at: now })
    .eq('id', batchId)
    .select('*')
    .single();

  if (error) {
    throw createDatabaseError('importRepository.updateBatchStatus', error);
  }

  return data;
}

/**
 * Cancel an uncommitted batch
 */
export async function cancelBatch(batchId) {
  const batch = await getBatchById(batchId);
  if (!batch) {
    const err = new Error('Batch not found.');
    err.statusCode = 404;
    throw err;
  }
  if (batch.status === 'Committed') {
    const err = new Error('Cannot cancel an import batch that has already been committed to a campaign.');
    err.statusCode = 400;
    throw err;
  }

  const res = await updateBatchStatus(batchId, 'Cancelled');
  clearTransientBatchFile(batchId);
  return res;
}

/**
 * Atomically commit import batch and create bulk campaign with idempotency
 */
export async function commitBatch(batchId, { campaignName, templateId, adminId, idempotencyKey }) {
  const batch = await getBatchById(batchId);
  if (!batch) {
    const err = new Error('Import batch not found.');
    err.statusCode = 404;
    throw err;
  }

  if (batch.status === 'Committed' && batch.idempotency_key === idempotencyKey) {
    return {
      success: true,
      campaign_id: batch.committed_campaign_id,
      recipients_count: batch.selected_count,
      idempotent_replay: true,
    };
  }

  if (batch.status === 'Committed') {
    const err = new Error('This import batch has already been committed and cannot be committed again.');
    err.statusCode = 400;
    throw err;
  }

  if (batch.status !== 'Ready') {
    const err = new Error(`Import batch is not ready for commitment. Current status: ${batch.status}`);
    err.statusCode = 400;
    throw err;
  }

  const template = await getTemplateById(templateId);
  if (!template) {
    const err = new Error(`Selected template (${templateId}) could not be loaded for campaign creation.`);
    err.statusCode = 404;
    throw err;
  }
  const personalizationAnalysis = analyzeTemplatePersonalizationCompatibility(template);

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('commit_import_batch', {
    p_batch_id: batchId,
    p_campaign_name: campaignName.trim(),
    p_template_id: templateId,
    p_admin_id: adminId,
    p_idempotency_key: idempotencyKey,
  });

  if (!rpcError && rpcResult) {
    if (!rpcResult.success) {
      throw new Error(rpcResult.error || 'Import commit RPC failed.');
    }
    clearTransientBatchFile(batchId);
    return {
      ...rpcResult,
      personalization_warnings: personalizationAnalysis.missingFields,
    };
  }

  if (rpcError && !isMissingRpcError(rpcError)) {
    throw createDatabaseError('importRepository.commitBatch.rpc', rpcError);
  }

  // Fallback ONLY to direct Supabase table operations when commit_import_batch RPC function isn't installed
  const { data: rowsData, error: rowsErr } = await supabaseAdmin
    .from('import_batch_rows')
    .select('*')
    .eq('batch_id', batchId)
    .eq('is_selected', true);

  if (rowsErr) {
    throw createDatabaseError('importRepository.commitBatch.selectRows', rowsErr);
  }

  const selectedRows = (rowsData || []).filter(
    (r) =>
      (r.validation_status === 'valid' || r.validation_status === 'warning') &&
      Boolean(r.recipient_name && r.recipient_name.trim()) &&
      Boolean(r.recipient_email && r.recipient_email.trim())
  );

  if (selectedRows.length === 0) {
    throw new Error('No eligible selected recipients with valid Full Name and Email Address found in this batch.');
  }

  const campaignId = crypto.randomUUID();
  const now = new Date().toISOString();

  const campaignRecord = {
    id: campaignId,
    campaign_name: campaignName.trim(),
    campaign_type: 'bulk',
    subject: template.subject,
    template_id: template.id,
    template_version: template.version || 1,
    template_snapshot: {
      template_id: template.id,
      version: template.version || 1,
      name: template.name,
      subject: template.subject,
      html_content: template.html_content,
      text_content: template.text_content,
      captured_at: now,
    },
    status: 'ready',
    total_recipients: selectedRows.length,
    sent_count: 0,
    failed_count: 0,
    pending_count: selectedRows.length,
    outcome_unknown_count: 0,
    created_by: adminId || null,
    created_at: now,
  };

  const { error: campErr } = await supabaseAdmin.from('campaigns').insert(campaignRecord);
  if (campErr) {
    throw createDatabaseError('importRepository.commitBatch.insertCampaign', campErr);
  }

  const recipientRecords = selectedRows.map((r) => ({
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    recipient_name: r.recipient_name.trim(),
    recipient_email: r.recipient_email.trim(),
    status: 'pending',
    created_at: now,
    updated_at: now,
  }));

  const CHUNK_SIZE = 500;
  for (let i = 0; i < recipientRecords.length; i += CHUNK_SIZE) {
    const chunk = recipientRecords.slice(i, i + CHUNK_SIZE);
    const { error: recErr } = await supabaseAdmin.from('campaign_recipients').insert(chunk);
    if (recErr) {
      throw createDatabaseError('importRepository.commitBatch.insertRecipients', recErr);
    }
  }

  const { error: batchUpdErr } = await supabaseAdmin
    .from('import_batches')
    .update({
      status: 'Committed',
      committed_at: now,
      committed_campaign_id: campaignId,
      idempotency_key: idempotencyKey,
      selected_count: selectedRows.length,
    })
    .eq('id', batchId);

  if (batchUpdErr) {
    throw createDatabaseError('importRepository.commitBatch.updateBatch', batchUpdErr);
  }

  clearTransientBatchFile(batchId);

  return {
    success: true,
    campaign_id: campaignId,
    recipients_count: selectedRows.length,
    idempotent_replay: false,
    personalization_warnings: personalizationAnalysis.missingFields,
  };
}
