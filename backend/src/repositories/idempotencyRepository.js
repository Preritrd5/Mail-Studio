import crypto from 'node:crypto';
import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';

/**
 * Computes deterministic SHA-256 hash of the request payload
 */
export function computePayloadHash(payload) {
  const normalized = `${payload.recipient_email}|${payload.subject}|${payload.html_content || ''}|${payload.text_content || ''}`;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Checks existing idempotency key status and acquires in-progress lock in PostgreSQL.
 * Returns { isDuplicate: boolean, cachedResponse?: Object }
 */
export async function acquireIdempotencyLock(idempotencyKey, userId, payloadHash) {
  const now = new Date();

  const { data: existing, error: selectErr } = await supabaseAdmin
    .from('idempotency_keys')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (selectErr) {
    throw createDatabaseError('acquireIdempotencyLock.select', selectErr);
  }

  if (existing) {
    if (existing.request_payload_hash !== payloadHash) {
      throw {
        statusCode: 400,
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message: 'The provided idempotency key has already been used for a different email request.',
      };
    }

    if (existing.status === 'completed' && existing.response_body) {
      return {
        isDuplicate: true,
        status: 'completed',
        statusCode: existing.response_code || 200,
        cachedResponse: existing.response_body,
      };
    }

    const lockedUntil = existing.locked_until ? new Date(existing.locked_until) : null;
    if (existing.status === 'in_progress' && lockedUntil && lockedUntil > now) {
      throw {
        statusCode: 409,
        code: 'CONCURRENT_REQUEST_IN_PROGRESS',
        message: 'A dispatch request with this idempotency key is currently in progress. Please wait for completion.',
      };
    }
  }

  const lockedUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const { error: insertError } = await supabaseAdmin
    .from('idempotency_keys')
    .upsert(
      {
        idempotency_key: idempotencyKey,
        user_id: userId,
        request_payload_hash: payloadHash,
        status: 'in_progress',
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      },
      { onConflict: 'idempotency_key' }
    );

  if (insertError) {
    throw createDatabaseError('acquireIdempotencyLock.upsert', insertError);
  }

  return { isDuplicate: false };
}

/**
 * Marks idempotency record as completed or failed and saves response payload
 */
export async function releaseIdempotencyLock(idempotencyKey, status, statusCode, responseBody, campaignId = null) {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('idempotency_keys')
    .update({
      status,
      response_code: statusCode,
      response_body: responseBody,
      campaign_id: campaignId,
      updated_at: now,
    })
    .eq('idempotency_key', idempotencyKey);

  if (error) {
    throw createDatabaseError('releaseIdempotencyLock.update', error);
  }
}
