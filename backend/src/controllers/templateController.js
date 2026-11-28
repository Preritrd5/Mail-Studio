import * as templateRepo from '../repositories/templateRepository.js';
import { validateAndSanitizeTemplate } from '../validators/templateValidator.js';
import { PLACEHOLDER_REGISTRY, inspectPlaceholders } from '../services/placeholderRegistry.js';
import { renderTemplateHtml, renderTemplateText, getSamplePreviewContext, htmlToPlainTextFallback } from '../services/templateRenderer.js';
import { config } from '../config/env.js';

export async function getTemplates(req, res, next) {
  try {
    const { search, category, status = 'active', page = 1, limit = 50 } = req.query;
    const result = await templateRepo.listTemplates({
      search,
      category,
      status,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const template = await templateRepo.getTemplateById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: template,
    });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const sanitized = validateAndSanitizeTemplate(req.body, false);
    const actorId = req.admin?.id || req.user?.id || null;

    const newTemplate = await templateRepo.createTemplate({
      ...sanitized,
      userId: actorId,
    });

    return res.status(201).json({
      success: true,
      message: 'Template created successfully.',
      data: newTemplate,
      warnings: sanitized.unsupportedPlaceholders.length > 0 ? {
        unsupported_tokens: sanitized.unsupportedPlaceholders,
      } : undefined,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const sanitized = validateAndSanitizeTemplate(req.body, true);
    const actorId = req.admin?.id || req.user?.id || null;

    const updated = await templateRepo.updateTemplate(id, {
      ...sanitized,
      userId: actorId,
    });

    return res.status(200).json({
      success: true,
      message: `Template updated to version v${updated.version}.`,
      data: updated,
      warnings: sanitized.unsupportedPlaceholders?.length > 0 ? {
        unsupported_tokens: sanitized.unsupportedPlaceholders,
      } : undefined,
    });
  } catch (err) {
    next(err);
  }
}

export async function duplicateTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const { new_name } = req.body || {};
    const actorId = req.admin?.id || req.user?.id || null;

    const copy = await templateRepo.duplicateTemplate(id, {
      newName: new_name,
      userId: actorId,
    });

    return res.status(201).json({
      success: true,
      message: 'Template duplicated successfully.',
      data: copy,
    });
  } catch (err) {
    next(err);
  }
}

export async function archiveTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const actorId = req.admin?.id || req.user?.id || null;
    const result = await templateRepo.archiveTemplate(id, actorId);

    return res.status(200).json({
      success: true,
      message: 'Template successfully archived. Historical campaign references are preserved.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function restoreTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const actorId = req.admin?.id || req.user?.id || null;
    const result = await templateRepo.restoreTemplate(id, actorId);

    return res.status(200).json({
      success: true,
      message: 'Template successfully restored to active gallery.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteTemplate(req, res, next) {
  try {
    const { id } = req.params;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'admin_id')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ACTOR_OVERRIDE',
          message: 'Client-supplied admin_id is not allowed. Actor identity is derived from verified authentication.',
        },
      });
    }

    const userId = req.user?.id;
    const result = await templateRepo.permanentDeleteTemplate(id, userId);

    return res.status(200).json({
      success: true,
      message: `Template "${result.name}" (v${result.version}) permanently deleted. Historical campaign snapshots and audit logs remain preserved.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function previewTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const requestedVersion = req.body?.version ?? req.query?.version ?? null;
    let subject = req.body?.subject || '';
    let htmlContent = req.body?.html_content || '';
    let textContent = req.body?.text_content || '';
    const userContext = req.body?.context || req.body?.variables || {};

    if (id) {
      const stored = await templateRepo.getTemplateByIdAndVersion(id, requestedVersion);
      if (!stored) {
        return res.status(404).json({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: 'Requested template version not found.' },
        });
      }
      subject = typeof req.body?.subject === 'string' ? req.body.subject : (stored.subject || '');
      htmlContent = typeof req.body?.html_content === 'string' ? req.body.html_content : (stored.html_content || '');
      textContent = typeof req.body?.text_content === 'string' ? req.body.text_content : (stored.text_content || '');
    }

    const sampleContext = getSamplePreviewContext();
    const effectiveContext = { ...sampleContext, ...userContext };

    const renderedSubject = renderTemplateText(subject, effectiveContext, { strict: false });
    const renderedHtml = renderTemplateHtml(htmlContent, effectiveContext, { strict: false });
    const renderedText = textContent && textContent.trim()
      ? renderTemplateText(textContent, effectiveContext, { strict: false })
      : htmlToPlainTextFallback(renderedHtml);

    const inspection = inspectPlaceholders(`${subject} ${htmlContent} ${textContent}`);
    const unresolvedInspection = inspectPlaceholders(`${renderedSubject} ${renderedHtml} ${renderedText}`);

    return res.status(200).json({
      success: true,
      data: {
        subject: renderedSubject,
        rendered_subject: renderedSubject,
        html_content: renderedHtml,
        rendered_html: renderedHtml,
        text_content: renderedText,
        rendered_text: renderedText,
        context: effectiveContext,
        sender_identity: {
          name: config.senderName,
          email: config.gmailUser || null,
        },
        unsupported_tokens: inspection.unsupported,
        unsupported_placeholders: inspection.unsupported,
        unresolved_placeholders: unresolvedInspection.found,
      },
    });
  } catch (err) {
    next(err);
  }
}

export function getPlaceholders(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      placeholders: Object.values(PLACEHOLDER_REGISTRY),
      sample_context: getSamplePreviewContext(),
    },
  });
}
