const UNSAFE_CSS_PATTERN = /(@import|expression\s*\(|javascript:|vbscript:|behavior\s*:|url\s*\(|<|>)/i;

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'blockquote',
  'ul', 'ol', 'li',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span', 'img', 'pre', 'code',
]);

const NON_TEXT_DROP_TAGS = new Set([
  'script', 'style', 'textarea', 'option', 'noscript', 'title',
  'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'meta', 'link', 'base',
]);

const TAG_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel', 'style', 'class', 'align', 'id']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'style', 'class', 'align', 'id']),
  table: new Set(['role', 'border', 'cellpadding', 'cellspacing', 'width', 'height', 'align', 'bgcolor', 'style', 'class', 'id']),
  tr: new Set(['align', 'valign', 'bgcolor', 'style', 'class', 'id']),
  td: new Set(['align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'bgcolor', 'style', 'class', 'id']),
  th: new Set(['align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'bgcolor', 'style', 'class', 'id']),
};

const GLOBAL_ALLOWED_ATTRS = new Set(['style', 'class', 'align', 'id']);

/**
 * Sanitizes inline CSS declarations while retaining safe layout & brand styling.
 */
export function sanitizeInlineCss(rawStyle: string): string {
  if (!rawStyle || typeof rawStyle !== 'string') return '';
  return rawStyle
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl && decl.includes(':') && !UNSAFE_CSS_PATTERN.test(decl))
    .join('; ');
}

/**
 * Sanitizes stylesheet blocks extracted from <style> tags.
 */
export function sanitizeEmailCssBlock(rawCss: string): string {
  if (!rawCss || typeof rawCss !== 'string') return '';
  if (UNSAFE_CSS_PATTERN.test(rawCss)) {
    return rawCss
      .split('\n')
      .filter((line) => !UNSAFE_CSS_PATTERN.test(line))
      .join('\n')
      .trim();
  }
  return rawCss.trim();
}

/**
 * Validates hyperlink or image URL schemes, rejecting executable or unsafe schemes.
 */
export function isSafeEmailUrl(rawUrl: string): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return false;
  if (/^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/.test(trimmed)) return true;
  if (/^\/assets\/[a-zA-Z0-9_./-]+$/i.test(trimmed)) return true;
  return /^(https?:\/\/|mailto:|cid:)/i.test(trimmed);
}

/**
 * Escapes HTML special characters in interpolated dynamic string values.
 */
export function escapeHtmlValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeDomNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tagName = el.tagName.toLowerCase();

  if (NON_TEXT_DROP_TAGS.has(tagName)) {
    return null;
  }

  // Unwrap disallowed non-script container tags while keeping safe descendant text/nodes
  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = doc.createDocumentFragment();
    Array.from(el.childNodes).forEach((child) => {
      const cleanChild = sanitizeDomNode(child, doc);
      if (cleanChild) fragment.appendChild(cleanChild);
    });
    return fragment;
  }

  const cleanEl = doc.createElement(tagName);
  const allowedAttrs = TAG_ALLOWED_ATTRS[tagName] || GLOBAL_ALLOWED_ATTRS;

  Array.from(el.attributes).forEach((attr) => {
    const attrName = attr.name.toLowerCase();
    if (attrName.startsWith('on') || !allowedAttrs.has(attrName)) {
      return;
    }

    if (attrName === 'style') {
      const safeStyle = sanitizeInlineCss(attr.value);
      if (safeStyle) cleanEl.setAttribute('style', safeStyle);
      return;
    }

    if (attrName === 'href' || attrName === 'src') {
      if (isSafeEmailUrl(attr.value)) {
        cleanEl.setAttribute(attrName, attr.value.trim());
      }
      return;
    }

    cleanEl.setAttribute(attrName, attr.value);
  });

  if (tagName === 'a' && cleanEl.getAttribute('target') === '_blank') {
    cleanEl.setAttribute('rel', 'noopener noreferrer');
  }

  Array.from(el.childNodes).forEach((child) => {
    const cleanChild = sanitizeDomNode(child, doc);
    if (cleanChild) cleanEl.appendChild(cleanChild);
  });

  return cleanEl;
}

/**
 * Extracts sanitized <style> CSS rules and body markup from an email HTML string or full document.
 */
export function extractEmailDocumentParts(html: string): {
  isFullDocument: boolean;
  safeCss: string;
  bodyHtml: string;
  bodyStyle: string;
} {
  if (!html || typeof html !== 'string' || !html.trim()) {
    return { isFullDocument: false, safeCss: '', bodyHtml: '', bodyStyle: '' };
  }

  const isFullDocument = /<!doctype|<html|<head|<body/i.test(html);
  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const cleaned = sanitizeEmailCssBlock(styleMatch[1]);
    if (cleaned) styleBlocks.push(cleaned);
  }

  if (typeof DOMParser === 'undefined') {
    const stripped = html
      .replace(/<(script|style|iframe|object|embed|noscript|svg|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
    return {
      isFullDocument,
      safeCss: styleBlocks.join('\n'),
      bodyHtml: stripped.trim(),
      bodyStyle: '',
    };
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const outDoc = document.implementation.createHTMLDocument('');
  const safeContainer = outDoc.createElement('div');

  Array.from(parsed.body?.childNodes || []).forEach((child) => {
    const cleanChild = sanitizeDomNode(child, outDoc);
    if (cleanChild) safeContainer.appendChild(cleanChild);
  });

  const bodyStyle = sanitizeInlineCss(parsed.body?.getAttribute('style') || '');
  return {
    isFullDocument,
    safeCss: styleBlocks.join('\n'),
    bodyHtml: safeContainer.innerHTML.trim(),
    bodyStyle,
  };
}

/**
 * Client-side HTML sanitizer mirroring backend EMAIL_SANITIZE_OPTIONS for safe live previewing.
 */
export function sanitizeClientEmailHtml(html: string): string {
  const { isFullDocument, safeCss, bodyHtml, bodyStyle } = extractEmailDocumentParts(html);
  if (!bodyHtml) return '';

  if (isFullDocument) {
    const styleTag = safeCss ? `\n  <style>\n${safeCss}\n  </style>` : '';
    const resolvedBodyStyle =
      bodyStyle ||
      "margin:0;padding:0;background-color:#F4F6FA;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:#1E293B;-webkit-font-smoothing:antialiased;";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">${styleTag}
</head>
<body style="${resolvedBodyStyle}">
${bodyHtml}
</body>
</html>`;
  }

  return safeCss ? `<style>\n${safeCss}\n</style>\n${bodyHtml}` : bodyHtml;
}
