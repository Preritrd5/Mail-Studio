-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - PHASE 9: PERMANENT EMAIL TEMPLATE DELETION
-- ==============================================================================
-- Provides atomic PostgreSQL stored procedure to permanently delete a template
-- along with its owned template_versions while strictly preserving historical
-- campaign snapshots, recipients, email attempts, and audit trails.
-- ==============================================================================

BEGIN;

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

  -- Lock target template row for update to prevent concurrent edits/deletions
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

  -- Lock referencing campaigns and ensure every linked campaign preserves a complete immutable snapshot
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

  -- Detach live foreign key on snapshotted historical/queued campaigns without deleting campaigns or attempts
  UPDATE public.campaigns
  SET template_id = NULL,
      updated_at = timezone('utc'::text, now())
  WHERE template_id = p_template_id;

  GET DIAGNOSTICS v_detached_count = ROW_COUNT;

  SELECT COUNT(*) INTO v_deleted_versions
  FROM public.template_versions
  WHERE template_id = p_template_id;

  -- Permanently remove template row (cascades owned template_versions rows)
  DELETE FROM public.email_templates
  WHERE id = p_template_id;

  -- Resolve optional actor reference safely for audit event FK
  IF p_admin_id IS NOT NULL THEN
    SELECT id INTO v_actor_auth_id
    FROM auth.users
    WHERE id = p_admin_id
    LIMIT 1;
  END IF;

  -- Record non-PII deletion audit trail without storing sensitive template contents or personal data
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

COMMIT;
