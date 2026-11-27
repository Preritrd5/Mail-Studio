import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';
import { executeSendIndividualEmail } from '../services/emailService.js';
import { queueRepository } from '../queue/queueRepository.js';

function isMissingRpcError(error) {
  return error?.code === 'PGRST202' || String(error?.message || '').includes('Could not find the function');
}

/**
 * ActivityRepository
 * Queries real transmission records from Supabase PostgreSQL.
 * Contains zero hardcoded recipients, attempts, or fallback dummy records.
 */
export class ActivityRepository {
  async listActivities(params) {
    return this.getActivityList(params);
  }

  /**
   * List email activity records with server-side search, filtering, sorting, and pagination
   */
  async getActivityList(params = {}) {
    const {
      search = '',
      status = 'all',
      campaignId = params.campaign_id || 'all',
      campaignType = params.campaign_type || 'all',
      dateRange = params.date_range || 'all',
      startDate = params.start_date || null,
      endDate = params.end_date || null,
      sortBy = params.sort_by || 'created_at',
      sortOrder = params.sort_order || 'desc',
      page = 1,
      limit = 20,
    } = params;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from('campaign_recipients')
      .select(
        `
        id,
        recipient_name,
        recipient_email,
        status,
        attempt_count,
        sent_at,
        created_at,
        failure_reason,
        campaign_id,
        campaigns!inner (
          id,
          campaign_name,
          campaign_type,
          subject
        ),
        email_attempts (
          id,
          attempt_number,
          status,
          smtp_message_id,
          created_at
        )
      `,
        { count: 'exact' }
      );

    if (search && search.trim()) {
      const s = search.trim();
      query = query.or(
        `recipient_name.ilike.%${s}%,recipient_email.ilike.%${s}%,campaigns.campaign_name.ilike.%${s}%,campaigns.subject.ilike.%${s}%`
      );
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (campaignId && campaignId !== 'all') {
      query = query.eq('campaign_id', campaignId);
    }

    if (campaignType && campaignType !== 'all') {
      const { data: matchedCamps, error: typeErr } = await supabaseAdmin
        .from('campaigns')
        .select('id')
        .eq('campaign_type', campaignType);
      if (typeErr) {
        throw createDatabaseError('ActivityRepository.getActivityList.campaignTypeFilter', typeErr);
      }
      const campIds = (matchedCamps || []).map((c) => c.id);
      if (campIds.length === 0) {
        return {
          items: [],
          pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 1 },
        };
      }
      query = query.in('campaign_id', campIds);
    }

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString());
    } else if (dateRange && dateRange !== 'all') {
      const now = new Date();
      if (dateRange === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte('created_at', today);
      } else if (dateRange === '7d') {
        query = query.gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString());
      } else if (dateRange === '30d') {
        query = query.gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString());
      }
    }

    const validSortCols = {
      created_at: 'created_at',
      sent_at: 'sent_at',
      recipient_name: 'recipient_name',
      status: 'status',
    };
    const sortColumn = validSortCols[sortBy] || 'created_at';
    query = query.order(sortColumn, { ascending: sortOrder.toLowerCase() === 'asc' });
    query = query.range(offset, offset + limitNum - 1);

    const { data, count, error } = await query;
    if (error) {
      throw createDatabaseError('ActivityRepository.getActivityList', error);
    }

    const formatted = (data || []).map((item) => {
      const latestAttempt = Array.isArray(item.email_attempts)
        ? [...item.email_attempts].sort((a, b) => (b.attempt_number || 0) - (a.attempt_number || 0))[0]
        : null;

      return {
        id: item.id,
        recipient_name: item.recipient_name,
        recipient_email: item.recipient_email,
        status: item.status,
        attempt_count: item.attempt_count || (Array.isArray(item.email_attempts) ? item.email_attempts.length : 0),
        sent_at: item.sent_at,
        created_at: item.created_at,
        failure_reason: item.failure_reason,
        campaign_id: item.campaign_id,
        campaign_name: item.campaigns?.campaign_name || '—',
        campaign_type: item.campaigns?.campaign_type || 'individual',
        subject: item.campaigns?.subject || '—',
        smtp_message_id: latestAttempt?.smtp_message_id || null,
      };
    });

    const total = typeof count === 'number' ? count : formatted.length;
    return {
      items: formatted,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    };
  }

  /**
   * Get detailed activity record with all historical attempts in chronological order
   */
  async getActivityDetail(recipientId) {
    const { data: recipient, error: recErr } = await supabaseAdmin
      .from('campaign_recipients')
      .select(
        `
        *,
        campaigns (
          id,
          campaign_name,
          campaign_type,
          subject,
          template_id,
          template_version,
          template_snapshot,
          created_at
        )
      `
      )
      .eq('id', recipientId)
      .maybeSingle();

    if (recErr) {
      throw createDatabaseError('ActivityRepository.getActivityDetail.recipient', recErr);
    }

    if (!recipient) {
      return null;
    }

    const { data: attempts, error: attErr } = await supabaseAdmin
      .from('email_attempts')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('attempt_number', { ascending: true });

    if (attErr) {
      throw createDatabaseError('ActivityRepository.getActivityDetail.attempts', attErr);
    }

    return {
      id: recipient.id,
      recipient_name: recipient.recipient_name,
      recipient_email: recipient.recipient_email,
      status: recipient.status,
      attempt_count: recipient.attempt_count || (attempts ? attempts.length : 0),
      sent_at: recipient.sent_at,
      claimed_at: recipient.claimed_at,
      failure_reason: recipient.failure_reason,
      created_at: recipient.created_at,
      campaign_id: recipient.campaign_id,
      campaign_type: recipient.campaigns?.campaign_type || 'individual',
      campaign: recipient.campaigns,
      attempts: attempts || [],
    };
  }

  async retryRecipient(recipientId, adminUser) {
    return this.retryActivity(recipientId, adminUser);
  }

  /**
   * Retry an eligible failed email record
   */
  async retryActivity(recipientId, adminUser) {
    const detail = await this.getActivityDetail(recipientId);
    if (!detail) {
      const err = new Error(`Recipient '${recipientId}' not found.`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (detail.status === 'pending') {
      const err = new Error('Pending emails are already queued for delivery and cannot be retried.');
      err.statusCode = 400;
      err.code = 'RETRY_NOT_ELIGIBLE';
      throw err;
    }
    if (detail.status === 'sending') {
      const err = new Error('Email is currently in flight and cannot be retried.');
      err.statusCode = 400;
      err.code = 'RETRY_NOT_ELIGIBLE';
      throw err;
    }
    if (detail.status === 'sent') {
      const err = new Error('Email has already been accepted by SMTP. Resending accepted emails is prohibited.');
      err.statusCode = 400;
      err.code = 'RETRY_ALREADY_SENT';
      throw err;
    }
    if (detail.status === 'outcome_unknown') {
      const err = new Error('Outcome is uncertain. Automated retry is prohibited. Use the manual outcome audit workflow.');
      err.statusCode = 400;
      err.code = 'RETRY_OUTCOME_UNKNOWN';
      throw err;
    }
    if (detail.status === 'cancelled') {
      const err = new Error('Cancelled recipient cannot be retried directly.');
      err.statusCode = 400;
      err.code = 'RETRY_CANCELLED';
      throw err;
    }
    if (detail.status !== 'failed') {
      const err = new Error(`Recipient status is '${detail.status}'. Only failed records can be retried.`);
      err.statusCode = 400;
      err.code = 'RETRY_NOT_ELIGIBLE';
      throw err;
    }

    const campaignType = detail.campaign_type || detail.campaign?.campaign_type || 'individual';

    if (campaignType === 'bulk') {
      const { data, error } = await supabaseAdmin.rpc('requeue_failed_recipient', {
        p_recipient_id: recipientId,
        p_admin_id: adminUser?.id || null,
      });

      if (!error && data && data.success) {
        return {
          success: true,
          requeued: true,
          action: 'requeued_to_queue',
          status: 'pending',
          message: 'Recipient successfully requeued into the sequential queue.',
          campaign_type: 'bulk',
          recipient_id: recipientId,
          new_status: 'pending',
        };
      }
      if (error && !isMissingRpcError(error)) {
        throw createDatabaseError('ActivityRepository.retryActivity.requeueRpc', error);
      }

      const { error: recErr } = await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'pending',
          claimed_at: null,
          failure_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recipientId);
      if (recErr) throw createDatabaseError('ActivityRepository.retryActivity.updateRecipient', recErr);

      const { data: camp } = await supabaseAdmin
        .from('campaigns')
        .select('pending_count, failed_count')
        .eq('id', detail.campaign_id)
        .maybeSingle();

      if (camp) {
        const { error: campUpdErr } = await supabaseAdmin
          .from('campaigns')
          .update({
            pending_count: (camp.pending_count || 0) + 1,
            failed_count: Math.max(0, (camp.failed_count || 1) - 1),
            status: 'queued',
          })
          .eq('id', detail.campaign_id);
        if (campUpdErr) throw createDatabaseError('ActivityRepository.retryActivity.updateCampaign', campUpdErr);
      }

      await queueRepository.recordEvent(
        detail.campaign_id,
        recipientId,
        'admin',
        'recipient_requeued',
        { requeued_by: adminUser?.id || null },
        adminUser?.id || null
      );

      return {
        success: true,
        requeued: true,
        action: 'requeued_to_queue',
        status: 'pending',
        message: 'Recipient successfully requeued into the sequential queue.',
        campaign_type: 'bulk',
        recipient_id: recipientId,
        new_status: 'pending',
      };
    }

    const rawPayload = {
      recipient_name: detail.recipient_name,
      recipient_email: detail.recipient_email,
      subject: detail.campaign?.subject || 'Retry Dispatch',
      html_content: detail.campaign?.template_snapshot?.html_content || `<p>${detail.campaign?.subject || 'Retry Dispatch'}</p>`,
      text_content: detail.campaign?.template_snapshot?.text_content || detail.campaign?.subject || 'Retry Dispatch',
      campaign_name: `${detail.campaign?.campaign_name || 'Direct Dispatch'} (Retry)`,
      idempotency_key: `retry_${detail.id}_${Date.now()}`,
    };

    const sendRes = await executeSendIndividualEmail(rawPayload, adminUser);
    const smtpMessageId = sendRes.body?.data?.smtp_message_id || null;

    if (sendRes.statusCode === 200) {
      const nextAttemptCount = (detail.attempt_count || 1) + 1;
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          attempt_count: nextAttemptCount,
          status: 'sent',
          sent_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq('id', recipientId);

      await supabaseAdmin.from('email_attempts').insert({
        campaign_id: detail.campaign_id,
        recipient_id: recipientId,
        attempt_number: nextAttemptCount,
        status: 'sent',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        smtp_message_id: smtpMessageId,
        worker_id: 'worker-individual',
      });
    }

    return {
      success: sendRes.statusCode === 200,
      requeued: false,
      action: 'sent_individual',
      status: sendRes.statusCode === 200 ? 'sent' : 'failed',
      message: sendRes.body?.message || 'Individual email retry executed.',
      campaign_type: 'individual',
      recipient_id: recipientId,
      smtp_message_id: smtpMessageId,
      result: sendRes.body,
    };
  }
}

export const activityRepository = new ActivityRepository();
