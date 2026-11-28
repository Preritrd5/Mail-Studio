const PLACEHOLDER_REGEX = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/;
const HELLO_GREETING_ONLY_REGEX = /^Hello(?:\s+([^,\n<>]+?))?,$/i;
const HELLO_GREETING_INLINE_REGEX = /^(Hello)(\s+([^,\n<>]+?))?,\s+([\s\S]+)$/i;

export interface SplitGreetingResult {
  hasGreeting: boolean;
  greetingName: string;
  bodyText: string;
}

function escapeHtmlText(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shouldSplitSameLineContinuation(remainder: string): boolean {
  const trimmed = remainder.trim();
  if (!trimmed) return false;
  // Keep lowercase inline sentence continuations intact (e.g. "Hello Prerit, your role is ...")
  const firstChar = trimmed.charAt(0);
  if (/[a-z]/.test(firstChar)) {
    return false;
  }
  // Uppercase start, numbers, punctuation, or non-ASCII / emojis (e.g. "🚀 Welcome...", "Welcome...") start a new paragraph
  return true;
}

/**
 * Detects a leading "Hello <name>," greeting at the start of raw message text
 * and separates it from the message body whether separated by blank lines,
 * a single newline, or inline on the same line (e.g. "Hello Adarsh, 🚀 Welcome...").
 */
export function splitLeadingHelloGreeting(rawMessage: string): SplitGreetingResult {
  const normalized = String(rawMessage || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { hasGreeting: false, greetingName: '', bodyText: '' };
  }

  const firstNewlineIdx = normalized.indexOf('\n');
  const firstLine = (firstNewlineIdx >= 0 ? normalized.slice(0, firstNewlineIdx) : normalized).trim();
  const afterFirstLine = firstNewlineIdx >= 0 ? normalized.slice(firstNewlineIdx + 1).replace(/^\n+/, '') : '';

  const exactLineMatch = firstLine.match(HELLO_GREETING_ONLY_REGEX);
  if (exactLineMatch) {
    return {
      hasGreeting: true,
      greetingName: (exactLineMatch[1] || '').trim(),
      bodyText: afterFirstLine.trim(),
    };
  }

  const inlineMatch = firstLine.match(HELLO_GREETING_INLINE_REGEX);
  if (inlineMatch && shouldSplitSameLineContinuation(inlineMatch[4] || '')) {
    const inlineBody = (inlineMatch[4] || '').trim();
    const combinedBody = afterFirstLine ? `${inlineBody}\n\n${afterFirstLine}` : inlineBody;
    return {
      hasGreeting: true,
      greetingName: (inlineMatch[3] || '').trim(),
      bodyText: combinedBody.trim(),
    };
  }

  return {
    hasGreeting: false,
    greetingName: '',
    bodyText: normalized,
  };
}

/**
 * Formats an escaped greeting line HTML paragraph with ONLY the recipient name bolded.
 * Handles empty/unavailable names gracefully without rendering unresolved placeholder syntax.
 */
export function buildFormattedHelloParagraphHtml(
  rawName: string,
  paragraphStyle = 'margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: #1E293B; text-align: left;'
): string {
  const trimmedName = String(rawName || '').trim();
  if (!trimmedName || trimmedName === '[Recipient Name]') {
    // Allow live templates keeping {{recipient_name}} token intact until interpolation,
    // or graceful "Hello," when rendered with no available recipient name.
    if (trimmedName && PLACEHOLDER_REGEX.test(trimmedName)) {
      return `<p style="${paragraphStyle}">Hello <strong>${escapeHtmlText(trimmedName)}</strong>,</p>`;
    }
    return `<p style="${paragraphStyle}">Hello,</p>`;
  }

  return `<p style="${paragraphStyle}">Hello <strong>${escapeHtmlText(trimmedName)}</strong>,</p>`;
}

/**
 * Converts message text (possibly starting with "Hello {{recipient_name}}, ..." or raw paragraphs)
 * into properly separated `<p>` paragraphs with bold greeting recipient name and clean spacing.
 */
export function formatMessageBodyToEmailHtml(
  rawMessage: string,
  options: {
    placeholderValues?: Record<string, string>;
    emptyPlaceholder?: string;
    paragraphStyle?: string;
  } = {}
): string {
  const paragraphStyle =
    options.paragraphStyle ||
    'margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: #1E293B; text-align: left;';
  const normalized = String(rawMessage || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return options.emptyPlaceholder ?? '<p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #94A3B8;">Message body preview...</p>';
  }

  const split = splitLeadingHelloGreeting(normalized);
  const paragraphs: string[] = [];

  if (split.hasGreeting) {
    let resolvedGreetingName = split.greetingName;
    if (options.placeholderValues && /\{\{\s*recipient_name\s*\}\}/i.test(resolvedGreetingName)) {
      const val = (options.placeholderValues.recipient_name || '').trim();
      resolvedGreetingName = val === '[Recipient Name]' ? '' : val;
    }
    paragraphs.push(buildFormattedHelloParagraphHtml(resolvedGreetingName, paragraphStyle));
  }

  const remainingText = split.hasGreeting ? split.bodyText : normalized;
  if (remainingText) {
    const blocks = remainingText.split(/\n{2,}/);
    for (const block of blocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;
      let blockHtml = escapeHtmlText(trimmedBlock).replace(/\n/g, '<br>');
      if (options.placeholderValues) {
        for (const [key, rawVal] of Object.entries(options.placeholderValues)) {
          const val = String(rawVal || '');
          const safeVal =
            key === 'activation_link'
              ? val.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
              : escapeHtmlText(val);
          blockHtml = blockHtml.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), safeVal);
        }
      }
      paragraphs.push(`<p style="${paragraphStyle}">${blockHtml}</p>`);
    }
  }

  return paragraphs.join('\n');
}

/**
 * Normalizes plain text messages so any leading greeting sits on its own line
 * followed by a blank line before the message body.
 */
export function normalizeGreetingPlainText(rawMessage: string): string {
  const split = splitLeadingHelloGreeting(rawMessage);
  if (!split.hasGreeting) {
    return String(rawMessage || '').replace(/\r\n/g, '\n').trim();
  }

  const trimmedName = split.greetingName.trim();
  const greetingLine =
    !trimmedName || trimmedName === '[Recipient Name]' ? 'Hello,' : `Hello ${trimmedName},`;

  return split.bodyText ? `${greetingLine}\n\n${split.bodyText}` : greetingLine;
}
