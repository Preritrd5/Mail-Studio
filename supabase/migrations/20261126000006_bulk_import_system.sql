-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - PHASE 6: BULK RECIPIENT IMPORT & CAMPAIGN PREPARATION
-- ==============================================================================
-- Creates persistent import batches, staging rows, validation indexing, RLS,
-- and the atomic transactional commit function for bulk campaign creation.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: import_batches
-- Purpose: Persist file upload metadata, column mappings, validation summaries,
-- and lifecycle states across browser sessions.
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

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_import_batches_updated_at ON public.import_batches;
CREATE TRIGGER set_import_batches_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. TABLE: import_batch_rows
-- Purpose: Store individual staging rows with original row numbering,
-- authoritative validation classifications, error reasons, and selection state.
-- ------------------------------------------------------------------------------
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

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_import_batch_rows_updated_at ON public.import_batch_rows;
CREATE TRIGGER set_import_batch_rows_updated_at
  BEFORE UPDATE ON public.import_batch_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batch_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Certified admins can select import batches" ON public.import_batches;
CREATE POLICY "Certified admins can select import batches"
  ON public.import_batches FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Certified admins can insert import batches" ON public.import_batches;
CREATE POLICY "Certified admins can insert import batches"
  ON public.import_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Certified admins can update import batches" ON public.import_batches;
CREATE POLICY "Certified admins can update import batches"
  ON public.import_batches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Certified admins can select batch rows" ON public.import_batch_rows;
CREATE POLICY "Certified admins can select batch rows"
  ON public.import_batch_rows FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Certified admins can insert batch rows" ON public.import_batch_rows;
CREATE POLICY "Certified admins can insert batch rows"
  ON public.import_batch_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Certified admins can update batch rows" ON public.import_batch_rows;
CREATE POLICY "Certified admins can update batch rows"
  ON public.import_batch_rows FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 4. TRANSACTIONAL COMMIT RPC FUNCTION
-- Purpose: Atomically creates the bulk campaign, captures the template snapshot,
-- inserts all selected recipients, and marks the import batch Committed.
-- ------------------------------------------------------------------------------
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
  v_recipient RECORD;
  v_inserted_count INTEGER := 0;
BEGIN
  -- 1. Verify administrator existence
  SELECT id INTO v_admin_user_id
  FROM public.admin_users
  WHERE user_id = p_admin_id OR id = p_admin_id
  LIMIT 1;

  -- 2. Lock and retrieve import batch
  SELECT * INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import batch not found.');
  END IF;

  -- 3. Check idempotency: If already committed with same key, return existing campaign
  IF v_batch.status = 'Committed' AND v_batch.idempotency_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'success', true,
      'campaign_id', v_batch.committed_campaign_id,
      'recipients_count', v_batch.selected_count,
      'idempotent_replay', true
    );
  END IF;

  -- 4. If batch is not in Ready state, reject commit
  IF v_batch.status != 'Ready' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Batch cannot be committed. Current status is: ' || v_batch.status
    );
  END IF;

  -- 5. Retrieve active template and snapshot
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

  -- 6. Count valid and selected rows
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

  -- 7. Create bulk campaign record in 'ready' state (NOT sending, awaiting Phase 7 queue)
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

  -- 8. Bulk insert unique selected recipients into campaign_recipients
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

  -- 9. Update campaign total and pending counters to exact inserted count
  UPDATE public.campaigns
  SET total_recipients = v_inserted_count,
      pending_count = v_inserted_count
  WHERE id = v_campaign_id;

  -- 10. Update import batch to Committed
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

-- Grant execution to authenticated and service roles
REVOKE ALL ON FUNCTION public.commit_import_batch(UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_import_batch(UUID, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;

COMMIT;
