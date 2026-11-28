import { splitLeadingHelloGreeting } from './greetingFormatter';

function escapeHtmlKeepSafeText(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSignatureContainer(el: Element): boolean {
  const txt = (el.textContent || '').trim();
  if (!txt || txt.length > 260) return false;
  return /^(best regards|warm regards|regards|sincerely|kind regards|thank you)/i.test(txt);
}

function isInteractiveOrStructuredCard(el: Element): boolean {
  // Preserve structured 2-column info cards or CTA button blocks intact inside templates
  if (el.querySelector('.two-col-cell')) return true;
  if (el.tagName.toLowerCase() === 'a') {
    const s = (el.getAttribute('style') || '').toLowerCase();
    if (s.includes('background') && s.includes('padding')) return true;
  }
  const anchors = el.querySelectorAll('a');
  if (anchors.length === 1 && el.querySelectorAll('p').length === 0) {
    const aStyle = (anchors[0].getAttribute('style') || '').toLowerCase();
    const elLen = (el.textContent || '').trim().length;
    const aLen = (anchors[0].textContent || '').trim().length;
    if ((aStyle.includes('background') || anchors[0].classList.contains('btn-link')) && elLen <= aLen + 12) {
      return true;
    }
  }
  return false;
}

function findTemplateContentCell(doc: Document): Element | null {
  const explicit = doc.querySelector('td.email-content-padding, .email-content-padding');
  if (explicit) return explicit;

  const container = doc.querySelector('table.email-container, .email-container, table.main-container, .main-container');
  if (container) {
    const topRows = Array.from(container.querySelectorAll(':scope > tbody > tr, :scope > tr'));
    for (const tr of topRows) {
      const txt = (tr.textContent || '').trim();
      const td = tr.querySelector(':scope > td');
      if (!td) continue;
      const tdStyle = (td.getAttribute('style') || '').toLowerCase();
      if (td.querySelector('img[src*="snpsunexus-logo"]') && /Smarter Communication/i.test(txt)) continue;
      if ((tdStyle.includes('#172e58') || tdStyle.includes('rgb(23, 46, 88)')) && /all rights reserved|©/i.test(txt)) continue;
      if (td.querySelector('h1') && (tdStyle.includes('#172e58') || tdStyle.includes('rgb(23, 46, 88)'))) continue;
      return td;
    }
  }

  return doc.body || null;
}

function extractTextWithNewlines(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

/**
 * Extracts editable message text from saved HTML templates so the Compose textarea
 * reflects the actual loaded template copy.
 */
export function extractEditableMessageFromTemplateHtml(html: string): string {
  if (!html || typeof html !== 'string' || !html.trim()) return '';
  if (typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cell = findTemplateContentCell(doc);
  if (!cell) return '';

  const parts: string[] = [];
  const children = Array.from(cell.children);

  if (children.length === 0) {
    return extractTextWithNewlines(cell);
  }

  for (const child of children) {
    if (isSignatureContainer(child)) continue;
    if (isInteractiveOrStructuredCard(child)) continue;
    const text = extractTextWithNewlines(child);
    if (text) parts.push(text);
  }

  return parts.join('\n\n').trim();
}

/**
 * Synchronizes edits typed in the Compose Message Content textarea directly into
 * a readymade HTML template's editable body section while preserving its branded
 * header, hero banner, structured cards, CTA button, signature, and footer.
 */
export function syncMessageBodyIntoTemplateHtml(
  templateHtml: string,
  editedMessage: string
): string {
  if (!templateHtml || typeof templateHtml !== 'string' || !templateHtml.trim()) {
    return templateHtml;
  }
  if (typeof DOMParser === 'undefined') {
    return templateHtml;
  }

  const doc = new DOMParser().parseFromString(templateHtml, 'text/html');
  const cell = findTemplateContentCell(doc);
  if (!cell) return templateHtml;

  const existingChildren = Array.from(cell.children);
  const trailingNodes: Element[] = [];
  const headingOrPreNodes: Element[] = [];

  for (const child of existingChildren) {
    if (isInteractiveOrStructuredCard(child) || isSignatureContainer(child)) {
      trailingNodes.push(child.cloneNode(true) as Element);
    }
  }

  // Build styled paragraph elements matching SNPSUNEXUS card typography
  const paragraphsContainer = doc.createDocumentFragment();
  const normalizedText = String(editedMessage || '').replace(/\r\n/g, '\n').trim();
  const P_STYLE = 'margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: #1E293B; text-align: left;';

  if (!normalizedText) {
    const emptyP = doc.createElement('p');
    emptyP.setAttribute('style', 'margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #94A3B8;');
    emptyP.textContent = 'Message body preview...';
    paragraphsContainer.appendChild(emptyP);
  } else {
    const split = splitLeadingHelloGreeting(normalizedText);

    if (split.hasGreeting) {
      const greetingP = doc.createElement('p');
      greetingP.setAttribute('style', P_STYLE);
      if (split.greetingName) {
        greetingP.appendChild(doc.createTextNode('Hello '));
        const strongEl = doc.createElement('strong');
        strongEl.textContent = split.greetingName;
        greetingP.appendChild(strongEl);
        greetingP.appendChild(doc.createTextNode(','));
      } else {
        greetingP.textContent = 'Hello,';
      }
      paragraphsContainer.appendChild(greetingP);
    }

    const remainingBody = split.hasGreeting ? split.bodyText : normalizedText;
    if (remainingBody) {
      const blocks = remainingBody.split(/\n{2,}/);
      blocks.forEach((blockText) => {
        const p = doc.createElement('p');
        p.setAttribute('style', P_STYLE);
        const lines = blockText.split('\n');
        lines.forEach((line, lIdx) => {
          p.appendChild(doc.createTextNode(line));
          if (lIdx < lines.length - 1) {
            p.appendChild(doc.createElement('br'));
          }
        });
        paragraphsContainer.appendChild(p);
      });
    }
  }

  // Replace editable text children in cell while preserving structured cards / buttons / signature cleanly
  cell.innerHTML = '';
  headingOrPreNodes.forEach((n) => cell.appendChild(n));
  cell.appendChild(paragraphsContainer);
  trailingNodes.forEach((n) => cell.appendChild(n));

  if (/<!doctype/i.test(templateHtml)) {
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  }
  return doc.body.innerHTML;
}

/**
 * Safely encodes HTML characters in dynamically interpolated preview strings.
 */
export function escapeComposeHtmlText(val: string): string {
  return escapeHtmlKeepSafeText(val);
}
