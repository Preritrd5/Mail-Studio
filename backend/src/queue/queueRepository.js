import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';

function isMissingRpcError(error) {
  return error?.code === 'PGRST202' || String(error?.message || '').includes('Could not find the function');
}

/**
 * QueueRepository
 * Strict Supabase PostgreSQL persistence layer for Phase 7 Sequential Sending Queue.
 * Contains zero hardcoded campaigns, fake recipients, or simulated worker states.
 */
export class QueueRepository {
  /**
   * Get singleton queue worker state from PostgreSQL
   */
  async getWorkerState() {
    const { data, error } = await supabaseAdmin
      .from('queue_worker_state')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();

    if (error) {
      throw createDatabaseError('QueueRepository.getWorkerState', error);
    }

    return data || null;
  }

  /**
   * Update queue worker state fields in PostgreSQL
   */
  async updateWorkerState(fields) {
    const { data, error } = await supabaseAdmin
      .from('queue_worker_state')
      .update({
        ...fields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .select()
      .single();

    if (error) {
      throw createDatabaseError('QueueRepository.updateWorkerState', error);
    }

    return data;
  }

  /**
   * Atomically claim the next pending recipient across queued/running bulk campaigns
   */
  async claimNextRecipient(workerId) {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('claim_next_queue_recipient', {
      p_worker_id: workerId,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }
    if (rpcError && !isMissingRpcError(rpcError)) {
      throw createDatabaseError('QueueRepository.claimNextRecipient.rpc', rpcError);
    }

    const now = new Date().toISOString();
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .in('status', ['running', 'queued'])
      .eq('campaign_type', 'bulk')
      .gt('pending_count', 0)
      .order('created_at', { ascending: true })
      .limit(1);

    if (campErr) {
      throw createDatabaseError('QueueRepository.claimNextRecipient.campaigns', campErr);
    }

    if (!campaigns || campaigns.length === 0) {
      return { has_work: false };
    }

    const campaign = campaigns[0];
    if (campaign.status === 'queued') {
      const { error: startErr } = await supabaseAdmin
        .from('campaigns')
        .update({ status: 'running', started_at: campaign.started_at || now })
        .eq('id', campaign.id);
      if (startErr) {
        throw createDatabaseError('QueueRepository.claimNextRecipient.startCampaign', startErr);
      }
      await this.recordEvent(campaign.id, null, workerId, 'campaign_started', {
        campaign_name: campaign.campaign_name,
      });
    }

    const { data: recipients, error: recipErr } = await supabaseAdmin
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (recipErr) {
      throw createDatabaseError('QueueRepository.claimNextRecipient.recipients', recipErr);
    }

    if (!recipients || recipients.length === 0) {
      return { has_work: false };
    }

    const recipient = recipients[0];
    const attemptNumber = (recipient.attempt_count || 0) + 1;

    const { data: attempt, error: attErr } = await supabaseAdmin
      .from('email_attempts')
      .insert({
        campaign_id: campaign.id,
        recipient_id: recipient.id,
        attempt_number: attemptNumber,
        status: 'sending',
        worker_id: workerId,
        started_at: now,
      })
      .select('id')
      .single();

    if (attErr) {
      throw createDatabaseError('QueueRepository.claimNextRecipient.attempt', attErr);
    }

    const attemptId = attempt.id;

    const { error: claimErr } = await supabaseAdmin
      .from('campaign_recipients')
      .update({
        status: 'sending',
        attempt_count: attemptNumber,
        claimed_at: now,
        claimed_by_worker: workerId,
        updated_at: now,
      })
      .eq('id', recipient.id);

    if (claimErr) {
      throw createDatabaseError('QueueRepository.claimNextRecipient.markSending', claimErr);
    }

    await this.updateWorkerState({
      worker_status: 'active',
      current_campaign_id: campaign.id,
      current_recipient_id: recipient.id,
      current_attempt_id: attemptId,
      heartbeat_at: now,
    });

    await this.recordEvent(campaign.id, recipient.id, workerId, 'recipient_claimed', {
      attempt_id: attemptId,
      attempt_number: attemptNumber,
      recipient_email: recipient.recipient_email,
    });

    return {
      has_work: true,
      campaign: {
        id: campaign.id,
        campaign_name: campaign.campaign_name,
        subject: campaign.subject,
        template_id: campaign.template_id,
        template_version: campaign.template_version,
        template_snapshot: campaign.template_snapshot,
      },
      recipient: {
        id: recipient.id,
        recipient_name: recipient.recipient_name,
        recipient_email: recipient.recipient_email,
      },
      attempt_id: attemptId,
      attempt_number: attemptNumber,
    };
  }

  /**
   * Finalize queue email attempt and persist mandatory 5-second interval
   */
  async finalizeAttempt({ attemptId, outcome, smtpMessageId, failureReason, workerId, campaignId, recipientId }) {
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('finalize_queue_attempt', {
      p_attempt_id: attemptId,
      p_outcome: outcome,
      p_smtp_message_id: smtpMessageId || null,
      p_failure_reason: failureReason || null,
      p_worker_id: workerId,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }
    if (rpcError && !isMissingRpcError(rpcError)) {
      throw createDatabaseError('QueueRepository.finalizeAttempt.rpc', rpcError);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nextAllowedIso = new Date(now.getTime() + 5000).toISOString();

    if (attemptId) {
      const { error: attErr } = await supabaseAdmin
        .from('email_attempts')
        .update({
          status: outcome,
          completed_at: nowIso,
          smtp_message_id: smtpMessageId || null,
          failure_reason: failureReason || null,
        })
        .eq('id', attemptId);
      if (attErr) {
        throw createDatabaseError('QueueRepository.finalizeAttempt.attempt', attErr);
      }
    }

    if (recipientId) {
      const { error: recErr } = await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: outcome,
          sent_at: outcome === 'sent' ? nowIso : null,
          failure_reason: failureReason || null,
          updated_at: nowIso,
        })
        .eq('id', recipientId);
      if (recErr) {
        throw createDatabaseError('QueueRepository.finalizeAttempt.recipient', recErr);
      }
    }

    if (campaignId) {
      const { data: recips, error: recListErr } = await supabaseAdmin
        .from('campaign_recipients')
        .select('status')
        .eq('campaign_id', campaignId);
      if (recListErr) {
        throw createDatabaseError('QueueRepository.finalizeAttempt.countRecipients', recListErr);
      }

      const list = recips || [];
      const pendingCount = list.filter((r) => r.status === 'pending').length;
      const sentCount = list.filter((r) => r.status === 'sent').length;
      const failedCount = list.filter((r) => r.status === 'failed').length;
      const unknownCount = list.filter((r) => r.status === 'outcome_unknown').length;

      let newStatus;
      if (outcome === 'outcome_unknown' || unknownCount > 0) {
        newStatus = 'needs_review';
      } else if (pendingCount === 0) {
        newStatus = 'completed';
      }

      const campUpdates = {
        pending_count: pendingCount,
        sent_count: sentCount,
        failed_count: failedCount,
        outcome_unknown_count: unknownCount,
      };
      if (newStatus) {
        campUpdates.status = newStatus;
        if (newStatus === 'completed') campUpdates.completed_at = nowIso;
      }

      const { error: campErr } = await supabaseAdmin.from('campaigns').update(campUpdates).eq('id', campaignId);
      if (campErr) {
        throw createDatabaseError('QueueRepository.finalizeAttempt.campaign', campErr);
      }
    }

    await this.updateWorkerState({
      worker_status: 'waiting_interval',
      current_recipient_id: null,
      current_attempt_id: null,
      last_attempt_completed_at: nowIso,
      next_send_allowed_at: nextAllowedIso,
      heartbeat_at: nowIso,
    });

    const eventType =
      outcome === 'sent'
        ? 'email_accepted_smtp'
        : outcome === 'failed'
        ? 'email_rejected_smtp'
        : 'email_outcome_unknown';

    await this.recordEvent(campaignId, recipientId, workerId, eventType, {
      attempt_id: attemptId,
      smtp_message_id: smtpMessageId,
      failure_reason: failureReason,
      next_send_allowed_at: nextAllowedIso,
    });

    return {
      success: true,
      next_send_allowed_at: nextAllowedIso,
    };
  }

  /**
   * Recover abandoned sending attempts
   */
  async recoverAbandonedAttempts(workerId) {
    const { data, error } = await supabaseAdmin.rpc('recover_abandoned_queue_attempts', {
      p_worker_id: workerId,
    });

    if (!error && data) {
      return data;
    }
    if (error && !isMissingRpcError(error)) {
      throw createDatabaseError('QueueRepository.recoverAbandonedAttempts', error);
    }
    return { recovered_count: 0 };
  }

  /**
   * Record audit event in PostgreSQL
   */
  async recordEvent(campaignId, recipientId, workerId, eventType, details = {}, userId = null) {
    const { error } = await supabaseAdmin.from('queue_events').insert({
      campaign_id: campaignId || null,
      recipient_id: recipientId || null,
      worker_id: workerId || 'system',
      event_type: eventType,
      event_details: details,
      created_by: userId || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw createDatabaseError('QueueRepository.recordEvent', error);
    }
  }

  /**
   * List bulk campaigns cleanly from PostgreSQL (returns empty array if DB has zero campaigns)
   */
  async getCampaigns({ status, page = 1, limit = 20 } = {}) {
    let query = supabaseAdmin
      .from('campaigns')
      .select('*', { count: 'exact' })
      .eq('campaign_type', 'bulk')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error } = await query.range(from, to);

    if (error) {
      throw createDatabaseError('QueueRepository.getCampaigns', error);
    }

    return {
      campaigns: data || [],
      total: typeof count === 'number' ? count : (data || []).length,
      page,
      limit,
    };
  }

  /**
   * Get single campaign details with recipients and event audit history
   */
  async getCampaignDetails(campaignId) {
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();

    if (campErr) {
      throw createDatabaseError('QueueRepository.getCampaignDetails.campaign', campErr);
    }
    if (!campaign) {
      const err = new Error(`Campaign '${campaignId}' not found.`);
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const { data: recipients, error: recErr } = await supabaseAdmin
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (recErr) {
      throw createDatabaseError('QueueRepository.getCampaignDetails.recipients', recErr);
    }

    const { data: events, error: evtErr } = await supabaseAdmin
      .from('queue_events')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (evtErr) {
      throw createDatabaseError('QueueRepository.getCampaignDetails.events', evtErr);
    }

    return {
      campaign,
      recipients: recipients || [],
      events: events || [],
    };
  }

  async startCampaign(campaignId, adminUserId) {
    const { data: campaign, error: getErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (getErr) throw createDatabaseError('QueueRepository.startCampaign.fetch', getErr);
    if (!campaign) {
      const err = new Error('Campaign not found.');
      err.statusCode = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('campaigns')
      .update({
        status: 'queued',
        started_at: campaign.started_at || nowIso,
        paused_at: null,
      })
      .eq('id', campaignId)
      .select()
      .single();
    if (updErr) throw createDatabaseError('QueueRepository.startCampaign.update', updErr);

    await this.recordEvent(campaignId, null, 'admin', 'campaign_queued', { started_by: adminUserId }, adminUserId);
    return updated;
  }

  async pauseCampaign(campaignId, adminUserId) {
    const { data: campaign, error: getErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (getErr) throw createDatabaseError('QueueRepository.pauseCampaign.fetch', getErr);
    if (!campaign) {
      const err = new Error('Campaign not found.');
      err.statusCode = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('campaigns')
      .update({
        status: 'paused',
        paused_at: nowIso,
      })
      .eq('id', campaignId)
      .select()
      .single();
    if (updErr) throw createDatabaseError('QueueRepository.pauseCampaign.update', updErr);

    await this.recordEvent(campaignId, null, 'admin', 'campaign_paused', { paused_by: adminUserId }, adminUserId);
    return updated;
  }

  async resumeCampaign(campaignId, adminUserId) {
    const { data: campaign, error: getErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (getErr) throw createDatabaseError('QueueRepository.resumeCampaign.fetch', getErr);
    if (!campaign) {
      const err = new Error('Campaign not found.');
      err.statusCode = 404;
      throw err;
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('campaigns')
      .update({
        status: 'queued',
        paused_at: null,
      })
      .eq('id', campaignId)
      .select()
      .single();
    if (updErr) throw createDatabaseError('QueueRepository.resumeCampaign.update', updErr);

    await this.recordEvent(campaignId, null, 'admin', 'campaign_resumed', { resumed_by: adminUserId }, adminUserId);
    return updated;
  }

  async cancelCampaign(campaignId, adminUserId) {
    const nowIso = new Date().toISOString();
    const { data: campaign, error: getErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (getErr) throw createDatabaseError('QueueRepository.cancelCampaign.fetch', getErr);
    if (!campaign) {
      const err = new Error('Campaign not found.');
      err.statusCode = 404;
      throw err;
    }

    const { error: recErr } = await supabaseAdmin
      .from('campaign_recipients')
      .update({
        status: 'failed',
        failure_reason: 'Campaign cancelled by administrator.',
        updated_at: nowIso,
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');
    if (recErr) throw createDatabaseError('QueueRepository.cancelCampaign.recipients', recErr);

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('campaigns')
      .update({
        status: 'cancelled',
        cancelled_at: nowIso,
        pending_count: 0,
      })
      .eq('id', campaignId)
      .select()
      .single();
    if (updErr) throw createDatabaseError('QueueRepository.cancelCampaign.update', updErr);

    await this.recordEvent(campaignId, null, 'admin', 'campaign_cancelled', { cancelled_by: adminUserId }, adminUserId);
    return updated;
  }

  async resolveOutcomeUnknown({ recipientId, resolution, notes, adminUserId }) {
    if (!['sent', 'failed'].includes(resolution)) {
      throw new Error("Invalid resolution. Must be 'sent' or 'failed'.");
    }

    const nowIso = new Date().toISOString();
    const { data: recipient, error: getErr } = await supabaseAdmin
      .from('campaign_recipients')
      .select('*')
      .eq('id', recipientId)
      .maybeSingle();
    if (getErr) throw createDatabaseError('QueueRepository.resolveOutcomeUnknown.fetch', getErr);
    if (!recipient) {
      const err = new Error('Recipient record not found.');
      err.statusCode = 404;
      throw err;
    }

    const { data: updatedRecip, error: updRecErr } = await supabaseAdmin
      .from('campaign_recipients')
      .update({
        status: resolution,
        resolved_at: nowIso,
        resolved_by: adminUserId,
        resolution_notes: notes || 'Resolved manually by administrator.',
        sent_at: resolution === 'sent' ? nowIso : recipient.sent_at,
        updated_at: nowIso,
      })
      .eq('id', recipientId)
      .select()
      .single();
    if (updRecErr) throw createDatabaseError('QueueRepository.resolveOutcomeUnknown.updateRecipient', updRecErr);

    const { data: allRecips, error: listErr } = await supabaseAdmin
      .from('campaign_recipients')
      .select('status')
      .eq('campaign_id', recipient.campaign_id);
    if (listErr) throw createDatabaseError('QueueRepository.resolveOutcomeUnknown.countRecipients', listErr);

    const recips = allRecips || [];
    const pendingCount = recips.filter((r) => r.status === 'pending').length;
    const sentCount = recips.filter((r) => r.status === 'sent').length;
    const failedCount = recips.filter((r) => r.status === 'failed').length;
    const unknownCount = recips.filter((r) => r.status === 'outcome_unknown').length;

    let newStatus = 'running';
    if (unknownCount > 0) newStatus = 'needs_review';
    else if (pendingCount === 0) newStatus = 'completed';

    const { error: campErr } = await supabaseAdmin
      .from('campaigns')
      .update({
        pending_count: pendingCount,
        sent_count: sentCount,
        failed_count: failedCount,
        outcome_unknown_count: unknownCount,
        status: newStatus,
      })
      .eq('id', recipient.campaign_id);
    if (campErr) throw createDatabaseError('QueueRepository.resolveOutcomeUnknown.updateCampaign', campErr);

    await this.recordEvent(
      recipient.campaign_id,
      recipientId,
      'admin',
      'outcome_resolved',
      {
        resolved_by: adminUserId,
        resolution,
        notes,
      },
      adminUserId
    );

    return updatedRecip;
  }
}

export const queueRepository = new QueueRepository();
