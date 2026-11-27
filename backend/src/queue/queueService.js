import { queueRepository } from './queueRepository.js';
import { smtpDispatchCoordinator } from '../services/smtpDispatchCoordinator.js';
import { sendEmailViaSmtp } from '../services/smtpService.js';
import { globalWorkerLock } from './workerLock.js';
import { renderTemplateText, renderTemplateHtml, htmlToPlainTextFallback } from '../services/templateRenderer.js';
import { config } from '../config/env.js';

/**
 * Replace placeholders in template text with recipient-specific and contextual data
 * using the centralized template renderer.
 */
export function substituteQueuePlaceholders(templateText, context = {}, isHtml = false) {
  if (!templateText) return '';

  // Support legacy/queue-specific contextual tokens alongside central registry tokens
  const queueTokens = {
    campaign_name: context.campaign_name || 'Announcement',
    organization_name: 'SNPSUNEXUS',
    brand_name: 'SNPSUNEXUS',
    university_name: 'SNPSUNEXUS',
    system_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    unsubscribe_link: context.unsubscribe_link || '#',
  };

  let prepared = templateText;
  for (const [key, val] of Object.entries(queueTokens)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    prepared = prepared.replace(regex, String(val));
  }

  const mergedContext = {
    recipient_name: context.recipient_name || 'Recipient',
    recipient_email: context.recipient_email || '',
    institution_name: 'SNPSUNEXUS',
    designation: context.designation || 'Member',
    activation_link: context.activation_link || 'https://snpsunexus.vercel.app/verify',
    current_year: String(new Date().getFullYear()),
  };

  return isHtml
    ? renderTemplateHtml(prepared, mergedContext, { strict: false })
    : renderTemplateText(prepared, mergedContext, { strict: false });
}

/**
 * QueueService
 * Business logic orchestration for the Sequential Bulk Sending Queue.
 */
export class QueueService {
  /**
   * Process a single claimed recipient through SMTP and finalize
   */
  async processClaimedRecipient(claim, workerId) {
    const { campaign, recipient, attempt_id: attemptId } = claim;

    // 1. Resolve template content from snapshot or campaign defaults
    const snapshot = campaign.template_snapshot || {};
    const rawHtml = snapshot.html_content || `<p>Notification from ${campaign.campaign_name}</p>`;
    const rawText = snapshot.text_content || `Notification from ${campaign.campaign_name}`;
    const rawSubject = campaign.subject || snapshot.subject || 'Important Notice';

    // 2. Render placeholders
    const context = {
      recipient_name: recipient.recipient_name,
      recipient_email: recipient.recipient_email,
      campaign_name: campaign.campaign_name,
    };

    const finalSubject = substituteQueuePlaceholders(rawSubject, context, false);
    const finalHtml = substituteQueuePlaceholders(rawHtml, context, true);
    const finalText = rawText
      ? substituteQueuePlaceholders(rawText, context, false)
      : htmlToPlainTextFallback(finalHtml);

    // 3. Acquire exclusive SMTP dispatch reservation
    const dispatchLock = await smtpDispatchCoordinator.acquireDispatch('bulk_worker', {
      workerId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      recipientEmail: recipient.recipient_email,
    });

    let smtpResult;
    if (!dispatchLock.success) {
      console.warn('[QueueService] SMTP dispatch reservation conflict:', dispatchLock.reason);
      // Wait momentarily and retry reservation
      await new Promise(r => setTimeout(r, 1000));
      const retryLock = await smtpDispatchCoordinator.acquireDispatch('bulk_worker', {
        workerId,
        campaignId: campaign.id,
        recipientId: recipient.id,
        recipientEmail: recipient.recipient_email,
      });

      if (!retryLock.success) {
        throw new Error(`Failed to acquire SMTP dispatch lock: ${retryLock.reason}`);
      }
    }

    try {
      // 4. Dispatch email via Gmail SMTP
      smtpResult = await sendEmailViaSmtp({
        to: recipient.recipient_email,
        toName: recipient.recipient_name,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
      });
    } catch (err) {
      console.error('[QueueService] Unexpected SMTP dispatch error:', err);
      smtpResult = {
        outcomeType: 'outcome_unknown',
        failureReason: err.message,
        messageId: null,
      };
    } finally {
      smtpDispatchCoordinator.releaseDispatch('bulk_worker');
    }

    // 5. Finalize attempt in database (enforces 5-second interval)
    const finalized = await queueRepository.finalizeAttempt({
      attemptId,
      outcome: smtpResult.outcomeType,
      smtpMessageId: smtpResult.messageId,
      failureReason: smtpResult.failureReason,
      workerId,
      campaignId: campaign.id,
      recipientId: recipient.id,
    });

    return {
      attemptId,
      outcome: smtpResult.outcomeType,
      messageId: smtpResult.messageId,
      failureReason: smtpResult.failureReason,
      nextSendAllowedAt: finalized?.next_send_allowed_at,
    };
  }

  /**
   * Run a single step: checks interval -> claims -> processes -> finalizes
   */
  async executeSingleQueueStep(workerId) {
    // 1. Check interval from worker state
    const state = await queueRepository.getWorkerState();
    if (state && state.next_send_allowed_at) {
      const allowedTime = new Date(state.next_send_allowed_at).getTime();
      const remainingMs = allowedTime - Date.now();
      if (remainingMs > 0) {
        return {
          status: 'waiting_interval',
          remainingMs,
          nextSendAllowedAt: state.next_send_allowed_at,
        };
      }
    }

    // 2. Claim next recipient
    const claim = await queueRepository.claimNextRecipient(workerId);
    if (!claim || !claim.has_work) {
      return { status: 'idle', message: 'No queued bulk emails pending.' };
    }

    // 3. Process claimed recipient
    const result = await this.processClaimedRecipient(claim, workerId);
    return {
      status: 'processed',
      result,
    };
  }

  /**
   * Health and monitoring status of queue engine strictly from persisted DB state
   */
  async getQueueHealth() {
    const workerState = await queueRepository.getWorkerState();
    const dispatchState = smtpDispatchCoordinator.getState();

    const assignedWorkerId =
      workerState?.worker_id && workerState.worker_id !== 'unassigned' ? workerState.worker_id : null;

    let isWorkerHealthy = false;
    let secondsSinceHeartbeat = null;

    if (workerState && assignedWorkerId && workerState.heartbeat_at) {
      secondsSinceHeartbeat = Math.floor((Date.now() - new Date(workerState.heartbeat_at).getTime()) / 1000);
      isWorkerHealthy =
        secondsSinceHeartbeat <= 30 && ['active', 'waiting_interval', 'idle'].includes(workerState.worker_status);
    }

    return {
      healthy: isWorkerHealthy,
      worker_id: assignedWorkerId,
      worker_status: isWorkerHealthy ? workerState.worker_status : 'offline',
      heartbeat_at: assignedWorkerId ? workerState?.heartbeat_at || null : null,
      seconds_since_heartbeat: secondsSinceHeartbeat,
      next_send_allowed_at: workerState?.next_send_allowed_at || null,
      lock_generation: isWorkerHealthy ? (workerState?.lock_generation || null) : null,
      active_workers_count: isWorkerHealthy ? 1 : 0,
      active_campaign_id: workerState?.current_campaign_id || null,
      active_recipient_id: workerState?.current_recipient_id || null,
      policy: {
        mandatory_interval_seconds: 5,
        concurrency_limit: 1,
        smtp_tls_strict: Boolean(config.gmailUser && config.gmailAppPassword),
      },
      smtp_dispatch: dispatchState,
    };
  }

  async getCampaigns(options) {
    return queueRepository.getCampaigns(options);
  }

  async getCampaignDetails(campaignId) {
    return queueRepository.getCampaignDetails(campaignId);
  }

  async startCampaign(campaignId, adminUserId) {
    return queueRepository.startCampaign(campaignId, adminUserId);
  }

  async pauseCampaign(campaignId, adminUserId) {
    return queueRepository.pauseCampaign(campaignId, adminUserId);
  }

  async resumeCampaign(campaignId, adminUserId) {
    return queueRepository.resumeCampaign(campaignId, adminUserId);
  }

  async cancelCampaign(campaignId, adminUserId) {
    return queueRepository.cancelCampaign(campaignId, adminUserId);
  }

  async resolveOutcomeUnknown(params) {
    return queueRepository.resolveOutcomeUnknown(params);
  }
}

export const queueService = new QueueService();
