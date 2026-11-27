-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - PHASE 8: EMAIL ACTIVITY & REPORTS
-- ==============================================================================
-- Provides high-performance database indexes for activity searching, filtering,
-- sorting, analytics aggregation, and secure stored procedures for bulk retries.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PERFORMANCE INDEXES FOR EMAIL ACTIVITY & REPORTS
-- ------------------------------------------------------------------------------

-- Index recipient sent_at timestamp for date-range analytics and timeline queries
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_sent_at 
  ON public.campaign_recipients(sent_at DESC);

-- Index recipient created_at for historical activity logs
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_created_at 
  ON public.campaign_recipients(created_at DESC);

-- Composite index for campaign-scoped status queries (e.g. pending/sent per campaign)
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_comp_camp_status 
  ON public.campaign_recipients(campaign_id, status);

-- Composite index for campaign type and status filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_comp_type_status 
  ON public.campaigns(campaign_type, status);

-- Composite index for chronological recipient attempt history
CREATE INDEX IF NOT EXISTS idx_email_attempts_comp_recip_num 
  ON public.email_attempts(recipient_id, attempt_number);

-- Index attempt status for aggregate attempt-level reporting
CREATE INDEX IF NOT EXISTS idx_email_attempts_status 
  ON public.email_attempts(status);

-- ------------------------------------------------------------------------------
-- 2. STORED PROCEDURE: requeue_failed_recipient
-- Purpose: Safely transitions an eligible failed bulk recipient back to 'pending',
-- recalculates campaign statistics, ensures campaign is queued, and audits event.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.requeue_failed_recipient(
  p_recipient_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient RECORD;
  v_campaign RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Fetch and lock recipient
  SELECT * INTO v_recipient
  FROM public.campaign_recipients
  WHERE id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient record not found.');
  END IF;

  IF v_recipient.status != 'failed' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Only failed recipients can be retried. Current status is: ' || v_recipient.status
    );
  END IF;

  -- 2. Fetch and lock campaign
  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = v_recipient.campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Associated campaign not found.');
  END IF;

  -- 3. Requeue recipient to pending
  UPDATE public.campaign_recipients
  SET status = 'pending',
      claimed_at = NULL,
      claimed_by_worker = NULL,
      failure_reason = NULL,
      updated_at = v_now
  WHERE id = p_recipient_id;

  -- 4. Update campaign statistics and re-activate queue status if completed
  UPDATE public.campaigns
  SET pending_count = pending_count + 1,
      failed_count = GREATEST(0, failed_count - 1),
      status = CASE 
        WHEN status IN ('completed', 'failed', 'ready') THEN 'queued'
        ELSE status 
      END,
      completed_at = CASE 
        WHEN status IN ('completed', 'failed') THEN NULL 
        ELSE completed_at 
      END
  WHERE id = v_campaign.id;

  -- 5. Audit queue event
  INSERT INTO public.queue_events (
    campaign_id,
    recipient_id,
    worker_id,
    event_type,
    event_details,
    created_by,
    created_at
  ) VALUES (
    v_campaign.id,
    p_recipient_id,
    'admin',
    'recipient_requeued',
    jsonb_build_object(
      'recipient_email', v_recipient.recipient_email,
      'previous_attempt_count', v_recipient.attempt_count,
      'requeued_by', p_admin_id
    ),
    p_admin_id,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Recipient requeued for sequential dispatch.',
    'recipient_id', p_recipient_id,
    'campaign_id', v_campaign.id,
    'new_status', 'pending'
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. STORED PROCEDURE: get_reports_overview_summary
-- Purpose: Atomically computes comprehensive institutional email statistics.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reports_overview_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_campaigns INTEGER := 0;
  v_bulk_campaigns INTEGER := 0;
  v_individual_campaigns INTEGER := 0;
  v_total_recipients INTEGER := 0;
  v_total_sent INTEGER := 0;
  v_total_failed INTEGER := 0;
  v_total_pending INTEGER := 0;
  v_total_sending INTEGER := 0;
  v_total_unknown INTEGER := 0;
  v_total_attempts INTEGER := 0;
  v_acceptance_rate NUMERIC := 0;
  v_failure_rate NUMERIC := 0;
BEGIN
  -- Campaigns breakdown
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE campaign_type = 'bulk'),
    COUNT(*) FILTER (WHERE campaign_type = 'individual')
  INTO v_total_campaigns, v_bulk_campaigns, v_individual_campaigns
  FROM public.campaigns;

  -- Recipient counts (authoritative)
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'sending'),
    COUNT(*) FILTER (WHERE status = 'outcome_unknown')
  INTO v_total_recipients, v_total_sent, v_total_failed, v_total_pending, v_total_sending, v_total_unknown
  FROM public.campaign_recipients;

  -- Historical attempt total
  SELECT COUNT(*) INTO v_total_attempts FROM public.email_attempts;

  -- Calculate rate based strictly on known completed outcomes (Sent + Failed)
  IF (v_total_sent + v_total_failed) > 0 THEN
    v_acceptance_rate := ROUND((v_total_sent::numeric / (v_total_sent + v_total_failed)::numeric) * 100, 1);
    v_failure_rate := ROUND((v_total_failed::numeric / (v_total_sent + v_total_failed)::numeric) * 100, 1);
  ELSE
    v_acceptance_rate := 0;
    v_failure_rate := 0;
  END IF;

  RETURN jsonb_build_object(
    'total_campaigns', v_total_campaigns,
    'bulk_campaigns', v_bulk_campaigns,
    'individual_campaigns', v_individual_campaigns,
    'total_recipients', v_total_recipients,
    'total_sent', v_total_sent,
    'total_failed', v_total_failed,
    'total_pending', v_total_pending,
    'total_sending', v_total_sending,
    'total_outcome_unknown', v_total_unknown,
    'total_attempts', v_total_attempts,
    'acceptance_rate', v_acceptance_rate,
    'failure_rate', v_failure_rate,
    'generated_at', timezone('utc'::text, now())
  );
END;
$$;

-- Grant execution to authenticated & service_role
REVOKE ALL ON FUNCTION public.requeue_failed_recipient(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_failed_recipient(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_reports_overview_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reports_overview_summary() TO authenticated, service_role;

COMMIT;
