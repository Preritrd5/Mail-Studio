import sanitizeHtml from 'sanitize-html';

const UNSAFE_CSS_PATTERN = /(@import|expression\s*\(|javascript:|vbscript:|behavior\s*:|url\s*\(|<|>)/i;

/**
 * Sanitizes inline style attribute declarations, stripping unsafe CSS functions or URLs
 * while retaining safe email styling (colors, typography, layout, spacing, borders).
 */
function sanitizeInlineStyleAttribute(rawStyle) {
  if (!rawStyle || typeof rawStyle !== 'string') return '';
  return rawStyle
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl && decl.includes(':') && !UNSAFE_CSS_PATTERN.test(decl))
    .join('; ');
}

/**
 * Shared HTML sanitization configuration preserving table-based email layouts,
 * inline CSS, CID inline logo references, and responsive styles while stripping
 * scripts, frames, event handlers, and unsafe URL schemes.
 */
export const EMAIL_SANITIZE_OPTIONS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote',
    'ul', 'ol', 'li',
    'b', 'strong', 'i', 'em', 'u', 's', 'strike',
    'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'div', 'span', 'img', 'pre', 'code'
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel', 'style', 'class'],
    'img': ['src', 'alt', 'title', 'width', 'height', 'style', 'class'],
    'table': ['role', 'border', 'cellpadding', 'cellspacing', 'width', 'height', 'align', 'bgcolor', 'style', 'class'],
    'tr': ['align', 'valign', 'bgcolor', 'style', 'class'],
    'td': ['align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'bgcolor', 'style', 'class'],
    'th': ['align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'bgcolor', 'style', 'class'],
    '*': ['style', 'class', 'align', 'id']
  },
  transformTags: {
    '*': (tagName, attribs) => {
      if (attribs && attribs.style) {
        const cleanStyle = sanitizeInlineStyleAttribute(attribs.style);
        if (cleanStyle) {
          attribs.style = cleanStyle;
        } else {
          delete attribs.style;
        }
      }
      return { tagName, attribs };
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'cid'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Prevent inner text of stripped head/title/style/script tags from leaking into email body
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'],
};

/**
 * Sanitizes CSS extracted from <style> blocks, keeping only safe layout and responsive media rules.
 */
function sanitizeEmailCssBlock(rawCss) {
  if (!rawCss || typeof rawCss !== 'string') return '';
  // Block dangerous CSS constructs: external imports, expressions, javascript URLs, behaviors, HTML tag breakouts
  if (UNSAFE_CSS_PATTERN.test(rawCss)) {
    // Strip offending lines/rules defensively rather than keeping unsafe CSS
    const lines = rawCss.split('\n').filter(
      (line) => !UNSAFE_CSS_PATTERN.test(line)
    );
    return lines.join('\n').trim();
  }
  return rawCss.trim();
}

/**
 * Extracts body inner HTML and safe <style> rules if input is a full HTML document.
 */
function extractStyleAndBody(html) {
  if (!html || typeof html !== 'string') {
    return { isFullDocument: false, safeStyleCss: '', bodyInput: '' };
  }

  const isFullDocument = /<!doctype|<html|<head|<body/i.test(html);
  const styleMatches = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRegex.exec(html)) !== null) {
    const cleaned = sanitizeEmailCssBlock(m[1]);
    if (cleaned) styleMatches.push(cleaned);
  }

  let bodyInput = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    bodyInput = bodyMatch[1];
  } else {
    // Strip head block cleanly if no explicit body tag exists
    bodyInput = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  }

  return {
    isFullDocument,
    safeStyleCss: styleMatches.join('\n'),
    bodyInput,
  };
}

/**
 * Sanitizes email HTML safely for both editor preview and outgoing SMTP dispatch.
 * Preserves table email formatting and responsive styles when full document structure is used.
 */
export function sanitizeEmailHtml(html) {
  if (!html || typeof html !== 'string') return '';

  const { isFullDocument, safeStyleCss, bodyInput } = extractStyleAndBody(html);
  const sanitizedBody = sanitizeHtml(bodyInput, EMAIL_SANITIZE_OPTIONS).trim();

  if (!sanitizedBody) return '';

  // Reconstruct valid full email document if input was a complete email template or structured card
  if (isFullDocument) {
    const styleTag = safeStyleCss ? `\n  <style>\n${safeStyleCss}\n  </style>` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${styleTag}
</head>
<body style="margin:0;padding:0;background-color:#F4F6FA;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:#1E293B;-webkit-font-smoothing:antialiased;">
${sanitizedBody}
</body>
</html>`;
  }

  return sanitizedBody;
}
