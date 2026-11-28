import crypto from 'node:crypto';
import { supabaseAdmin, createDatabaseError, resolveAdminUsersRecordId } from '../config/supabase.js';

/**
 * List templates from PostgreSQL with search, category, status filter, and pagination.
 * Contains zero automatic template seeding or fallback demo templates.
 */
export async function listTemplates({ search = '', category = 'All', status = 'active', page = 1, limit = 50 }) {
  let query = supabaseAdmin
    .from('email_templates')
    .select(
      'id, name, description, category, subject, html_content, text_content, is_active, version, archived_at, created_at, updated_at, created_by',
      { count: 'exact' }
    );

  if (status === 'active') {
    query = query.eq('is_active', true).is('archived_at', null);
  } else if (status === 'archived') {
    query = query.or('is_active.eq.false,archived_at.not.is.null');
  }

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`name.ilike.${term},subject.ilike.${term}`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.order('updated_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) {
    throw createDatabaseError('listTemplates', error);
  }

  return {
    templates: data || [],
    total: typeof count === 'number' ? count : (data || []).length,
    page,
    limit,
  };
}

/**
 * Retrieves a single template with full content and version history
 */
export async function getTemplateById(id) {
  const { data: tpl, error } = await supabaseAdmin
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw createDatabaseError('getTemplateById', error);
  }

  if (!tpl) {
    return null;
  }

  const { data: versions, error: verErr } = await supabaseAdmin
    .from('template_versions')
    .select('*')
    .eq('template_id', id)
    .order('version', { ascending: false });

  if (verErr) {
    throw createDatabaseError('getTemplateById.versions', verErr);
  }

  return {
    ...tpl,
    versions: versions || [],
  };
}

/**
 * Retrieves an exact template and optional specific version snapshot.
 * Returns null if template or requested version does not exist.
 */
export async function getTemplateByIdAndVersion(id, version = null) {
  const tpl = await getTemplateById(id);
  if (!tpl) return null;

  if (version === null || version === undefined || Number(version) === Number(tpl.version)) {
    return tpl;
  }

  const requestedVersion = Number(version);
  const matchingSnapshot = (tpl.versions || []).find((v) => Number(v.version) === requestedVersion);
  if (!matchingSnapshot) {
    return null;
  }

  return {
    ...tpl,
    version: matchingSnapshot.version,
    name: matchingSnapshot.name || tpl.name,
    description: matchingSnapshot.description ?? tpl.description,
    category: matchingSnapshot.category || tpl.category,
    subject: matchingSnapshot.subject,
    html_content: matchingSnapshot.html_content,
    text_content: matchingSnapshot.text_content,
  };
}

/**
 * Creates a new template record and initializes version 1 snapshot
 */
export async function createTemplate({ name, description, category, subject, html_content, text_content, userId }) {
  const templateId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const adminRecordId = await resolveAdminUsersRecordId(userId);

  const newTemplate = {
    id: templateId,
    name: name.trim(),
    description: (description || '').trim(),
    category: category || 'General Notifications',
    subject: subject.trim(),
    html_content: html_content || '',
    text_content: text_content || '',
    version: 1,
    is_active: true,
    archived_at: null,
    created_at: now,
    updated_at: now,
    created_by: adminRecordId,
    updated_by: adminRecordId,
  };

  const initialVersion = {
    id: versionId,
    template_id: templateId,
    version: 1,
    name: newTemplate.name,
    description: newTemplate.description,
    category: newTemplate.category,
    subject: newTemplate.subject,
    html_content: newTemplate.html_content,
    text_content: newTemplate.text_content,
    created_at: now,
    created_by: adminRecordId,
    change_summary: 'Initial template creation',
  };

  const { error: tplErr } = await supabaseAdmin.from('email_templates').insert(newTemplate);
  if (tplErr) {
    throw createDatabaseError('createTemplate.email_templates', tplErr);
  }

  const { error: verErr } = await supabaseAdmin.from('template_versions').insert(initialVersion);
  if (verErr) {
    throw createDatabaseError('createTemplate.template_versions', verErr);
  }

  return newTemplate;
}

/**
 * Updates a template, increments version number, and saves immutable version snapshot
 */
export async function updateTemplate(id, { name, description, category, subject, html_content, text_content, changeSummary, userId }) {
  const current = await getTemplateById(id);
  if (!current) {
    throw { statusCode: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' };
  }

  const nextVersion = (current.version || 1) + 1;
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const adminRecordId = await resolveAdminUsersRecordId(userId);

  const updatedRecord = {
    name: name !== undefined ? name.trim() : current.name,
    description: description !== undefined ? description.trim() : current.description,
    category: category !== undefined ? category : current.category,
    subject: subject !== undefined ? subject.trim() : current.subject,
    html_content: html_content !== undefined ? html_content : current.html_content,
    text_content: text_content !== undefined ? text_content : current.text_content,
    version: nextVersion,
    updated_at: now,
    updated_by: adminRecordId,
  };

  const newVersionSnapshot = {
    id: versionId,
    template_id: id,
    version: nextVersion,
    name: updatedRecord.name,
    description: updatedRecord.description,
    category: updatedRecord.category,
    subject: updatedRecord.subject,
    html_content: updatedRecord.html_content,
    text_content: updatedRecord.text_content,
    created_at: now,
    created_by: adminRecordId,
    change_summary: changeSummary || `Updated to revision v${nextVersion}`,
  };

  const { error: updErr } = await supabaseAdmin
    .from('email_templates')
    .update(updatedRecord)
    .eq('id', id);

  if (updErr) {
    throw createDatabaseError('updateTemplate.email_templates', updErr);
  }

  const { error: verErr } = await supabaseAdmin.from('template_versions').insert(newVersionSnapshot);
  if (verErr) {
    throw createDatabaseError('updateTemplate.template_versions', verErr);
  }

  return { ...current, ...updatedRecord };
}

/**
 * Duplicates a template with a clean copy title and new version 1 snapshot
 */
export async function duplicateTemplate(id, { newName, userId }) {
  const original = await getTemplateById(id);
  if (!original) {
    throw { statusCode: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Original template to duplicate was not found.' };
  }

  const copyName = newName && newName.trim() ? newName.trim() : `${original.name} (Copy)`;

  return await createTemplate({
    name: copyName,
    description: original.description || '',
    category: original.category,
    subject: original.subject,
    html_content: original.html_content,
    text_content: original.text_content,
    userId,
  });
}

/**
 * Archives a template (soft-delete): sets is_active = false and records archived_at
 */
export async function archiveTemplate(id, userId) {
  const current = await getTemplateById(id);
  if (!current) {
    throw { statusCode: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' };
  }

  const now = new Date().toISOString();
  const adminRecordId = await resolveAdminUsersRecordId(userId);

  const { error } = await supabaseAdmin
    .from('email_templates')
    .update({
      is_active: false,
      archived_at: now,
      updated_at: now,
      updated_by: adminRecordId,
    })
    .eq('id', id);

  if (error) {
    throw createDatabaseError('archiveTemplate', error);
  }

  return { id, is_active: false, archived_at: now };
}

/**
 * Restores an archived template back to active state
 */
export async function restoreTemplate(id, userId) {
  const current = await getTemplateById(id);
  if (!current) {
    throw { statusCode: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' };
  }

  const now = new Date().toISOString();
  const adminRecordId = await resolveAdminUsersRecordId(userId);

  const { error } = await supabaseAdmin
    .from('email_templates')
    .update({
      is_active: true,
      archived_at: null,
      updated_at: now,
      updated_by: adminRecordId,
    })
    .eq('id', id);

  if (error) {
    throw createDatabaseError('restoreTemplate', error);
  }

  return { id, is_active: true, archived_at: null };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCompleteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const hasSubject = typeof snapshot.subject === 'string' && snapshot.subject.trim().length > 0;
  const hasHtml = typeof snapshot.html_content === 'string' && snapshot.html_content.trim().length > 0;
  const hasText = typeof snapshot.text_content === 'string' && snapshot.text_content.trim().length > 0;
  return hasSubject && (hasHtml || hasText);
}

/**
 * Permanently deletes an email template and its owned template_versions via atomic PostgreSQL RPC.
 * Blocks deletion (HTTP 409) if any campaign depends on the live template without a complete snapshot.
 * Never cascade-deletes historical campaigns, recipients, or email attempts.
 */
export async function permanentDeleteTemplate(id, userId) {
  if (!id || !UUID_REGEX.test(String(id).trim())) {
    throw {
      statusCode: 400,
      code: 'INVALID_TEMPLATE_ID',
      message: 'Invalid template ID format. Expected a valid UUID.',
    };
  }

  const normalizedId = String(id).trim();

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('delete_email_template_permanently', {
    p_template_id: normalizedId,
    p_admin_id: userId || null,
  });

  if (!rpcError) {
    if (!rpcResult || rpcResult.success === false) {
      const code = rpcResult?.code || 'TEMPLATE_DELETE_BLOCKED';
      const statusCode = rpcResult?.status || (code === 'TEMPLATE_NOT_FOUND' ? 404 : 409);
      throw {
        statusCode,
        code,
        message: rpcResult?.error || 'Template cannot be permanently deleted.',
        details: rpcResult,
      };
    }

    return {
      id: rpcResult.deleted_id || normalizedId,
      name: rpcResult.name,
      version: rpcResult.version || 1,
      detached_campaigns: rpcResult.detached_campaigns || 0,
      deleted_versions: rpcResult.deleted_versions || 0,
    };
  }

  // Fallback ONLY if RPC function was not yet migrated into schema cache (PGRST202)
  if (rpcError.code !== 'PGRST202') {
    throw createDatabaseError('permanentDeleteTemplate.rpc', rpcError);
  }

  const current = await getTemplateById(normalizedId);
  if (!current) {
    throw { statusCode: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Email template not found or already deleted.' };
  }

  const { data: linkedCampaigns, error: campErr } = await supabaseAdmin
    .from('campaigns')
    .select('id, status, template_snapshot')
    .eq('template_id', normalizedId);

  if (campErr) {
    throw createDatabaseError('permanentDeleteTemplate.campaignsCheck', campErr);
  }

  const unsafeCampaigns = (linkedCampaigns || []).filter((c) => !isCompleteSnapshot(c.template_snapshot));
  if (unsafeCampaigns.length > 0) {
    throw {
      statusCode: 409,
      code: 'TEMPLATE_IN_USE_WITHOUT_SNAPSHOT',
      message: `Cannot permanently delete "${current.name}": ${unsafeCampaigns.length} campaign(s) still reference the live template without a complete immutable snapshot.`,
    };
  }

  if ((linkedCampaigns || []).length > 0) {
    const { error: detachErr } = await supabaseAdmin
      .from('campaigns')
      .update({ template_id: null, updated_at: new Date().toISOString() })
      .eq('template_id', normalizedId);
    if (detachErr) {
      throw createDatabaseError('permanentDeleteTemplate.detachCampaigns', detachErr);
    }
  }

  const { error: delVerErr } = await supabaseAdmin
    .from('template_versions')
    .delete()
    .eq('template_id', normalizedId);
  if (delVerErr && delVerErr.code !== 'PGRST205') {
    throw createDatabaseError('permanentDeleteTemplate.deleteVersions', delVerErr);
  }

  const { error: delTplErr } = await supabaseAdmin
    .from('email_templates')
    .delete()
    .eq('id', normalizedId);
  if (delTplErr) {
    throw createDatabaseError('permanentDeleteTemplate.deleteTemplate', delTplErr);
  }

  return {
    id: normalizedId,
    name: current.name,
    version: current.version || 1,
    detached_campaigns: (linkedCampaigns || []).length,
    deleted_versions: Array.isArray(current.versions) ? current.versions.length : 0,
  };
}
