import crypto from 'node:crypto';
import { supabaseAdmin, createDatabaseError, resolveAdminUsersRecordId } from '../config/supabase.js';

/**
 * Initializes PostgreSQL database records for an individual email dispatch.
 * Never falls back to in-memory dummy storage on database errors.
 */
export async function initializeIndividualEmailRecords({
  campaignName,
  subject,
  recipientName,
  recipientEmail,
  userId,
  idempotencyKey,
  templateId = null,
  templateVersion = null,
  templateSnapshot = null,
}) {
  const campaignId = crypto.randomUUID();
  const recipientId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();
  const adminRecordId = await resolveAdminUsersRecordId(userId);

  // 1. Create campaign
  const { error: campError } = await supabaseAdmin.from('campaigns').insert({
    id: campaignId,
    campaign_name: campaignName,
    campaign_type: 'individual',
    subject,
    template_id: templateId || null,
    template_version: templateVersion || null,
    template_snapshot: templateSnapshot || null,
    status: 'running',
    total_recipients: 1,
    pending_count: 1,
    sent_count: 0,
    failed_count: 0,
    created_by: adminRecordId,
    created_at: now,
    started_at: now,
    idempotency_key: idempotencyKey,
  });

  if (campError) {
    throw createDatabaseError('initializeIndividualEmailRecords.campaigns', campError);
  }

  // 2. Create recipient
  const { error: recipError } = await supabaseAdmin.from('campaign_recipients').insert({
    id: recipientId,
    campaign_id: campaignId,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    status: 'sending',
    attempt_count: 1,
    created_at: now,
  });

  if (recipError) {
    throw createDatabaseError('initializeIndividualEmailRecords.campaign_recipients', recipError);
  }

  // 3. Create initial attempt
  const { error: attError } = await supabaseAdmin.from('email_attempts').insert({
    id: attemptId,
    campaign_id: campaignId,
    recipient_id: recipientId,
    attempt_number: 1,
    status: 'sending',
    started_at: now,
  });

  if (attError) {
    throw createDatabaseError('initializeIndividualEmailRecords.email_attempts', attError);
  }

  return {
    campaignId,
    recipientId,
    attemptId,
    storedInDb: true,
  };
}

/**
 * Updates database records based on SMTP outcome
 */
export async function finalizeEmailRecords({
  campaignId,
  recipientId,
  attemptId,
  outcomeType, // 'sent' | 'failed' | 'outcome_unknown'
  smtpMessageId,
  failureReason,
}) {
  const now = new Date().toISOString();

  let attemptStatus = 'sent';
  let recipientStatus = 'sent';
  let campaignStatus = 'completed';
  let sentCount = 0;
  let failedCount = 0;

  if (outcomeType === 'sent') {
    attemptStatus = 'sent';
    recipientStatus = 'sent';
    campaignStatus = 'completed';
    sentCount = 1;
  } else if (outcomeType === 'failed') {
    attemptStatus = 'failed';
    recipientStatus = 'failed';
    campaignStatus = 'failed';
    failedCount = 1;
  } else {
    attemptStatus = 'outcome_unknown';
    recipientStatus = 'outcome_unknown';
    campaignStatus = 'completed';
  }

  const { error: attErr } = await supabaseAdmin
    .from('email_attempts')
    .update({
      status: attemptStatus,
      smtp_message_id: smtpMessageId || null,
      failure_reason: failureReason || null,
      completed_at: now,
    })
    .eq('id', attemptId);

  if (attErr) {
    throw createDatabaseError('finalizeEmailRecords.email_attempts', attErr);
  }

  const { error: recErr } = await supabaseAdmin
    .from('campaign_recipients')
    .update({
      status: recipientStatus,
      failure_reason: failureReason || null,
      sent_at: outcomeType === 'sent' ? now : null,
    })
    .eq('id', recipientId);

  if (recErr) {
    throw createDatabaseError('finalizeEmailRecords.campaign_recipients', recErr);
  }

  const { error: campErr } = await supabaseAdmin
    .from('campaigns')
    .update({
      status: campaignStatus,
      sent_count: sentCount,
      failed_count: failedCount,
      pending_count: 0,
      completed_at: now,
    })
    .eq('id', campaignId);

  if (campErr) {
    throw createDatabaseError('finalizeEmailRecords.campaigns', campErr);
  }

  return {
    campaignStatus,
    recipientStatus,
    attemptStatus,
  };
}
