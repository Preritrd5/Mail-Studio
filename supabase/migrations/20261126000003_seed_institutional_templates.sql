-- ==============================================================================
-- SNPSUNEXUS Mail Studio
-- Operational Settings Initialization (Sample/Demo Templates Purged)
-- ==============================================================================
-- NOTE: Sample institutional templates and demo branding seeds have been
-- intentionally removed for production hygiene. Email templates must only be
-- created by authenticated administrators through the application.

INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
(
  'system_rate_limits',
  '{ "default_emails_per_sec": 1, "mandatory_interval_seconds": 5, "max_burst_per_min": 12, "smtp_timeout_ms": 15000 }'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;
