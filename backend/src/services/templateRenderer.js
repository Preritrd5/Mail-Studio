import { PLACEHOLDER_REGISTRY, inspectPlaceholders } from './placeholderRegistry.js';
import { sanitizeEmailHtml } from '../utils/emailHtmlSanitizer.js';
import { sanitizeSubjectHeader } from '../validators/emailValidator.js';
import { getTemplateByIdAndVersion } from '../repositories/templateRepository.js';

/**
 * Escapes unsafe HTML characters to prevent XSS and template injection
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns default sample placeholder values for preview rendering
 */
export function getSamplePreviewContext() {
  const context = {};
  for (const [key, meta] of Object.entries(PLACEHOLDER_REGISTRY)) {
    context[key] = meta.sampleValue;
  }
  return context;
}

/**
 * Derives a clean, readable plain-text email representation from HTML when text_content is absent.
 */
export function htmlToPlainTextFallback(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      return cleanText && !cleanText.includes(href) ? `${cleanText}: ${href}` : href;
    })
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|h4|h5|h6|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&copy;/gi, '©')
    .replace(/&rarr;/gi, '->')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Normalizes any leading plain-text "Hello <Name>, <Body>" line so the greeting sits on
 * its own line separated by a blank line, while preserving multi-line text already formatted.
 */
export function normalizeGreetingPlainText(text) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  const firstNewlineIdx = trimmed.indexOf('\n');
  if (firstNewlineIdx >= 0) {
    // Greeting and subsequent lines already occupy separate lines
    return trimmed;
  }

  const inlineMatch = trimmed.match(/^(Hello(?:\s+[^,\n]+?)?),\s+([\s\S]+)$/i);
  if (!inlineMatch) return trimmed;

  const greetingPart = inlineMatch[1].trim();
  const remainder = inlineMatch[2].trim();
  if (!remainder || /^[a-z]/.test(remainder)) {
    return trimmed;
  }

  return `${greetingPart},\n\n${remainder}`;
}

/**
 * Normalizes a leading <p>Hello {{recipient_name}}, ...</p> paragraph in email HTML so:
 * - "Hello" and comma stay normal weight while ONLY recipient name is <strong>
 * - Greeting appears in its own <p> and message body starts in a separate <p> below
 * - Never duplicates an existing greeting or alters lowercase sentence continuations
 */
export function normalizeLeadingGreetingHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let updated = false;

  return html.replace(/<p(\b[^>]*)>([\s\S]*?)<\/p>/gi, (fullMatch, attrs, innerHtml) => {
    if (updated) return fullMatch;

    const normalizedInner = String(innerHtml || '').trim();
    const match = normalizedInner.match(
      /^(?:<strong>\s*)?Hello(?:\s*<\/strong>)?(?:\s+(?:<strong>\s*)?([^,<]+?)(?:\s*<\/strong>)?)?\s*,([\s\S]*)$/i
    );
    if (!match) return fullMatch;

    const rawName = (match[1] || '').trim();
    const afterCommaRaw = match[2] || '';
    const hadExplicitBreak = /^\s*<br\s*\/?>/i.test(afterCommaRaw);
    const afterComma = afterCommaRaw.replace(/^(?:\s*<br\s*\/?>\s*)+/i, '').trim();
    const plainAfter = afterComma.replace(/<[^>]+>/g, '').trim();

    if (!hadExplicitBreak && plainAfter && /^[a-z]/.test(plainAfter)) {
      return fullMatch;
    }

    updated = true;
    const styleMatch = String(attrs || '').match(/style\s*=\s*"([^"]*)"/i);
    const pStyle =
      styleMatch?.[1] ||
      'margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: #1E293B; text-align: left;';

    const greetingHtml = rawName
      ? `<p style="${pStyle}">Hello <strong>${rawName}</strong>,</p>`
      : `<p style="${pStyle}">Hello,</p>`;

    if (afterComma) {
      return `${greetingHtml}\n<p style="${pStyle}">${afterComma}</p>`;
    }
    return greetingHtml;
  });
}

/**
 * Renders subject lines and plain text content with dynamic values.
 * When strict === true, rejects any remaining unsupported/unresolved placeholders instead of sending literal syntax.
 */
export function renderTemplateText(templateText, userValues = {}, { strict = false } = {}) {
  if (!templateText || typeof templateText !== 'string') return '';

  let output = templateText;

  for (const [key, meta] of Object.entries(PLACEHOLDER_REGISTRY)) {
    const rawVal = userValues[key] !== undefined && userValues[key] !== null && String(userValues[key]).trim() !== ''
      ? userValues[key]
      : meta.defaultFallback;
    const cleanVal = meta.sanitize(rawVal);
    // Replace all case-insensitive/spaced instances of this token
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    output = output.replace(regex, cleanVal);
  }

  // Detect any remaining unsupported/unresolved tokens
  const { unsupported } = inspectPlaceholders(output);
  if (unsupported.length > 0) {
    if (strict) {
      throw {
        statusCode: 422,
        code: 'UNRESOLVED_PLACEHOLDERS',
        message: `Unresolved or unsupported placeholders detected in text/subject: ${unsupported.join(', ')}`,
        details: unsupported,
      };
    }
    for (const unk of unsupported) {
      output = output.split(unk).join(`[UNRESOLVED: ${unk}]`);
    }
  }

  return normalizeGreetingPlainText(output);
}

/**
 * Renders HTML email content with safe variable interpolation, preserved design tables, and XSS protection.
 * When strict === true, rejects any remaining unresolved placeholders instead of sending literal syntax.
 */
export function renderTemplateHtml(templateHtml, userValues = {}, { strict = false } = {}) {
  if (!templateHtml || typeof templateHtml !== 'string') return '';

  // 1. First sanitize base HTML template structure and normalize any leading greeting paragraph
  let workingHtml = normalizeLeadingGreetingHtml(sanitizeEmailHtml(templateHtml));

  // 2. Interpolate dynamic placeholders
  for (const [key, meta] of Object.entries(PLACEHOLDER_REGISTRY)) {
    const rawVal = userValues[key] !== undefined && userValues[key] !== null && String(userValues[key]).trim() !== ''
      ? userValues[key]
      : meta.defaultFallback;

    const sanitizedVal = meta.sanitize(rawVal);
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');

    if (key === 'activation_link') {
      // Validated URL: escape quotes and inject
      const escapedUrl = sanitizedVal.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      workingHtml = workingHtml.replace(regex, escapedUrl);
    } else {
      // Text variables: strictly escape HTML entities
      const escapedText = escapeHtml(sanitizedVal);
      workingHtml = workingHtml.replace(regex, escapedText);
    }
  }

  // 3. Detect unresolved tokens
  const { unsupported } = inspectPlaceholders(workingHtml);
  if (unsupported.length > 0) {
    if (strict) {
      throw {
        statusCode: 422,
        code: 'UNRESOLVED_PLACEHOLDERS',
        message: `Unresolved or unsupported placeholders detected in HTML template: ${unsupported.join(', ')}`,
        details: unsupported,
      };
    }
    for (const unk of unsupported) {
      workingHtml = workingHtml.split(unk).join(`<span style="color:#DC2626; background-color:#FEE2E2; padding:2px 4px; border-radius:4px; font-family:monospace; font-size:11px;">[UNRESOLVED: ${escapeHtml(unk)}]</span>`);
    }
  }

  // 4. Final sanitization pass to guarantee 0 script execution
  return sanitizeEmailHtml(workingHtml);
}

/**
 * Shared server-side rendering engine powering Previews, Individual Sending, and Bulk Queue.
 * Guarantees exact saved template version traceability and prevents silent plain-text fallbacks.
 */
export async function renderEmailFromTemplate({
  templateId = null,
  templateVersion = null,
  subjectOverride = null,
  htmlOverride = null,
  textOverride = null,
  recipientData = {},
  requireHtml = true,
  strict = true,
}) {
  let resolvedTemplate = null;

  if (templateId) {
    resolvedTemplate = await getTemplateByIdAndVersion(templateId, templateVersion);
    if (!resolvedTemplate) {
      throw {
        statusCode: 404,
        code: templateVersion ? 'TEMPLATE_VERSION_NOT_FOUND' : 'TEMPLATE_NOT_FOUND',
        message: templateVersion
          ? `Requested template (${templateId}) version v${templateVersion} was not found. Cannot substitute an alternate version.`
          : `Requested template (${templateId}) could not be found.`,
      };
    }
  }

  const hasSubjectOverride = typeof subjectOverride === 'string' && subjectOverride.trim().length > 0;
  const hasHtmlOverride = typeof htmlOverride === 'string' && htmlOverride.trim().length > 0;
  const hasTextOverride = typeof textOverride === 'string' && textOverride.trim().length > 0;

  const rawSubject = hasSubjectOverride ? subjectOverride : (resolvedTemplate?.subject || '');
  const rawHtml = hasHtmlOverride ? htmlOverride : (resolvedTemplate?.html_content || '');
  const rawText = hasTextOverride ? textOverride : (resolvedTemplate?.text_content || '');

  if (requireHtml && (!rawHtml || !rawHtml.trim())) {
    throw {
      statusCode: 422,
      code: 'MISSING_HTML_CONTENT',
      message: 'Selected HTML template contains no valid HTML content. Aborting send to prevent silent plain-text fallback.',
    };
  }

  // Normalize context ensuring SNPSUNEXUS brand defaults
  const context = {
    recipient_name: recipientData.recipient_name,
    recipient_email: recipientData.recipient_email,
    institution_name: recipientData.institution_name || 'SNPSUNEXUS',
    designation: recipientData.designation || 'Member',
    activation_link: recipientData.activation_link || 'https://snpsunexus.vercel.app/verify',
    current_year: recipientData.current_year || String(new Date().getFullYear()),
  };

  // Strict missing required values check if subject/html needs them
  if (strict && (!context.recipient_name || !String(context.recipient_name).trim())) {
    throw {
      statusCode: 422,
      code: 'MISSING_RECIPIENT_NAME',
      message: 'Recipient name is required to render personalization placeholders.',
    };
  }

  const renderedSubject = sanitizeSubjectHeader(
    renderTemplateText(rawSubject, context, { strict })
  );

  if (!renderedSubject) {
    throw {
      statusCode: 422,
      code: 'EMPTY_SUBJECT_AFTER_RENDER',
      message: 'Rendered subject line is empty after interpolation.',
    };
  }

  const renderedHtml = rawHtml ? renderTemplateHtml(rawHtml, context, { strict }) : '';

  if (requireHtml && (!renderedHtml || renderedHtml.trim().length < 20)) {
    throw {
      statusCode: 422,
      code: 'UNUSABLE_HTML_AFTER_SANITIZATION',
      message: 'Rendered HTML content became empty or unusable after sanitization. Aborting send to preserve design integrity.',
    };
  }

  const renderedTextSource = rawText && rawText.trim()
    ? renderTemplateText(rawText, context, { strict: false })
    : htmlToPlainTextFallback(renderedHtml);

  const renderedText = renderedTextSource || `${renderedSubject}\n\nRecipient: ${context.recipient_name}`;

  return {
    templateId: resolvedTemplate?.id || templateId || null,
    templateVersion: resolvedTemplate?.version || templateVersion || null,
    templateName: resolvedTemplate?.name || 'Custom Email',
    templateSnapshot: resolvedTemplate
      ? {
          id: resolvedTemplate.id,
          name: resolvedTemplate.name,
          category: resolvedTemplate.category || 'General Notifications',
          version: resolvedTemplate.version || 1,
          subject: rawSubject,
          html_content: rawHtml,
          text_content: rawText || '',
        }
      : {
          id: null,
          name: 'Custom Email',
          category: 'Custom',
          version: 1,
          subject: rawSubject,
          html_content: rawHtml,
          text_content: rawText || '',
        },
    renderedSubject,
    renderedHtml,
    renderedText,
    diagnostics: {
      template_id: resolvedTemplate?.id || templateId || null,
      template_version: resolvedTemplate?.version || templateVersion || null,
      html_bytes: Buffer.byteLength(renderedHtml || '', 'utf8'),
      text_bytes: Buffer.byteLength(renderedText || '', 'utf8'),
      rendering_outcome: 'rendered_ok',
    },
  };
}
