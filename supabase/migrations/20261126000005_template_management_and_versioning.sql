-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - MIGRATION 05: TEMPLATE MANAGEMENT & VERSIONING
-- ==============================================================================
-- Purpose: Additive migration for template categories, version tracking,
--          safe archival (soft-delete), and historical version snapshots.
-- ==============================================================================

-- 1. Add category, version, updated_by, and archived_at to email_templates
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

-- 2. Create template_versions table for historical immutable snapshots
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

-- 3. Add template_version and template_snapshot to campaigns table for immutable historical integrity
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS template_version INTEGER;

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

-- 4. Row Level Security for template_versions
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_versions_admin_all" ON public.template_versions;
CREATE POLICY "template_versions_admin_all"
  ON public.template_versions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
