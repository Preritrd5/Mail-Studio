-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - CONSOLIDATED DATABASE & RLS MIGRATION
-- ==============================================================================
-- Target: SNPSUNEXUS Mail Studio
-- Scope: Full PostgreSQL Schema, Constraints, Triggers, RLS & Operational Functions
-- Execution: Paste and run in the Supabase Dashboard SQL Editor
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. UPDATED_AT TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. TABLE: admin_users
-- Purpose: Identify authorized administrators. One record per authorized auth user.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER set_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. TABLE: email_templates
-- Purpose: Store reusable email templates with standard university placeholders.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. TABLE: campaigns
-- Purpose: Store individual and bulk email campaign records with state machines.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('individual', 'bulk')),
  subject TEXT NOT NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'ready', 'queued', 'running', 'paused', 'completed', 'cancelled', 'failed')
  ),
  total_recipients INTEGER NOT NULL DEFAULT 0 CHECK (total_recipients >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  pending_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns(created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. TABLE: campaign_recipients
-- Purpose: Store each campaign recipient independently with normalized email.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  normalized_email TEXT GENERATED ALWAYS AS (lower(trim(recipient_email))) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'sent', 'failed', 'outcome_unknown', 'cancelled')
  ),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT uq_campaign_recipient_email UNIQUE (campaign_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_normalized_email ON public.campaign_recipients(normalized_email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON public.campaign_recipients(status);

DROP TRIGGER IF EXISTS set_campaign_recipients_updated_at ON public.campaign_recipients;
CREATE TRIGGER set_campaign_recipients_updated_at
  BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. TABLE: email_attempts
-- Purpose: Maintain an auditable history of sending attempts without erasing failed records.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  recipient_id UUID NOT NULL REFERENCES public.campaign_recipients(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'sending', 'sent', 'failed', 'outcome_unknown')
  ),
  smtp_message_id TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_recipient_attempt_number UNIQUE (recipient_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_email_attempts_campaign_id ON public.email_attempts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_attempts_recipient_id ON public.email_attempts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_attempts_created_at ON public.email_attempts(created_at DESC);

-- ------------------------------------------------------------------------------
-- 8. TABLE: app_settings
-- Purpose: Application configuration settings (no secrets or passwords).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 9. AUTOMATED CAMPAIGN COUNTER SYNCHRONIZATION FUNCTION & TRIGGER
-- Ensures campaign counters remain strictly synchronized across recipient lifecycle.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_campaign_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_campaign_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_campaign_id := OLD.campaign_id;
  ELSE
    target_campaign_id := NEW.campaign_id;
  END IF;

  UPDATE public.campaigns
  SET 
    total_recipients = (
      SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = target_campaign_id
    ),
    sent_count = (
      SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = target_campaign_id AND status = 'sent'
    ),
    failed_count = (
      SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = target_campaign_id AND status = 'failed'
    ),
    pending_count = (
      SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = target_campaign_id AND status IN ('pending', 'sending')
    )
  WHERE id = target_campaign_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_campaign_counters ON public.campaign_recipients;
CREATE TRIGGER trigger_sync_campaign_counters
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_campaign_counters();

-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) - ADMINISTRATOR ACCESS CONTROL
-- ------------------------------------------------------------------------------

-- Helper function: is_admin
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = user_uuid
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Enable RLS on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies: admin_users
DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;
CREATE POLICY "Admins can view admin users"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update their own display name" ON public.admin_users;
CREATE POLICY "Admins can update their own display name"
  ON public.admin_users
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) AND user_id = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid());

-- Policies: email_templates
DROP POLICY IF EXISTS "Admins have full access to email templates" ON public.email_templates;
CREATE POLICY "Admins have full access to email templates"
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Policies: campaigns
DROP POLICY IF EXISTS "Admins have full access to campaigns" ON public.campaigns;
CREATE POLICY "Admins have full access to campaigns"
  ON public.campaigns
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Policies: campaign_recipients
DROP POLICY IF EXISTS "Admins have full access to campaign recipients" ON public.campaign_recipients;
CREATE POLICY "Admins have full access to campaign recipients"
  ON public.campaign_recipients
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Policies: email_attempts
DROP POLICY IF EXISTS "Admins have full access to email attempts" ON public.email_attempts;
CREATE POLICY "Admins have full access to email attempts"
  ON public.email_attempts
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Policies: app_settings
DROP POLICY IF EXISTS "Admins have full access to app settings" ON public.app_settings;
CREATE POLICY "Admins have full access to app settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 11. SUPABASE REALTIME CONFIGURATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'campaign_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'email_attempts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_attempts;
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. DEFAULT OPERATIONAL RATE-LIMIT CONFIGURATION (NO SAMPLE TEMPLATES)
-- ------------------------------------------------------------------------------
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
(
  'system_rate_limits',
  '{ "default_emails_per_sec": 1, "mandatory_interval_seconds": 5, "max_burst_per_min": 12, "smtp_timeout_ms": 15000 }'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- ==============================================================================
-- PART 4: IDEMPOTENCY & DUPLICATE PROTECTION
-- ==============================================================================

ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  request_payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  response_code INTEGER,
  response_body JSONB,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 minutes')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_id ON public.idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys(created_at DESC);

DROP TRIGGER IF EXISTS set_idempotency_keys_updated_at ON public.idempotency_keys;
CREATE TRIGGER set_idempotency_keys_updated_at
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idempotency_keys_admin_all" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_admin_all"
  ON public.idempotency_keys
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ==============================================================================
-- PART 5: TEMPLATE MANAGEMENT & VERSIONING
-- ==============================================================================

ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Examinations';

ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL;

ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON public.email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_archived_at ON public.email_templates(archived_at);

CREATE TABLE IF NOT EXISTS public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Examinations',
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  change_summary TEXT,
  CONSTRAINT uq_template_version UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON public.template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_at ON public.template_versions(created_at DESC);

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS template_version INTEGER;

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_versions_admin_all" ON public.template_versions;
CREATE POLICY "template_versions_admin_all"
  ON public.template_versions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 12. PHASE 6: BULK IMPORT SYSTEM & TRANSACTIONAL COMMIT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'xls')),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Uploaded' CHECK (
    status IN ('Uploaded', 'Processing', 'Ready', 'Failed', 'Committed', 'Cancelled')
  ),
  worksheet_name TEXT,
  available_sheets JSONB DEFAULT '[]'::jsonb,
  header_row INTEGER NOT NULL DEFAULT 1,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  invalid_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  selected_count INTEGER NOT NULL DEFAULT 0 CHECK (selected_count >= 0),
  mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_columns JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  committed_at TIMESTAMPTZ,
  committed_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created_by ON public.import_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON public.import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

DROP TRIGGER IF EXISTS set_import_batches_updated_at ON public.import_batches;
CREATE TRIGGER set_import_batches_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS public.import_batch_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number >= 1),
  recipient_name TEXT,
  recipient_email TEXT,
  normalized_email TEXT,
  validation_status VARCHAR(20) NOT NULL CHECK (
    validation_status IN ('valid', 'warning', 'invalid', 'duplicate')
  ),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_selected BOOLEAN NOT NULL DEFAULT true,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_batch_row_number UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch_id ON public.import_batch_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_rows_validation_status ON public.import_batch_rows(validation_status);
CREATE INDEX IF NOT EXISTS idx_import_batch_rows_selected ON public.import_batch_rows(batch_id, is_selected);
CREATE INDEX IF NOT EXISTS idx_import_batch_rows_normalized_email ON public.import_batch_rows(batch_id, normalized_email);

DROP TRIGGER IF EXISTS set_import_batch_rows_updated_at ON public.import_batch_rows;
CREATE TRIGGER set_import_batch_rows_updated_at
  BEFORE UPDATE ON public.import_batch_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_batches_admin_all" ON public.import_batches;
CREATE POLICY "import_batches_admin_all"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "import_batch_rows_admin_all" ON public.import_batch_rows;
CREATE POLICY "import_batch_rows_admin_all"
  ON public.import_batch_rows
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.commit_import_batch(
  p_batch_id UUID,
  p_campaign_name TEXT,
  p_template_id UUID,
  p_admin_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch RECORD;
  v_template RECORD;
  v_campaign_id UUID;
  v_admin_user_id UUID;
  v_selected_count INTEGER;
  v_inserted_count INTEGER := 0;
BEGIN
  SELECT id INTO v_admin_user_id
  FROM public.admin_users
  WHERE user_id = p_admin_id OR id = p_admin_id
  LIMIT 1;

  SELECT * INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import batch not found.');
  END IF;

  IF v_batch.status = 'Committed' AND v_batch.idempotency_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'success', true,
      'campaign_id', v_batch.committed_campaign_id,
      'recipients_count', v_batch.selected_count,
      'idempotent_replay', true
    );
  END IF;

  IF v_batch.status != 'Ready' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Batch cannot be committed. Current status is: ' || v_batch.status
    );
  END IF;

  SELECT * INTO v_template
  FROM public.email_templates
  WHERE id = p_template_id AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'The selected email template does not exist or has been archived.'
    );
  END IF;

  SELECT COUNT(*) INTO v_selected_count
  FROM public.import_batch_rows
  WHERE batch_id = p_batch_id
    AND is_selected = true
    AND validation_status IN ('valid', 'warning');

  IF v_selected_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No eligible selected recipients found in this batch.'
    );
  END IF;

  INSERT INTO public.campaigns (
    campaign_name,
    campaign_type,
    subject,
    template_id,
    template_version,
    template_snapshot,
    status,
    total_recipients,
    sent_count,
    failed_count,
    pending_count,
    created_by
  ) VALUES (
    trim(p_campaign_name),
    'bulk',
    v_template.subject,
    v_template.id,
    v_template.version,
    jsonb_build_object(
      'template_id', v_template.id,
      'version', v_template.version,
      'name', v_template.name,
      'subject', v_template.subject,
      'html_content', v_template.html_content,
      'text_content', v_template.text_content,
      'captured_at', timezone('utc'::text, now())
    ),
    'ready',
    v_selected_count,
    0,
    0,
    v_selected_count,
    v_admin_user_id
  )
  RETURNING id INTO v_campaign_id;

  INSERT INTO public.campaign_recipients (
    campaign_id,
    recipient_name,
    recipient_email,
    status
  )
  SELECT
    v_campaign_id,
    COALESCE(NULLIF(trim(recipient_name), ''), 'Institutional Recipient'),
    trim(recipient_email),
    'pending'
  FROM public.import_batch_rows
  WHERE batch_id = p_batch_id
    AND is_selected = true
    AND validation_status IN ('valid', 'warning')
  ORDER BY row_number ASC
  ON CONFLICT (campaign_id, normalized_email) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  UPDATE public.campaigns
  SET total_recipients = v_inserted_count,
      pending_count = v_inserted_count
  WHERE id = v_campaign_id;

  UPDATE public.import_batches
  SET status = 'Committed',
      committed_at = timezone('utc'::text, now()),
      committed_campaign_id = v_campaign_id,
      idempotency_key = p_idempotency_key,
      selected_count = v_inserted_count
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', v_campaign_id,
    'recipients_count', v_inserted_count,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_import_batch(UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_import_batch(UUID, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- PHASE 7: PERSISTENT SEQUENTIAL SENDING QUEUE
-- ------------------------------------------------------------------------------

-- 1. TABLE: queue_worker_state
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

-- 2. TABLE: queue_events
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

-- 3. EXTEND CAMPAIGNS TABLE WITH QUEUE LIFECYCLE FIELDS
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

-- 4. EXTEND CAMPAIGN_RECIPIENTS TABLE WITH CLAIM & AUDIT FIELDS
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_worker TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- 5. EXTEND EMAIL_ATTEMPTS WITH WORKER IDENTITY
ALTER TABLE public.email_attempts
  ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
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

-- 7. ATOMIC RECIPIENT CLAIM RPC FUNCTION
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
  -- 1. Oldest eligible campaign (FIFO: running before queued, oldest created_at)
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

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_number
  FROM public.email_attempts
  WHERE recipient_id = v_recipient.id;

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

  UPDATE public.campaign_recipients
  SET status = 'sending',
      attempt_count = v_attempt_number,
      claimed_at = v_now,
      claimed_by_worker = p_worker_id,
      updated_at = v_now
  WHERE id = v_recipient.id;

  UPDATE public.queue_worker_state
  SET worker_status = 'active',
      current_campaign_id = v_campaign.id,
      current_recipient_id = v_recipient.id,
      current_attempt_id = v_attempt_id,
      heartbeat_at = v_now,
      updated_at = v_now
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

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

-- 8. FINALIZE ATTEMPT & ENFORCE 5-SECOND INTERVAL RPC FUNCTION
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

  UPDATE public.campaign_recipients
  SET status = p_outcome,
      sent_at = CASE WHEN p_outcome = 'sent' THEN v_now ELSE sent_at END,
      failure_reason = p_failure_reason,
      updated_at = v_now
  WHERE id = v_attempt.recipient_id;

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

  UPDATE public.queue_worker_state
  SET worker_status = 'waiting_interval',
      current_recipient_id = NULL,
      current_attempt_id = NULL,
      last_attempt_completed_at = v_now,
      next_send_allowed_at = v_next_send_allowed,
      heartbeat_at = v_now,
      updated_at = v_now
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

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

-- 9. CRASH RECOVERY RPC FUNCTION
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
    IF v_abandoned.attempt_id IS NOT NULL THEN
      UPDATE public.email_attempts
      SET status = 'outcome_unknown',
          completed_at = v_now,
          failure_reason = 'Worker connection lost during transmission. Preserved for administrator review.'
      WHERE id = v_abandoned.attempt_id;
    END IF;

    UPDATE public.campaign_recipients
    SET status = 'outcome_unknown',
        failure_reason = 'Worker disconnected before delivery confirmation was persisted.',
        updated_at = v_now
    WHERE id = v_abandoned.recipient_id;

    UPDATE public.campaigns
    SET status = 'needs_review',
        outcome_unknown_count = outcome_unknown_count + 1
    WHERE id = v_abandoned.campaign_id;

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

REVOKE ALL ON FUNCTION public.claim_next_queue_recipient(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_queue_recipient(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_queue_attempt(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_queue_attempt(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.recover_abandoned_queue_attempts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_abandoned_queue_attempts(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- PHASE 8: EMAIL ACTIVITY & REPORTS
-- ------------------------------------------------------------------------------

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_sent_at 
  ON public.campaign_recipients(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_created_at 
  ON public.campaign_recipients(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_comp_camp_status 
  ON public.campaign_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_campaigns_comp_type_status 
  ON public.campaigns(campaign_type, status);

CREATE INDEX IF NOT EXISTS idx_email_attempts_comp_recip_num 
  ON public.email_attempts(recipient_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_email_attempts_status 
  ON public.email_attempts(status);

-- Stored procedure for atomic bulk retry
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

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = v_recipient.campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Associated campaign not found.');
  END IF;

  UPDATE public.campaign_recipients
  SET status = 'pending',
      claimed_at = NULL,
      claimed_by_worker = NULL,
      failure_reason = NULL,
      updated_at = v_now
  WHERE id = p_recipient_id;

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

-- Stored procedure for overview summary
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
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE campaign_type = 'bulk'),
    COUNT(*) FILTER (WHERE campaign_type = 'individual')
  INTO v_total_campaigns, v_bulk_campaigns, v_individual_campaigns
  FROM public.campaigns;

  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'sending'),
    COUNT(*) FILTER (WHERE status = 'outcome_unknown')
  INTO v_total_recipients, v_total_sent, v_total_failed, v_total_pending, v_total_sending, v_total_unknown
  FROM public.campaign_recipients;

  SELECT COUNT(*) INTO v_total_attempts FROM public.email_attempts;

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

REVOKE ALL ON FUNCTION public.requeue_failed_recipient(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_failed_recipient(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_reports_overview_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reports_overview_summary() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- PHASE 9: PERMANENT EMAIL TEMPLATE DELETION RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_email_template_permanently(
  p_template_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template RECORD;
  v_unsafe_count INTEGER := 0;
  v_detached_count INTEGER := 0;
  v_deleted_versions INTEGER := 0;
  v_actor_auth_id UUID := NULL;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 400,
      'code', 'INVALID_TEMPLATE_ID',
      'error', 'Template ID is required.'
    );
  END IF;

  SELECT * INTO v_template
  FROM public.email_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 404,
      'code', 'TEMPLATE_NOT_FOUND',
      'error', 'Email template not found or already deleted.'
    );
  END IF;

  PERFORM id
  FROM public.campaigns
  WHERE template_id = p_template_id
  FOR UPDATE;

  SELECT COUNT(*) INTO v_unsafe_count
  FROM public.campaigns
  WHERE template_id = p_template_id
    AND (
      template_snapshot IS NULL
      OR COALESCE(template_snapshot->>'subject', '') = ''
      OR (
        COALESCE(template_snapshot->>'html_content', '') = ''
        AND COALESCE(template_snapshot->>'text_content', '') = ''
      )
    );

  IF v_unsafe_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 409,
      'code', 'TEMPLATE_IN_USE_WITHOUT_SNAPSHOT',
      'unsafe_campaigns_count', v_unsafe_count,
      'error', format(
        'Cannot permanently delete "%s": %s campaign(s) still reference the live template without a complete immutable snapshot. Archive the template instead or wait until snapshotted.',
        v_template.name,
        v_unsafe_count
      )
    );
  END IF;

  UPDATE public.campaigns
  SET template_id = NULL,
      updated_at = timezone('utc'::text, now())
  WHERE template_id = p_template_id;

  GET DIAGNOSTICS v_detached_count = ROW_COUNT;

  SELECT COUNT(*) INTO v_deleted_versions
  FROM public.template_versions
  WHERE template_id = p_template_id;

  DELETE FROM public.email_templates
  WHERE id = p_template_id;

  IF p_admin_id IS NOT NULL THEN
    SELECT id INTO v_actor_auth_id
    FROM auth.users
    WHERE id = p_admin_id
    LIMIT 1;
  END IF;

  INSERT INTO public.queue_events (
    campaign_id,
    recipient_id,
    worker_id,
    event_type,
    event_details,
    created_by
  ) VALUES (
    NULL,
    NULL,
    NULL,
    'template_permanently_deleted',
    jsonb_build_object(
      'template_id', v_template.id,
      'template_name', v_template.name,
      'template_version', COALESCE(v_template.version, 1),
      'detached_campaigns', v_detached_count,
      'deleted_versions', v_deleted_versions,
      'actor_id', p_admin_id
    ),
    v_actor_auth_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_id', v_template.id,
    'name', v_template.name,
    'version', COALESCE(v_template.version, 1),
    'detached_campaigns', v_detached_count,
    'deleted_versions', v_deleted_versions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_email_template_permanently(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email_template_permanently(UUID, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- PHASE 10: ROLE GRANTS, FUNCTION HARDENING & COVERING FOREIGN KEY INDEXES
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO service_role, authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

REVOKE ALL ON FUNCTION public.sync_campaign_counters() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_queue_recipient(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_queue_recipient(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.commit_import_batch(UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_import_batch(UUID, TEXT, UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_queue_attempt(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_queue_attempt(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.get_reports_overview_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reports_overview_summary() TO service_role;
REVOKE ALL ON FUNCTION public.recover_abandoned_queue_attempts(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_abandoned_queue_attempts(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.requeue_failed_recipient(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_failed_recipient(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_campaigns_template_id ON public.campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON public.campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_by ON public.email_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_email_templates_updated_by ON public.email_templates(updated_by);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_by ON public.template_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_campaign_id ON public.idempotency_keys(campaign_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_committed_campaign_id ON public.import_batches(committed_campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_resolved_by ON public.campaign_recipients(resolved_by);
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by ON public.app_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_queue_events_recipient_id ON public.queue_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_created_by ON public.queue_events(created_by);
CREATE INDEX IF NOT EXISTS idx_queue_worker_state_current_campaign_id ON public.queue_worker_state(current_campaign_id);
CREATE INDEX IF NOT EXISTS idx_queue_worker_state_current_recipient_id ON public.queue_worker_state(current_recipient_id);
CREATE INDEX IF NOT EXISTS idx_queue_worker_state_current_attempt_id ON public.queue_worker_state(current_attempt_id);

COMMIT;
