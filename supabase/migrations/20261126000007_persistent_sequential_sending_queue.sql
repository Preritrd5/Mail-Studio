-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - PHASE 7: PERSISTENT SEQUENTIAL SENDING QUEUE
-- ==============================================================================
-- Implements single global worker state tracking, audit events, 5-second interval
-- persistence, atomic recipient claiming (FOR UPDATE SKIP LOCKED), crash recovery,
-- and transactional pause/resume/cancel state transitions.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: queue_worker_state
-- Purpose: Authoritative singleton tracking the active global worker, heartbeat,
-- current dispatch identifiers, and mandatory 5-second next_send_allowed_at.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.queue_worker_state (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  worker_id TEXT NOT NULL DEFAULT 'unassigned',
  lock_generation BIGINT NOT NULL DEFAULT 1,
  worker_status VARCHAR(30) NOT NULL DEFAULT 'idle' CHECK (
    worker_status IN ('idle', 'active', 'waiting_interval', 'paused', 'stopping', 'stopped', 'failed')
  ),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_started_at TIMESTAMPTZ,
  last_stopped_at TIMESTAMPTZ,
  current_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  current_recipient_id UUID REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
  current_attempt_id UUID REFERENCES public.email_attempts(id) ON DELETE SET NULL,
  next_send_allowed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_attempt_completed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT single_queue_worker_row CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- Seed singleton worker state record
INSERT INTO public.queue_worker_state (
  id,
  worker_id,
  lock_generation,
  worker_status,
  heartbeat_at,
  next_send_allowed_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'unassigned',
  1,
  'idle',
  timezone('utc'::text, now()),
  timezone('utc'::text, now()),
  timezone('utc'::text, now())
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. TABLE: queue_events
-- Purpose: Persistent audit trail of queue transitions and worker events.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
  worker_id TEXT,
  event_type VARCHAR(50) NOT NULL,
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_events_campaign_id ON public.queue_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_event_type ON public.queue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_queue_events_created_at ON public.queue_events(created_at DESC);

-- ------------------------------------------------------------------------------
-- 3. EXTEND CAMPAIGNS TABLE WITH QUEUE LIFECYCLE FIELDS
-- ------------------------------------------------------------------------------
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check CHECK (
    status IN ('draft', 'ready', 'queued', 'running', 'paused', 'needs_review', 'completed', 'cancelled', 'failed')
  );

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_unknown_count INTEGER NOT NULL DEFAULT 0 CHECK (outcome_unknown_count >= 0);

-- ------------------------------------------------------------------------------
-- 4. EXTEND CAMPAIGN_RECIPIENTS TABLE WITH CLAIM & AUDIT FIELDS
-- ------------------------------------------------------------------------------
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_worker TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- ------------------------------------------------------------------------------
-- 5. EXTEND EMAIL_ATTEMPTS WITH WORKER IDENTITY
-- ------------------------------------------------------------------------------
ALTER TABLE public.email_attempts
  ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.queue_worker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue_worker_state_select" ON public.queue_worker_state;
CREATE POLICY "queue_worker_state_select"
  ON public.queue_worker_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "queue_worker_state_update" ON public.queue_worker_state;
CREATE POLICY "queue_worker_state_update"
  ON public.queue_worker_state FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "queue_events_select" ON public.queue_events;
CREATE POLICY "queue_events_select"
  ON public.queue_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "queue_events_insert" ON public.queue_events;
CREATE POLICY "queue_events_insert"
  ON public.queue_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 7. ATOMIC RECIPIENT CLAIM RPC FUNCTION
-- Purpose: Finds next eligible campaign (FIFO), locks exactly one pending recipient
-- using FOR UPDATE SKIP LOCKED, updates state to 'sending', records attempt, and returns data.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_queue_recipient(p_worker_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign RECORD;
  v_recipient RECORD;
  v_attempt_id UUID;
  v_attempt_number INTEGER;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Find oldest eligible campaign in FIFO order ('running' or 'queued')
  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE status IN ('running', 'queued')
    AND campaign_type = 'bulk'
    AND pending_count > 0
  ORDER BY 
    CASE WHEN status = 'running' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_work', false);
  END IF;

  -- If campaign was 'queued', transition to 'running'
  IF v_campaign.status = 'queued' THEN
    UPDATE public.campaigns
    SET status = 'running',
        started_at = COALESCE(started_at, v_now)
    WHERE id = v_campaign.id;

    INSERT INTO public.queue_events (campaign_id, worker_id, event_type, event_details)
    VALUES (v_campaign.id, p_worker_id, 'campaign_started', jsonb_build_object('campaign_name', v_campaign.campaign_name));
  END IF;

  -- 2. Claim exactly ONE pending recipient using FOR UPDATE SKIP LOCKED
  SELECT * INTO v_recipient
  FROM public.campaign_recipients
  WHERE campaign_id = v_campaign.id
    AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- If no pending recipients remain in this campaign, verify completion
    IF v_campaign.pending_count = 0 THEN
      UPDATE public.campaigns
      SET status = 'completed',
          completed_at = v_now
      WHERE id = v_campaign.id;

      INSERT INTO public.queue_events (campaign_id, worker_id, event_type, event_details)
      VALUES (v_campaign.id, p_worker_id, 'campaign_completed', jsonb_build_object('campaign_name', v_campaign.campaign_name));
    END IF;

    RETURN jsonb_build_object('has_work', false);
  END IF;

  -- 3. Calculate attempt number
  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_number
  FROM public.email_attempts
  WHERE recipient_id = v_recipient.id;

  -- 4. Create new attempt record in 'sending' state
  INSERT INTO public.email_attempts (
    campaign_id,
    recipient_id,
    attempt_number,
    status,
    worker_id,
    started_at
  ) VALUES (
    v_campaign.id,
    v_recipient.id,
    v_attempt_number,
    'sending',
    p_worker_id,
    v_now
  ) RETURNING id INTO v_attempt_id;

  -- 5. Update recipient state to 'sending'
  UPDATE public.campaign_recipients
  SET status = 'sending',
      attempt_count = v_attempt_number,
      claimed_at = v_now,
      claimed_by_worker = p_worker_id,
      updated_at = v_now
  WHERE id = v_recipient.id;

  -- 6. Update global worker state tracking
  UPDATE public.queue_worker_state
  SET worker_status = 'active',
      current_campaign_id = v_campaign.id,
      current_recipient_id = v_recipient.id,
      current_attempt_id = v_attempt_id,
      heartbeat_at = v_now,
      updated_at = v_now
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

  -- 7. Log queue event
  INSERT INTO public.queue_events (campaign_id, recipient_id, worker_id, event_type, event_details)
  VALUES (
    v_campaign.id,
    v_recipient.id,
    p_worker_id,
    'recipient_claimed',
    jsonb_build_object('attempt_id', v_attempt_id, 'attempt_number', v_attempt_number, 'recipient_email', v_recipient.recipient_email)
  );

  RETURN jsonb_build_object(
    'has_work', true,
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'campaign_name', v_campaign.campaign_name,
      'subject', v_campaign.subject,
      'template_id', v_campaign.template_id,
      'template_version', v_campaign.template_version,
      'template_snapshot', v_campaign.template_snapshot
    ),
    'recipient', jsonb_build_object(
      'id', v_recipient.id,
      'recipient_name', v_recipient.recipient_name,
      'recipient_email', v_recipient.recipient_email
    ),
    'attempt_id', v_attempt_id,
    'attempt_number', v_attempt_number
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. FINALIZE ATTEMPT & ENFORCE 5-SECOND INTERVAL RPC FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_queue_attempt(
  p_attempt_id UUID,
  p_outcome TEXT,
  p_smtp_message_id TEXT,
  p_failure_reason TEXT,
  p_worker_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt RECORD;
  v_campaign RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_next_send_allowed TIMESTAMPTZ := v_now + INTERVAL '5 seconds';
  v_new_pending INTEGER;
  v_new_sent INTEGER;
  v_new_failed INTEGER;
  v_new_unknown INTEGER;
  v_new_status TEXT;
BEGIN
  -- 1. Lock and update attempt
  SELECT * INTO v_attempt
  FROM public.email_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Attempt record not found.');
  END IF;

  UPDATE public.email_attempts
  SET status = p_outcome,
      completed_at = v_now,
      smtp_message_id = p_smtp_message_id,
      failure_reason = p_failure_reason
  WHERE id = p_attempt_id;

  -- 2. Update recipient status
  UPDATE public.campaign_recipients
  SET status = p_outcome,
      sent_at = CASE WHEN p_outcome = 'sent' THEN v_now ELSE sent_at END,
      failure_reason = p_failure_reason,
      updated_at = v_now
  WHERE id = v_attempt.recipient_id;

  -- 3. Recalculate campaign counters
  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = v_attempt.campaign_id
  FOR UPDATE;

  SELECT 
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'outcome_unknown')
  INTO v_new_pending, v_new_sent, v_new_failed, v_new_unknown
  FROM public.campaign_recipients
  WHERE campaign_id = v_campaign.id;

  -- Determine final campaign status
  IF p_outcome = 'outcome_unknown' THEN
    v_new_status := 'needs_review';
  ELSIF v_new_pending = 0 THEN
    v_new_status := 'completed';
  ELSE
    v_new_status := v_campaign.status;
  END IF;

  UPDATE public.campaigns
  SET pending_count = v_new_pending,
      sent_count = v_new_sent,
      failed_count = v_new_failed,
      outcome_unknown_count = v_new_unknown,
      status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'completed' THEN v_now ELSE completed_at END
  WHERE id = v_campaign.id;

  -- 4. Update global worker state with mandatory 5-second interval
  UPDATE public.queue_worker_state
  SET worker_status = 'waiting_interval',
      current_recipient_id = NULL,
      current_attempt_id = NULL,
      last_attempt_completed_at = v_now,
      next_send_allowed_at = v_next_send_allowed,
      heartbeat_at = v_now,
      updated_at = v_now
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

  -- 5. Audit event
  INSERT INTO public.queue_events (campaign_id, recipient_id, worker_id, event_type, event_details)
  VALUES (
    v_campaign.id,
    v_attempt.recipient_id,
    p_worker_id,
    CASE 
      WHEN p_outcome = 'sent' THEN 'email_accepted_smtp'
      WHEN p_outcome = 'failed' THEN 'email_rejected_smtp'
      ELSE 'email_outcome_unknown'
    END,
    jsonb_build_object(
      'attempt_id', p_attempt_id,
      'smtp_message_id', p_smtp_message_id,
      'failure_reason', p_failure_reason,
      'next_send_allowed_at', v_next_send_allowed
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'next_send_allowed_at', v_next_send_allowed,
    'campaign_status', v_new_status,
    'pending_count', v_new_pending
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. CRASH RECOVERY RPC FUNCTION
-- Purpose: Identifies abandoned 'sending' records from dead workers and safely
-- transitions them to 'outcome_unknown' and campaign to 'needs_review'.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recover_abandoned_queue_attempts(p_worker_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_abandoned RECORD;
  v_recovered_count INTEGER := 0;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  FOR v_abandoned IN
    SELECT r.id as recipient_id, r.campaign_id, a.id as attempt_id
    FROM public.campaign_recipients r
    LEFT JOIN public.email_attempts a ON a.recipient_id = r.id AND a.status = 'sending'
    WHERE r.status = 'sending'
      AND (r.claimed_at < v_now - INTERVAL '2 minutes' OR r.claimed_by_worker != p_worker_id)
  LOOP
    -- Mark attempt outcome_unknown
    IF v_abandoned.attempt_id IS NOT NULL THEN
      UPDATE public.email_attempts
      SET status = 'outcome_unknown',
          completed_at = v_now,
          failure_reason = 'Worker connection lost during transmission. Preserved for administrator review.'
      WHERE id = v_abandoned.attempt_id;
    END IF;

    -- Mark recipient outcome_unknown
    UPDATE public.campaign_recipients
    SET status = 'outcome_unknown',
        failure_reason = 'Worker disconnected before delivery confirmation was persisted.',
        updated_at = v_now
    WHERE id = v_abandoned.recipient_id;

    -- Mark campaign needs_review
    UPDATE public.campaigns
    SET status = 'needs_review',
        outcome_unknown_count = outcome_unknown_count + 1
    WHERE id = v_abandoned.campaign_id;

    -- Audit log
    INSERT INTO public.queue_events (campaign_id, recipient_id, worker_id, event_type, event_details)
    VALUES (
      v_abandoned.campaign_id,
      v_abandoned.recipient_id,
      p_worker_id,
      'worker_recovered',
      jsonb_build_object('reason', 'Recovered abandoned sending state on startup.')
    );

    v_recovered_count := v_recovered_count + 1;
  END LOOP;

  RETURN jsonb_build_object('recovered_count', v_recovered_count);
END;
$$;

-- Grant execution to authenticated & service roles
REVOKE ALL ON FUNCTION public.claim_next_queue_recipient(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_queue_recipient(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_queue_attempt(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_queue_attempt(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.recover_abandoned_queue_attempts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_abandoned_queue_attempts(TEXT) TO authenticated, service_role;

COMMIT;
