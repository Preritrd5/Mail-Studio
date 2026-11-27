import crypto from 'node:crypto';
import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';

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
    created_by: userId || null,
    updated_by: userId || null,
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
    created_by: userId || null,
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

  const updatedRecord = {
    name: name !== undefined ? name.trim() : current.name,
    description: description !== undefined ? description.trim() : current.description,
    category: category !== undefined ? category : current.category,
    subject: subject !== undefined ? subject.trim() : current.subject,
    html_content: html_content !== undefined ? html_content : current.html_content,
    text_content: text_content !== undefined ? text_content : current.text_content,
    version: nextVersion,
    updated_at: now,
    updated_by: userId || null,
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
    created_by: userId || null,
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

  const { error } = await supabaseAdmin
    .from('email_templates')
    .update({
      is_active: false,
      archived_at: now,
      updated_at: now,
      updated_by: userId || null,
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

  const { error } = await supabaseAdmin
    .from('email_templates')
    .update({
      is_active: true,
      archived_at: null,
      updated_at: now,
      updated_by: userId || null,
    })
    .eq('id', id);

  if (error) {
    throw createDatabaseError('restoreTemplate', error);
  }

  return { id, is_active: true, archived_at: null };
}
