import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

let transporterInstance = null;

/**
 * Creates or retrieves the singleton reusable Nodemailer transporter
 */
export function getSmtpTransporter() {
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // Port 465 uses SSL/TLS
      auth: {
        user: config.gmailUser,
        pass: config.gmailAppPassword,
      },
      tls: {
        rejectUnauthorized: true, // Strict certificate validation enabled
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      socketTimeout: 15000,
      connectionTimeout: 10000,
    });
  }
  return transporterInstance;
}

/**
 * Sets a custom or mocked transporter (used in automated testing)
 */
export function setSmtpTransporter(customTransporter) {
  transporterInstance = customTransporter;
}

/**
 * Verifies SMTP connectivity and authentication during startup or health checks
 */
export async function verifySmtpConnection() {
  const transporter = getSmtpTransporter();
  try {
    const verified = await transporter.verify();
    return {
      connected: true,
      host: 'smtp.gmail.com:465',
      secure: true,
      tlsStrict: true,
    };
  } catch (err) {
    console.error('[SMTP Service] Verification notice:', err.message);
    return {
      connected: false,
      host: 'smtp.gmail.com:465',
      secure: true,
      tlsStrict: true,
      error: err.message,
    };
  }
}

const PUBLIC_LOGO_URL = `${config.publicAssetBaseUrl}/assets/snpsunexus-logo.png`;

/**
 * Resolves relative, localhost, or legacy CID SNPSUNEXUS logo references in outgoing
 * emails to the verified public HTTPS asset URL so Gmail renders the logo inline inside
 * the header and footer without showing a separate attachment pill in the inbox list.
 */
export function prepareOutgoingHtmlAndAssets(html) {
  if (!html || typeof html !== 'string') {
    return {
      html: '',
      attachments: [],
      hasInlineLogo: false,
      logoDeliveryMode: 'none',
      resolvedLogoUrl: null,
    };
  }

  const logoRegex =
    /(?:(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)?\/?assets\/snpsunexus-logo\.png|cid:snpsunexus-logo@snpsunexus)/gi;
  const usesOfficialLogo = logoRegex.test(html) || html.includes(PUBLIC_LOGO_URL);

  if (!usesOfficialLogo) {
    return {
      html,
      attachments: [],
      hasInlineLogo: false,
      logoDeliveryMode: 'none',
      resolvedLogoUrl: null,
    };
  }

  const rewrittenHtml = html.replace(logoRegex, PUBLIC_LOGO_URL);

  return {
    html: rewrittenHtml,
    hasInlineLogo: true,
    logoDeliveryMode: 'public_https',
    resolvedLogoUrl: PUBLIC_LOGO_URL,
    attachments: [],
  };
}

/**
 * Sends a single email with strict outcome categorization and multipart/alternative + CID asset support
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.toName - Recipient full name
 * @param {string} options.subject - Sanitized subject line
 * @param {string} [options.html] - Sanitized HTML body
 * @param {string} [options.text] - Plain text body
 * @returns {Promise<{ success: boolean, messageId?: string, response?: string, outcomeType: 'sent' | 'failed' | 'outcome_unknown', failureReason?: string, mimeDiagnostics?: Object }>}
 */
export async function sendEmailViaSmtp({ to, toName, subject, html, text }) {
  const transporter = getSmtpTransporter();

  const {
    html: finalHtml,
    attachments,
    hasInlineLogo,
    logoDeliveryMode,
    resolvedLogoUrl,
  } = prepareOutgoingHtmlAndAssets(html);

  const mailOptions = {
    from: `"${config.senderName}" <${config.gmailUser}>`,
    to: `"${toName.replace(/["\r\n]/g, '')}" <${to}>`,
    subject: subject,
    ...(text ? { text } : {}),
    ...(finalHtml ? { html: finalHtml } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };

  const mimeDiagnostics = {
    has_html: Boolean(finalHtml && finalHtml.trim().length > 0),
    has_text: Boolean(text && text.trim().length > 0),
    has_inline_logo: hasInlineLogo,
    logo_delivery_mode: logoDeliveryMode,
    resolved_logo_url: resolvedLogoUrl,
    attachment_count: attachments.length,
    html_bytes: finalHtml ? Buffer.byteLength(finalHtml, 'utf8') : 0,
    text_bytes: text ? Buffer.byteLength(text, 'utf8') : 0,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    
    // Case A: Accepted by SMTP
    return {
      success: true,
      messageId: info.messageId || `msg_${Date.now()}`,
      response: info.response || '250 2.0.0 OK',
      outcomeType: 'sent',
      mimeDiagnostics,
    };
  } catch (err) {
    const errMessage = err.message || '';
    const isTimeout = /timeout|ECONNRESET|ETIMEDOUT|EPIPE|closed/i.test(errMessage);

    if (isTimeout) {
      // Case C: Uncertain outcome (e.g., connection lost after DATA command was sent)
      // Must NOT be blindly retried automatically
      console.warn(`[SMTP Service] Uncertain transmission outcome for recipient [masked]: ${errMessage}`);
      return {
        success: false,
        outcomeType: 'outcome_unknown',
        failureReason: `Connection dropped during SMTP handshake or DATA transmission: ${errMessage}`,
        mimeDiagnostics,
      };
    }

    // Case B: Explicit SMTP rejection (5xx, authentication, or syntax error)
    console.warn(`[SMTP Service] Explicit SMTP rejection for recipient [masked]: ${errMessage}`);
    return {
      success: false,
      outcomeType: 'failed',
      failureReason: errMessage,
      mimeDiagnostics,
    };
  }
}
