import { EmailBlock, InfoCardField } from '../types';
import { formatMessageBodyToEmailHtml, normalizeGreetingPlainText } from './greetingFormatter';

/**
 * Compiles an array of EmailBlocks into clean, production-grade, email-compatible HTML.
 * Uses robust table-based layouts, inline styling, and responsive CSS for maximum
 * email client compatibility (Gmail, Outlook, Apple Mail, Webmail).
 */
export function renderBlocksToHtml(
  blocks: EmailBlock[],
  options: {
    emailTitle?: string;
    preheader?: string;
    includeOuterWrapper?: boolean;
    brandTagline?: string;
  } = {}
): string {
  const {
    emailTitle = 'SNPSUNEXUS Notification',
    preheader = '',
    includeOuterWrapper = true,
    brandTagline = 'Smarter Communication. Greater Impact.',
  } = options;

  const bodyRowsHtml = compileBlocksToTableRows(blocks);

  if (!includeOuterWrapper) {
    return bodyRowsHtml;
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailTitle)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    @media only screen and (max-width: 520px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 8px !important;
      }
      .email-content-padding {
        padding: 18px 14px !important;
      }
      .two-col-cell {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        padding-bottom: 12px !important;
        padding-right: 0 !important;
        padding-left: 0 !important;
      }
      .two-col-divider {
        display: none !important;
      }
      .header-tagline {
        display: none !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; -webkit-font-smoothing: antialiased; background-color: #F4F6FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  ${
    preheader
      ? `<div style="display: none; font-size: 1px; color: #F4F6FA; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
          ${escapeHtml(preheader)}
        </div>`
      : ''
  }

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F4F6FA; padding: 32px 12px; margin: 0;">
    <tr>
      <td align="center" valign="top">
        <!-- Main Card Container (Max 600px enterprise width) -->
        <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(23, 46, 88, 0.06);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding: 20px 28px; background-color: #FFFFFF; border-bottom: 1px solid #EEF2F6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="36" height="42" style="display: block; width: 36px; height: 42px; object-fit: contain;" />
                        </td>
                        <td style="border-left: 2px solid #172E58; padding-left: 12px; vertical-align: middle;">
                          <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 19px; font-weight: 800; color: #172E58; letter-spacing: 0.5px; line-height: 1.1; display: block;">
                            SNPSUNEXUS
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="header-tagline" align="right" style="vertical-align: middle;">
                    <span style="font-size: 11px; font-style: italic; color: #64748B; font-weight: 500;">
                      ${escapeHtml(brandTagline)}
                    </span>
                  </td>
                  <td width="16" align="right" style="vertical-align: top;">
                    <div style="width: 14px; height: 14px; background: linear-gradient(135deg, #C69A4C 0%, #E7C27B 100%); transform: skewX(-20deg); border-radius: 2px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${bodyRowsHtml}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Compiles blocks into edge-to-edge full-width rows (for hero banners & footers)
 * and properly padded content rows (for message body blocks).
 */
function compileBlocksToTableRows(blocks: EmailBlock[]): string {
  const rows: string[] = [];
  let contentBuffer: string[] = [];

  const flushContent = () => {
    if (contentBuffer.length > 0) {
      rows.push(`
          <!-- Message Body Content -->
          <tr>
            <td class="email-content-padding" style="padding: 28px 28px 20px 28px; font-size: 14px; line-height: 1.65; color: #1E293B; background-color: #FFFFFF;">
              ${contentBuffer.join('\n')}
            </td>
          </tr>`);
      contentBuffer = [];
    }
  };

  for (const block of blocks) {
    const isHeroBanner =
      block.type === 'heading' &&
      (block.subtitle === 'hero-banner' || block.cardBadge === 'EMAIL NOTIFICATION');

    if (isHeroBanner) {
      flushContent();
      rows.push(`
          <!-- Hero Banner Section (Edge-to-Edge) -->
          <tr>
            <td style="padding: 24px 28px 26px 28px; background-color: #172E58; position: relative;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display: inline-block; color: #C69A4C; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">
                      ${escapeHtml(block.cardBadge || 'EMAIL NOTIFICATION')}
                    </span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 21px; font-weight: 700; line-height: 1.35; letter-spacing: -0.2px;">
                      ${block.title || block.content || 'Important Notification'}
                    </h1>
                  </td>
                  <td width="30" align="right" valign="top">
                    <div style="width: 22px; height: 8px; background-color: #C69A4C; transform: skewX(-25deg); border-radius: 1px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
    } else if (block.type === 'footer') {
      flushContent();
      const copy = block.copyrightText || '© {{current_year}} SNPSUNEXUS. All rights reserved.';
      rows.push(`
          <!-- Footer Section (Edge-to-Edge) -->
          <tr>
            <td style="background-color: #172E58; border-top: 3px solid #C69A4C; padding: 18px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="22" height="26" style="display: block; width: 22px; height: 26px; object-fit: contain;" />
                        </td>
                        <td style="border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px; vertical-align: middle;">
                          <span style="font-size: 13px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.5px;">
                            SNPSUNEXUS
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle; font-size: 11px; color: #E2E8F0;">
                    ${copy}
                  </td>
                  <td width="20" align="right" style="vertical-align: top;">
                    <div style="width: 14px; height: 10px; background-color: #C69A4C; transform: skewX(-25deg); border-radius: 1px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
    } else {
      contentBuffer.push(renderSingleBlockHtml(block));
    }
  }

  flushContent();
  return rows.join('\n');
}

/**
 * Renders an individual EmailBlock into email-safe HTML.
 */
function renderSingleBlockHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'heading': {
      const align = block.align || 'left';
      const color = block.textColor || '#172E58';

      // Check for Hero Banner mode
      if (block.subtitle === 'hero-banner' || block.cardBadge === 'EMAIL NOTIFICATION') {
        return `
        <!-- Hero Banner Block -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #172E58; border-radius: 12px; margin: 0 0 24px 0; overflow: hidden; position: relative;">
          <tr>
            <td style="padding: 24px 24px 26px 24px; position: relative;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display: inline-block; color: #C69A4C; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">
                      ${escapeHtml(block.cardBadge || 'EMAIL NOTIFICATION')}
                    </span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 21px; font-weight: 700; line-height: 1.35; letter-spacing: -0.2px;">
                      ${block.title || block.content || 'Important Notification'}
                    </h1>
                  </td>
                  <td width="30" align="right" valign="top">
                    <div style="width: 22px; height: 8px; background-color: #C69A4C; transform: skewX(-25deg); border-radius: 1px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
      }

      const tag = block.level || 'h2';
      const sizeMap = { h1: '22px', h2: '18px', h3: '16px' };
      const fontSize = sizeMap[tag] || '18px';

      return `
      <div style="text-align: ${align}; margin: 0 0 16px 0;">
        <${tag} style="margin: 0; color: ${color}; font-size: ${fontSize}; font-weight: 700; line-height: 1.3;">
          ${block.title || block.content || ''}
        </${tag}>
        ${
          block.subtitle && block.subtitle !== 'hero-banner'
            ? `<p style="margin: 6px 0 0 0; color: #64748B; font-size: 13px;">${escapeHtml(block.subtitle)}</p>`
            : ''
        }
      </div>`;
    }

    case 'paragraph': {
      const align = block.align || 'left';
      const color = block.textColor || '#1E293B';
      const content = block.content || '';
      const paragraphStyle = `margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: ${color}; text-align: ${align};`;

      // If author entered plain text (with greeting and/or line breaks), format separate <p> paragraphs cleanly
      const hasInlineTags = /<[a-z][\s\S]*>/i.test(content);
      if (!hasInlineTags && content.trim()) {
        return formatMessageBodyToEmailHtml(content, { paragraphStyle });
      }

      return `
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: ${color}; text-align: ${align};">
        ${content}
      </p>`;
    }

    case 'richtext': {
      const align = block.align || 'left';
      const color = block.textColor || '#1E293B';
      const content = block.content || '';
      return `
      <div style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.65; color: ${color}; text-align: ${align};">
        ${content}
      </div>`;
    }

    case 'infocard': {
      const bgColor = block.cardBgColor || '#EEF4FF';
      const borderColor = block.cardBorderColor || '#D0E0FC';
      const title = block.cardTitle || 'Your Details';
      const fields = block.cardFields || [];

      // Render fields in 2 columns
      const leftFields = fields.filter((_, idx) => idx % 2 === 0);
      const rightFields = fields.filter((_, idx) => idx % 2 === 1);

      return `
      <!-- Information Card Block -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 12px; margin: 20px 0; overflow: hidden;">
        <tr>
          <td style="padding: 18px 20px;">
            <!-- Card Header Badge -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
              <tr>
                <td style="background-color: #172E58; color: #FFFFFF; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 6px; letter-spacing: 0.3px;">
                  &#128196;&nbsp; ${escapeHtml(title)}
                </td>
              </tr>
            </table>

            <!-- Key-Value Fields Grid -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- Left Column -->
                <td class="two-col-cell" width="50%" valign="top" style="padding-right: 12px;">
                  ${leftFields
                    .map(
                      (f) => `
                    <div style="margin-bottom: 14px;">
                      <div style="font-size: 11px; color: #64748B; font-weight: 600; text-transform: capitalize; margin-bottom: 2px;">
                        ${f.icon === 'mail' ? '&#9993;' : f.icon === 'calendar' ? '&#128197;' : f.icon === 'briefcase' ? '&#128188;' : '&#128100;'} ${escapeHtml(f.label)}
                      </div>
                      <div style="font-size: 13px; color: #172E58; font-weight: 700;">
                        ${f.value}
                      </div>
                    </div>`
                    )
                    .join('')}
                </td>

                <!-- Divider Column -->
                <td class="two-col-divider" width="1" style="background-color: ${borderColor};"></td>

                <!-- Right Column -->
                <td class="two-col-cell" width="50%" valign="top" style="padding-left: 16px;">
                  ${rightFields
                    .map(
                      (f) => `
                    <div style="margin-bottom: 14px;">
                      <div style="font-size: 11px; color: #64748B; font-weight: 600; text-transform: capitalize; margin-bottom: 2px;">
                        ${f.icon === 'calendar' ? '&#128197;' : f.icon === 'briefcase' ? '&#128188;' : f.icon === 'mail' ? '&#9993;' : '&#127891;'} ${escapeHtml(f.label)}
                      </div>
                      <div style="font-size: 13px; color: #172E58; font-weight: 700;">
                        ${f.value}
                      </div>
                    </div>`
                    )
                    .join('')}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    }

    case 'button': {
      // Button is rendered ONLY when explicitly present
      const align = block.align || 'center';
      const bgColor = block.buttonBgColor || '#172E58';
      const textColor = block.buttonTextColor || '#FFFFFF';
      const text = block.buttonText || 'Take Action';
      const url = block.buttonUrl || '#';
      const radius = block.buttonRadius ?? 8;
      const padY = block.buttonPaddingY ?? 13;
      const padX = block.buttonPaddingX ?? 28;
      const isFull = block.buttonWidth === 'full';

      return `
      <!-- Optional CTA Button -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 22px 0;">
        <tr>
          <td align="${align}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" ${isFull ? 'width="100%"' : ''}>
              <tr>
                <td align="center" style="background-color: ${bgColor}; border-radius: ${radius}px; box-shadow: 0 4px 12px rgba(23, 46, 88, 0.18);">
                  <a href="${url}" style="display: ${isFull ? 'block' : 'inline-block'}; background-color: ${bgColor}; color: ${textColor}; font-weight: 700; font-size: 14px; text-decoration: none; padding: ${padY}px ${padX}px; border-radius: ${radius}px; letter-spacing: 0.2px;">
                    ${text}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    }

    case 'image': {
      const align = block.align || 'center';
      const url = block.imageUrl || '';
      const alt = block.imageAlt || 'SNPSUNEXUS Image';
      const width = block.imageWidth || '100%';

      if (!url) return '';

      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 18px 0;">
        <tr>
          <td align="${align}">
            <img src="${url}" alt="${escapeHtml(alt)}" style="max-width: ${width}; height: auto; border-radius: 8px; display: block;" />
          </td>
        </tr>
      </table>`;
    }

    case 'bulletlist': {
      const items = block.items || [];
      if (items.length === 0) return '';
      return `
      <ul style="margin: 0 0 18px 0; padding-left: 20px; font-size: 14px; line-height: 1.65; color: #1E293B;">
        ${items.map((it) => `<li style="margin-bottom: 6px;">${it}</li>`).join('')}
      </ul>`;
    }

    case 'numberedlist': {
      const items = block.items || [];
      if (items.length === 0) return '';
      return `
      <ol style="margin: 0 0 18px 0; padding-left: 20px; font-size: 14px; line-height: 1.65; color: #1E293B;">
        ${items.map((it) => `<li style="margin-bottom: 6px;">${it}</li>`).join('')}
      </ol>`;
    }

    case 'divider': {
      const color = block.dividerColor || '#E2E8F0';
      const style = block.dividerStyle || 'solid';
      const thick = block.dividerThickness || 1;
      return `<hr style="border: 0; border-top: ${thick}px ${style} ${color}; margin: 20px 0;" />`;
    }

    case 'spacer': {
      const h = block.spacingHeight || 20;
      return `<div style="height: ${h}px; line-height: ${h}px; font-size: 1px;">&nbsp;</div>`;
    }

    case 'signature': {
      const signOff = block.signOff || 'Best regards,';
      const name = block.senderName || 'SNPSUNEXUS';
      const title = block.senderTitle || '';
      return `
      <!-- Signature Block -->
      <div style="margin-top: 24px; font-size: 13px; line-height: 1.6; color: #1E293B;">
        <p style="margin: 0 0 4px 0; color: #64748B;">${escapeHtml(signOff)}</p>
        <p style="margin: 0; font-weight: 700; color: #172E58;">${escapeHtml(name)}</p>
        ${title ? `<p style="margin: 0; font-size: 12px; color: #64748B;">${escapeHtml(title)}</p>` : ''}
      </div>`;
    }

    case 'footer': {
      const copy = block.copyrightText || '© {{current_year}} SNPSUNEXUS. All rights reserved.';
      return `
      <!-- Premium Dark Navy Footer -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px; background-color: #172E58; border-top: 3px solid #C69A4C; border-radius: 0 0 15px 15px;">
        <tr>
          <td style="padding: 18px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="vertical-align: middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align: middle; padding-right: 8px;">
                        <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="22" height="26" style="display: block; width: 22px; height: 26px; object-fit: contain;" />
                      </td>
                      <td style="border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px; vertical-align: middle;">
                        <span style="font-size: 13px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.5px;">
                          SNPSUNEXUS
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align: middle; font-size: 11px; color: #E2E8F0;">
                  ${copy}
                </td>
                <td width="20" align="right" style="vertical-align: top;">
                  <div style="width: 14px; height: 10px; background-color: #C69A4C; transform: skewX(-25deg); border-radius: 1px;"></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    }

    default:
      return '';
  }
}

/**
 * Compiles blocks into clean, readable plain-text email representation.
 */
export function renderBlocksToText(blocks: EmailBlock[]): string {
  const lines: string[] = ['SNPSUNEXUS', ''];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        lines.push((block.title || block.content || '').trim());
        lines.push('');
        break;

      case 'paragraph':
      case 'richtext':
        lines.push(normalizeGreetingPlainText(stripHtml(block.content || '')));
        lines.push('');
        break;

      case 'infocard':
        lines.push(`[${block.cardTitle || 'Details'}]`);
        (block.cardFields || []).forEach((f) => {
          lines.push(`• ${f.label}: ${f.value}`);
        });
        lines.push('');
        break;

      case 'button':
        lines.push(`>>> ${block.buttonText || 'Link'}: ${block.buttonUrl || ''}`);
        lines.push('');
        break;

      case 'bulletlist':
      case 'numberedlist':
        (block.items || []).forEach((it, idx) => {
          lines.push(block.type === 'numberedlist' ? `${idx + 1}. ${it}` : `• ${it}`);
        });
        lines.push('');
        break;

      case 'divider':
        lines.push('----------------------------------------');
        break;

      case 'signature':
        lines.push(block.signOff || 'Best regards,');
        lines.push(block.senderName || 'SNPSUNEXUS');
        lines.push(block.senderTitle || '');
        lines.push('');
        break;

      case 'footer':
        lines.push(block.copyrightText || '© SNPSUNEXUS. All rights reserved.');
        lines.push('');
        break;
    }
  }

  return lines.join('\n').trim();
}

/**
 * Returns a clean, product-branded structured block layout for SNPSUNEXUS notifications.
 * Every block remains fully optional and editable in the block-based email builder.
 */
export function getPremiumNotificationCardBlocks(): EmailBlock[] {
  return [
    {
      id: 'blk-hero',
      type: 'heading',
      title: 'SNPSUNEXUS Communication Update',
      subtitle: 'hero-banner',
      cardBadge: 'NOTIFICATION',
      level: 'h1',
      align: 'left',
    },
    {
      id: 'blk-greeting',
      type: 'paragraph',
      content: 'Dear <strong>{{recipient_name}}</strong>,',
      align: 'left',
    },
    {
      id: 'blk-intro',
      type: 'paragraph',
      content:
        'This is an official message dispatched via <strong>{{institution_name}}</strong> Mail Studio for {{current_year}}.',
      align: 'left',
    },
    {
      id: 'blk-card',
      type: 'infocard',
      cardTitle: 'Recipient Details',
      cardBgColor: '#EEF4FF',
      cardBorderColor: '#D0E0FC',
      cardFields: [
        {
          id: 'f1',
          label: 'Recipient Name',
          value: '{{recipient_name}}',
          icon: 'user',
        },
        {
          id: 'f2',
          label: 'Designation',
          value: '{{designation}}',
          icon: 'briefcase',
        },
        {
          id: 'f3',
          label: 'Email Address',
          value: '{{recipient_email}}',
          icon: 'mail',
        },
        {
          id: 'f4',
          label: 'Year',
          value: '{{current_year}}',
          icon: 'calendar',
        },
      ],
    },
    {
      id: 'blk-cta',
      type: 'button',
      buttonText: 'View Details →',
      buttonUrl: '{{activation_link}}',
      buttonBgColor: '#172E58',
      buttonTextColor: '#FFFFFF',
      buttonRadius: 8,
      buttonPaddingY: 13,
      buttonPaddingX: 28,
      align: 'center',
      buttonWidth: 'auto',
    },
    {
      id: 'blk-fallback',
      type: 'richtext',
      content:
        '<div style="background-color: #EEF4FF; border: 1px solid #D0E0FC; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #475569; text-align: center;">&#9432; If the button does not work, copy and open this link:<br><a href="{{activation_link}}" style="color: #1456AD; font-weight: 600; word-break: break-all;">{{activation_link}}</a></div>',
      align: 'center',
    },
    {
      id: 'blk-signature',
      type: 'signature',
      signOff: 'Best regards,',
      senderName: 'SNPSUNEXUS',
      senderTitle: 'SNPSUNEXUS Mail Studio',
    },
    {
      id: 'blk-footer',
      type: 'footer',
      copyrightText: '© {{current_year}} SNPSUNEXUS. All rights reserved.',
      showLogo: true,
    },
  ];
}

/**
 * Returns clean starting blocks for a blank custom template.
 */
export function getBlankTemplateBlocks(): EmailBlock[] {
  return [
    {
      id: 'blk-heading',
      type: 'heading',
      title: 'Announcement Title',
      level: 'h2',
      align: 'left',
    },
    {
      id: 'blk-greeting',
      type: 'paragraph',
      content: 'Hello <strong>{{recipient_name}}</strong>,',
      align: 'left',
    },
    {
      id: 'blk-paragraph',
      type: 'paragraph',
      content: 'Write your message here. All content elements are completely optional.',
      align: 'left',
    },
    {
      id: 'blk-sig',
      type: 'signature',
      signOff: 'Best regards,',
      senderName: 'SNPSUNEXUS',
      senderTitle: 'Administration Team',
    },
    {
      id: 'blk-ftr',
      type: 'footer',
      copyrightText: '© {{current_year}} SNPSUNEXUS. All rights reserved.',
    },
  ];
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(str: string): string {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').trim();
}
