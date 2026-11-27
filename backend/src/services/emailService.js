import crypto from 'node:crypto';
import { validateAndSanitizeSendEmail } from '../validators/emailValidator.js';
import { renderEmailFromTemplate, renderTemplateText, renderTemplateHtml, htmlToPlainTextFallback } from './templateRenderer.js';
import { computePayloadHash, acquireIdempotencyLock, releaseIdempotencyLock } from '../repositories/idempotencyRepository.js';
import { initializeIndividualEmailRecords, finalizeEmailRecords } from '../repositories/emailRepository.js';
import { sendEmailViaSmtp } from './smtpService.js';
import { smtpDispatchCoordinator } from './smtpDispatchCoordinator.js';

/**
 * High-level service executing individual email dispatch
 * Routes all template-backed and raw HTML/text emails through the shared template rendering engine
 * with zero silent fallbacks to plain text.
 */
export async function executeSendIndividualEmail(rawPayload, user) {
  const correlationId = `corr_${crypto.randomUUID().slice(0, 12)}`;

  // 1. Validate payload and sanitize inputs
  const sanitized = validateAndSanitizeSendEmail(rawPayload);

  // 2. Render & validate via shared rendering engine before locking/sending
  const recipientContext = {
    recipient_name: sanitized.recipient_name,
    recipient_email: sanitized.recipient_email,
    institution_name: sanitized.institution_name || 'SNPSUNEXUS',
    designation: sanitized.designation || 'Member',
    activation_link: sanitized.activation_link || 'https://snpsunexus.vercel.app/verify',
    current_year: String(new Date().getFullYear()),
  };

  let finalSubject = sanitized.subject;
  let finalHtml = sanitized.html_content || '';
  let finalText = sanitized.text_content || '';
  let resolvedTemplateId = sanitized.template_id;
  let resolvedTemplateVersion = sanitized.template_version;
  let resolvedTemplateSnapshot = null;
  let renderDiagnostics = {};

  if (sanitized.template_id) {
    // Load exact persisted template & version from repository and render cleanly
    const rendered = await renderEmailFromTemplate({
      templateId: sanitized.template_id,
      templateVersion: sanitized.template_version,
      subjectOverride: sanitized.raw_subject || sanitized.subject || null,
      htmlOverride: null, // Strictly use persisted saved HTML template structure
      textOverride: sanitized.text_content || null,
      recipientData: recipientContext,
      requireHtml: true,
      strict: true,
    });

    finalSubject = rendered.renderedSubject;
    finalHtml = rendered.renderedHtml;
    finalText = rendered.renderedText;
    resolvedTemplateId = rendered.templateId;
    resolvedTemplateVersion = rendered.templateVersion;
    resolvedTemplateSnapshot = rendered.templateSnapshot || null;
    renderDiagnostics = rendered.diagnostics;
  } else {
    // Non-template custom email path: STILL enforce placeholder interpolation & no unresolved {{tokens}}
    finalSubject = renderTemplateText(sanitized.raw_subject || sanitized.subject, recipientContext, { strict: true });
    if (finalHtml && finalHtml.trim()) {
      finalHtml = renderTemplateHtml(finalHtml, recipientContext, { strict: true });
      if (!finalHtml.trim()) {
        throw {
          statusCode: 422,
          code: 'UNUSABLE_HTML_AFTER_SANITIZATION',
          message: 'Rendered HTML became empty after sanitization.',
        };
      }
    }
    if (finalText && finalText.trim()) {
      finalText = renderTemplateText(finalText, recipientContext, { strict: true });
    } else if (finalHtml) {
      finalText = htmlToPlainTextFallback(finalHtml);
    }
    renderDiagnostics = {
      template_id: null,
      template_version: null,
      html_bytes: Buffer.byteLength(finalHtml || '', 'utf8'),
      text_bytes: Buffer.byteLength(finalText || '', 'utf8'),
      rendering_outcome: 'direct_rendered_ok',
    };
  }

  // 3. Compute payload hash for idempotency integrity using rendered message identity
  const payloadHash = computePayloadHash({
    ...sanitized,
    subject: finalSubject,
    html_content: finalHtml,
    text_content: finalText,
  });

  // 4. Acquire Idempotency Lock
  const userId = user?.id || 'admin-system-user';
  const lockResult = await acquireIdempotencyLock(sanitized.idempotency_key, userId, payloadHash);

  // If duplicate completed request: Return cached result immediately
  if (lockResult.isDuplicate && lockResult.status === 'completed') {
    return {
      statusCode: lockResult.statusCode || 200,
      body: {
        ...lockResult.cachedResponse,
        is_idempotent_replay: true,
      },
    };
  }

  // 5. Initialize Database Tracking Records
  const { campaignId, recipientId, attemptId, storedInDb } = await initializeIndividualEmailRecords({
    campaignName: sanitized.campaign_name,
    subject: finalSubject,
    recipientName: sanitized.recipient_name,
    recipientEmail: sanitized.recipient_email,
    userId,
    idempotencyKey: sanitized.idempotency_key,
    templateId: resolvedTemplateId || null,
    templateVersion: resolvedTemplateVersion || null,
    templateSnapshot: resolvedTemplateSnapshot || null,
  });

  // 5.5. Check SMTP Dispatch concurrency coordinator
  const dispatchLock = await smtpDispatchCoordinator.acquireDispatch('individual', {
    recipientEmail: sanitized.recipient_email,
    recipientName: sanitized.recipient_name,
    campaignName: sanitized.campaign_name,
    campaignId,
  });

  if (!dispatchLock.success) {
    const conflictBody = {
      success: false,
      error: {
        code: 'DISPATCH_BUSY',
        message: dispatchLock.reason,
        retry_after_seconds: 5,
      },
    };

    // Release idempotency lock so client can retry cleanly
    await releaseIdempotencyLock(
      sanitized.idempotency_key,
      'failed',
      409,
      conflictBody,
      campaignId
    );

    return {
      statusCode: 409,
      body: conflictBody,
    };
  }

  let smtpResult;
  try {
    // 6. Execute SMTP Dispatch via Gmail SMTP (multipart/alternative + CID assets)
    smtpResult = await sendEmailViaSmtp({
      to: sanitized.recipient_email,
      toName: sanitized.recipient_name,
      subject: finalSubject,
      html: finalHtml,
      text: finalText,
    });
  } finally {
    smtpDispatchCoordinator.releaseDispatch('individual');
  }

  // Log safe non-PII diagnostic summary
  console.info(
    `[EmailService] Dispatch audit | corr=${correlationId} template_id=${resolvedTemplateId || 'none'} version=${resolvedTemplateVersion || 'none'} outcome=${smtpResult.outcomeType} html_bytes=${smtpResult.mimeDiagnostics?.html_bytes || 0} text_bytes=${smtpResult.mimeDiagnostics?.text_bytes || 0} inline_logo=${Boolean(smtpResult.mimeDiagnostics?.has_inline_logo)}`
  );

  // 7. Finalize Database Audit Records
  await finalizeEmailRecords({
    campaignId,
    recipientId,
    attemptId,
    outcomeType: smtpResult.outcomeType,
    smtpMessageId: smtpResult.messageId,
    failureReason: smtpResult.failureReason,
    storedInDb,
  });

  // 8. Formulate Truthful JSON Response
  let responseStatusCode = 200;
  let responseBody = {};

  if (smtpResult.outcomeType === 'sent') {
    // Case A: SMTP accepted the message
    responseStatusCode = 200;
    responseBody = {
      success: true,
      status: 'accepted_by_smtp',
      message: 'Email accepted for transmission by Gmail SMTP.',
      disclaimer: 'Transmission accepted by MTA. This confirms SMTP acceptance, not final inbox arrival or user read receipt.',
      data: {
        correlation_id: correlationId,
        campaign_id: campaignId,
        recipient_id: recipientId,
        attempt_id: attemptId,
        template_id: resolvedTemplateId,
        template_version: resolvedTemplateVersion,
        rendered_subject: finalSubject,
        recipient_email: sanitized.recipient_email,
        recipient_name: sanitized.recipient_name,
        smtp_message_id: smtpResult.messageId,
        idempotency_key: sanitized.idempotency_key,
        mime_diagnostics: {
          ...renderDiagnostics,
          ...smtpResult.mimeDiagnostics,
        },
        dispatched_at: new Date().toISOString(),
      },
    };
  } else if (smtpResult.outcomeType === 'failed') {
    // Case B: Explicit rejection by SMTP
    responseStatusCode = 502;
    responseBody = {
      success: false,
      status: 'smtp_rejected',
      message: 'The email transmission was rejected by the SMTP mail transfer agent.',
      error: {
        code: 'SMTP_TRANSMISSION_FAILED',
        reason: smtpResult.failureReason || 'SMTP server rejected message transmission.',
      },
      data: {
        correlation_id: correlationId,
        campaign_id: campaignId,
        recipient_id: recipientId,
        attempt_id: attemptId,
        template_id: resolvedTemplateId,
        template_version: resolvedTemplateVersion,
        idempotency_key: sanitized.idempotency_key,
      },
    };
  } else {
    // Case C: Outcome Unknown (connection lost or uncertain transmission)
    responseStatusCode = 504;
    responseBody = {
      success: false,
      status: 'outcome_unknown',
      message: 'The transmission outcome is uncertain due to a network or connection drop. Do not automatically retry.',
      error: {
        code: 'OUTCOME_UNKNOWN',
        reason: smtpResult.failureReason || 'Connection closed during transmission. Flagged for administrative audit.',
      },
      data: {
        correlation_id: correlationId,
        campaign_id: campaignId,
        recipient_id: recipientId,
        attempt_id: attemptId,
        template_id: resolvedTemplateId,
        template_version: resolvedTemplateVersion,
        idempotency_key: sanitized.idempotency_key,
        requires_manual_review: true,
      },
    };
  }

  // 9. Release Idempotency Lock and Save Response for Future Replay
  await releaseIdempotencyLock(
    sanitized.idempotency_key,
    smtpResult.outcomeType === 'sent' ? 'completed' : 'failed',
    responseStatusCode,
    responseBody,
    campaignId
  );

  return {
    statusCode: responseStatusCode,
    body: responseBody,
  };
}
