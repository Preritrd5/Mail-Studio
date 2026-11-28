-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - PHASE 10: ROLE GRANTS, FUNCTION HARDENING & INDEXES
-- ==============================================================================
-- Grants explicit schema/table privileges for service_role and RLS-protected
-- authenticated access, locks SECURITY DEFINER RPCs strictly to service_role,
-- and adds covering indexes on foreign key columns.
-- ==============================================================================

BEGIN;

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
