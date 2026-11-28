import { EmailBlock, InfoCardField } from '../types';

export interface ParseHtmlResult {
  blocks: EmailBlock[];
  isStructuredTemplate: boolean;
  isCustomRawHtml: boolean;
  reason?: string;
}

let blockCounter = 0;
function nextBlockId(prefix: string): string {
  blockCounter += 1;
  return `blk-${prefix}-${Date.now()}-${blockCounter}`;
}

function normalizeColorHex(color: string | null | undefined, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.toUpperCase();
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgbMatch) return fallback;
  const hex = [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
    .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex.toUpperCase()}`;
}

function parseAlignFromStyle(el: Element): 'left' | 'center' | 'right' {
  const alignAttr = el.getAttribute('align')?.toLowerCase();
  if (alignAttr === 'center' || alignAttr === 'right' || alignAttr === 'left') {
    return alignAttr;
  }
  const style = (el.getAttribute('style') || '').toLowerCase();
  if (/text-align\s*:\s*center/.test(style) || /margin\s*:\s*0\s+auto/.test(style)) return 'center';
  if (/text-align\s*:\s*right/.test(style)) return 'right';
  return 'left';
}

function getInlineTextWithBreaks(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

function isBrandHeaderRow(tr: Element): boolean {
  const text = (tr.textContent || '').trim();
  const hasLogo = Boolean(tr.querySelector('img[src*="snpsunexus-logo"]'));
  return (
    (hasLogo && /Smarter Communication/i.test(text)) ||
    (/SNPSUNEXUS/i.test(text) && /Smarter Communication\. Greater Impact\./i.test(text))
  );
}

function isBrandFooterRow(tr: Element): boolean {
  const text = (tr.textContent || '').trim();
  const td = tr.querySelector('td');
  const style = `${tr.getAttribute('style') || ''} ${td?.getAttribute('style') || ''}`.toLowerCase();
  const isDarkBg =
    style.includes('#172e58') ||
    style.includes('#0f2040') ||
    style.includes('rgb(23, 46, 88)') ||
    style.includes('rgb(15, 32, 64)');
  return isDarkBg && (/all rights reserved/i.test(text) || /©|&copy;/i.test(text) || text.length < 180);
}

function tryParseHeroBannerRow(tr: Element): EmailBlock | null {
  const td = tr.querySelector('td.hero-banner-cell') || tr.querySelector('td');
  if (!td) return null;
  const style = `${tr.getAttribute('style') || ''} ${td.getAttribute('style') || ''}`.toLowerCase();
  const isHero =
    td.classList.contains('hero-banner-cell') ||
    ((style.includes('#172e58') || style.includes('rgb(23, 46, 88)')) &&
      Boolean(td.querySelector('h1, h2, h3')) &&
      !/all rights reserved/i.test(td.textContent || ''));
  if (!isHero) return null;

  const heading = td.querySelector('h1, h2, h3');
  if (!heading) return null;
  const level = heading.tagName.toLowerCase() as 'h1' | 'h2' | 'h3';
  return {
    id: nextBlockId('hero'),
    type: 'heading',
    subtitle: 'hero-banner',
    level,
    title: (heading.textContent || '').trim(),
    align: parseAlignFromStyle(heading),
  };
}

function tryParseInfoCardElement(el: Element): EmailBlock | null {
  const innerCardTable =
    el.querySelector('table[style*="border-radius"]') ||
    el.querySelector('div[style*="border-radius"]');
  const container = innerCardTable || el;
  const twoColCells = Array.from(container.querySelectorAll('.two-col-cell, td, div')).filter(
    (cell) => cell.children.length >= 2 && /#64748b|rgb\(100,\s*116,\s*139\)/i.test(cell.innerHTML)
  );
  const directPairs = Array.from(container.querySelectorAll('.two-col-cell'));

  if (directPairs.length === 0 && twoColCells.length === 0) {
    return null;
  }

  const pairNodes = directPairs.length > 0 ? directPairs : twoColCells;
  const cardFields: InfoCardField[] = pairNodes.map((cell, idx) => {
    const childDivs = Array.from(cell.children);
    const labelText = (childDivs[0]?.textContent || '').trim();
    const valueText = (childDivs[1]?.textContent || '').trim();
    let icon: InfoCardField['icon'] = 'briefcase';
    if (/email/i.test(labelText)) icon = 'mail';
    else if (/name|recipient/i.test(labelText)) icon = 'user';
    else if (/date|year/i.test(labelText)) icon = 'calendar';
    return {
      id: `f-${Date.now()}-${idx}`,
      label: labelText || `Field ${idx + 1}`,
      value: valueText,
      icon,
    };
  });

  const titleEl = container.querySelector('div[style*="uppercase"], h3, h4, strong');
  const cardTitle = titleEl ? (titleEl.textContent || '').trim() : 'Recipient Details';
  const cardStyle = container.getAttribute('style') || '';
  const bgMatch = cardStyle.match(/background(?:-color)?\s*:\s*([^;]+)/i);

  return {
    id: nextBlockId('infocard'),
    type: 'infocard',
    cardTitle,
    cardBgColor: normalizeColorHex(bgMatch?.[1], '#EEF4FF'),
    cardFields,
  };
}

function tryParseButtonElement(el: Element): EmailBlock | null {
  const anchors = Array.from(el.querySelectorAll('a'));
  if (anchors.length !== 1) return null;

  const a = anchors[0];
  const elText = (el.textContent || '').trim();
  const linkText = (a.textContent || '').trim();
  if (!linkText || elText.length > linkText.length + 12) return null;

  const aStyle = (a.getAttribute('style') || '').toLowerCase();
  const tdContainer = a.closest('td');
  const tdStyle = (tdContainer?.getAttribute('style') || '').toLowerCase();
  const isStyledBtn =
    a.classList.contains('btn-link') ||
    aStyle.includes('background') ||
    aStyle.includes('padding') ||
    tdStyle.includes('background');

  if (!isStyledBtn) return null;

  const bgSource = aStyle.includes('background') ? aStyle : tdStyle;
  const bgMatch = bgSource.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  const radSource = aStyle.includes('border-radius') ? aStyle : tdStyle;
  const radMatch = radSource.match(/border-radius\s*:\s*(\d+)px/i);
  const widthFull = /width\s*:\s*100%/i.test(aStyle) || a.closest('table')?.getAttribute('width') === '100%';

  return {
    id: nextBlockId('button'),
    type: 'button',
    buttonText: linkText,
    buttonUrl: a.getAttribute('href') || '{{activation_link}}',
    buttonBgColor: normalizeColorHex(bgMatch?.[1], '#172E58'),
    buttonRadius: radMatch ? Number(radMatch[1]) : 8,
    align: parseAlignFromStyle(el),
    buttonWidth: widthFull ? 'full' : 'auto',
  };
}

function tryParseSignatureElement(el: Element): EmailBlock | null {
  const text = getInlineTextWithBreaks(el);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > 4) return null;

  const signOffLine = lines[0] || '';
  if (!/^(best regards|warm regards|regards|sincerely|kind regards|thank you)/i.test(signOffLine)) {
    return null;
  }

  return {
    id: nextBlockId('signature'),
    type: 'signature',
    signOff: signOffLine,
    senderName: lines[1] || 'SNPSUNEXUS',
    senderTitle: lines[2] || '',
  };
}

function parseSingleElementToBlock(el: Element): EmailBlock | null {
  const tag = el.tagName.toLowerCase();

  // Check Infocard before generic table/div parsing
  const infoCard = tryParseInfoCardElement(el);
  if (infoCard) return infoCard;

  // Check CTA button
  const btn = tryParseButtonElement(el);
  if (btn) return btn;

  // Signature block
  const sig = tryParseSignatureElement(el);
  if (sig) return sig;

  // Heading elements
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    return {
      id: nextBlockId('heading'),
      type: 'heading',
      subtitle: 'standard',
      level: tag,
      title: (el.textContent || '').trim(),
      align: parseAlignFromStyle(el),
    };
  }

  // Heading directly inside a simple div/td
  if (el.children.length === 1 && ['h1', 'h2', 'h3'].includes(el.children[0].tagName.toLowerCase())) {
    const h = el.children[0];
    return {
      id: nextBlockId('heading'),
      type: 'heading',
      subtitle: 'standard',
      level: h.tagName.toLowerCase() as 'h1' | 'h2' | 'h3',
      title: (h.textContent || '').trim(),
      align: parseAlignFromStyle(h),
    };
  }

  // Divider
  if (tag === 'hr' || (el.children.length === 1 && el.children[0].tagName.toLowerCase() === 'hr')) {
    return { id: nextBlockId('divider'), type: 'divider' };
  }
  const styleAttr = (el.getAttribute('style') || '').toLowerCase();
  if (!(el.textContent || '').trim() && /border-(top|bottom)\s*:/i.test(styleAttr) && !el.querySelector('img')) {
    return { id: nextBlockId('divider'), type: 'divider' };
  }

  // Spacer
  if (!(el.textContent || '').trim() && !el.querySelector('img, hr')) {
    const heightMatch = styleAttr.match(/height\s*:\s*(\d+)px/i);
    if (heightMatch) {
      return {
        id: nextBlockId('spacer'),
        type: 'spacer',
        spacingHeight: Math.max(8, Math.min(80, Number(heightMatch[1]))),
      };
    }
    return null;
  }

  // Standalone image
  const imgs = el.querySelectorAll('img');
  if (imgs.length === 1 && !(el.textContent || '').trim()) {
    const img = imgs[0];
    const widthMatch = (img.getAttribute('style') || '').match(/max-width\s*:\s*([^;]+)/i);
    return {
      id: nextBlockId('image'),
      type: 'image',
      imageUrl: img.getAttribute('src') || '/assets/snpsunexus-logo.png',
      imageWidth: widthMatch?.[1]?.trim() || img.getAttribute('width') || '300px',
      align: parseAlignFromStyle(el),
    };
  }

  // Bullet or Numbered list
  const listEl = tag === 'ul' || tag === 'ol' ? el : el.querySelector('ul, ol');
  if (listEl && el.children.length <= 2) {
    const items = Array.from(listEl.querySelectorAll('li'))
      .map((li) => (li.textContent || '').trim())
      .filter(Boolean);
    if (items.length > 0) {
      return {
        id: nextBlockId(listEl.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul'),
        type: listEl.tagName.toLowerCase() === 'ol' ? 'numberedlist' : 'bulletlist',
        items,
      };
    }
  }

  // Paragraph: simple text wrapper without inline rich formatting tags
  const hasRichFormatting = Boolean(el.querySelector('strong, b, em, i, u, a, ul, ol, table, blockquote, code'));
  const textContent = getInlineTextWithBreaks(el);
  if (!textContent) return null;

  if (!hasRichFormatting && (tag === 'p' || tag === 'div' || tag === 'td')) {
    return {
      id: nextBlockId('paragraph'),
      type: 'paragraph',
      content: textContent,
      align: parseAlignFromStyle(el),
    };
  }

  // Preserve rich inline markup cleanly as richtext block
  return {
    id: nextBlockId('richtext'),
    type: 'richtext',
    content: el.innerHTML.trim() || `<p>${textContent}</p>`,
  };
}

/**
 * Parses saved email HTML back into structured Visual Block Builder EmailBlock objects.
 * Detects custom raw HTML that cannot losslessly round-trip through fixed blocks so callers
 * can guard against accidental overwrites when switching editor modes.
 */
export function parseHtmlToBlocks(html: string): ParseHtmlResult {
  if (!html || typeof html !== 'string' || !html.trim()) {
    return { blocks: [], isStructuredTemplate: true, isCustomRawHtml: false };
  }

  if (typeof DOMParser === 'undefined') {
    return {
      blocks: [{ id: nextBlockId('richtext'), type: 'richtext', content: html }],
      isStructuredTemplate: false,
      isCustomRawHtml: true,
      reason: 'DOM parser unavailable in non-browser environment',
    };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const mainContainer = doc.querySelector(
    'table.email-container, .email-container, table.main-container, .main-container'
  );
  const isKnownCardTemplate = Boolean(mainContainer);

  const blocks: EmailBlock[] = [];
  let hasUnrecognizedComplexMarkup = !isKnownCardTemplate;

  if (mainContainer && mainContainer.tagName.toLowerCase() === 'table') {
    const topRows = Array.from(mainContainer.querySelectorAll(':scope > tbody > tr, :scope > tr'));

    for (const tr of topRows) {
      if (isBrandHeaderRow(tr)) {
        continue;
      }

      if (isBrandFooterRow(tr)) {
        const footerText = (tr.textContent || '')
          .replace(/SNPSUNEXUS/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        blocks.push({
          id: nextBlockId('footer'),
          type: 'footer',
          copyrightText: footerText || '© {{current_year}} SNPSUNEXUS. All rights reserved.',
        });
        continue;
      }

      const heroBlock = tryParseHeroBannerRow(tr);
      if (heroBlock) {
        blocks.push(heroBlock);
        continue;
      }

      // Main card body cell: inspect direct child blocks/elements in sequence
      const mainTd = tr.querySelector(':scope > td');
      if (!mainTd) continue;

      const children = Array.from(mainTd.children);
      if (children.length === 0) {
        const parsedSingle = parseSingleElementToBlock(mainTd);
        if (parsedSingle) blocks.push(parsedSingle);
        continue;
      }

      for (const child of children) {
        const parsedChild = parseSingleElementToBlock(child);
        if (parsedChild) {
          if (parsedChild.type === 'richtext') {
            hasUnrecognizedComplexMarkup = true;
          }
          blocks.push(parsedChild);
        }
      }
    }
  } else {
    // Generic / custom raw HTML document or fragment
    const bodyChildren = Array.from(doc.body?.children || []);
    if (bodyChildren.length === 0 && (doc.body?.textContent || '').trim()) {
      blocks.push({
        id: nextBlockId('paragraph'),
        type: 'paragraph',
        content: (doc.body?.textContent || '').trim(),
        align: 'left',
      });
    } else {
      for (const child of bodyChildren) {
        const parsed = parseSingleElementToBlock(child);
        if (parsed) {
          if (parsed.type === 'richtext') hasUnrecognizedComplexMarkup = true;
          blocks.push(parsed);
        }
      }
    }
  }

  return {
    blocks,
    isStructuredTemplate: isKnownCardTemplate && !hasUnrecognizedComplexMarkup,
    isCustomRawHtml: !isKnownCardTemplate || hasUnrecognizedComplexMarkup,
    reason: !isKnownCardTemplate
      ? 'HTML uses a custom layout outside the SNPSUNEXUS block card structure.'
      : hasUnrecognizedComplexMarkup
        ? 'HTML contains custom inline markup parsed into Rich Text blocks.'
        : undefined,
  };
}
