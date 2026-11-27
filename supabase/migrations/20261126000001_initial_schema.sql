-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - MIGRATION 01: INITIAL NORMALIZED SCHEMA
-- ==============================================================================
-- Purpose: Normalized schema with UUID primary keys, foreign keys, constraints,
--          indexes, updated_at triggers, and automated campaign counter sync.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. TABLE: admin_users
-- Purpose: Identify authorized administrators. One record per authorized auth.users record.
-- Strict: No public self-registration.
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger for admin_users updated_at
DROP TRIGGER IF EXISTS set_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER set_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- 4. TABLE: email_templates
-- Purpose: Store reusable email templates with standard university placeholders.
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

-- Trigger for email_templates updated_at
DROP TRIGGER IF EXISTS set_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- 5. TABLE: campaigns
-- Purpose: Store individual and bulk email campaign records.
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

-- 6. TABLE: campaign_recipients
-- Purpose: Store each campaign recipient independently with normalized email.
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

-- Trigger for campaign_recipients updated_at
DROP TRIGGER IF EXISTS set_campaign_recipients_updated_at ON public.campaign_recipients;
CREATE TRIGGER set_campaign_recipients_updated_at
  BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- 7. TABLE: email_attempts
-- Purpose: Maintain an auditable history of sending attempts without erasing failed attempts.
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

-- 8. TABLE: app_settings
-- Purpose: Application configuration settings (no secrets or passwords).
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

-- Trigger for app_settings updated_at
DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- 9. AUTOMATED CAMPAIGN COUNTER SYNCHRONIZATION FUNCTION & TRIGGER
-- Ensures campaign counters (total, sent, failed, pending) remain strictly synchronized
-- without race conditions or conflicting manual client-side updates.
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
