-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - MIGRATION 02: ROW LEVEL SECURITY & REALTIME
-- ==============================================================================
-- Purpose: Strict admin-only access control. Anonymous and non-admin users
--          are locked out. Verified administrators can read and manage data.
-- ==============================================================================

-- 1. SECURITY DEFINER HELPER: is_admin
-- Checks if the authenticated user's auth.uid() exists in public.admin_users
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

-- Grant execution to authenticated users only
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES: admin_users
-- Admins can read the admin list; only authorized superadmin or bootstrap can insert/update.
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

-- 4. POLICIES: email_templates
DROP POLICY IF EXISTS "Admins have full access to email templates" ON public.email_templates;
CREATE POLICY "Admins have full access to email templates"
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. POLICIES: campaigns
DROP POLICY IF EXISTS "Admins have full access to campaigns" ON public.campaigns;
CREATE POLICY "Admins have full access to campaigns"
  ON public.campaigns
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 6. POLICIES: campaign_recipients
DROP POLICY IF EXISTS "Admins have full access to campaign recipients" ON public.campaign_recipients;
CREATE POLICY "Admins have full access to campaign recipients"
  ON public.campaign_recipients
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 7. POLICIES: email_attempts
DROP POLICY IF EXISTS "Admins have full access to email attempts" ON public.email_attempts;
CREATE POLICY "Admins have full access to email attempts"
  ON public.email_attempts
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 8. POLICIES: app_settings
DROP POLICY IF EXISTS "Admins have full access to app settings" ON public.app_settings;
CREATE POLICY "Admins have full access to app settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 9. SUPABASE REALTIME CONFIGURATION
-- Add relevant operational tables to the supabase_realtime publication
DO $$
BEGIN
  -- Enable publication on campaigns
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
  END IF;

  -- Enable publication on campaign_recipients
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'campaign_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
  END IF;

  -- Enable publication on email_attempts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'email_attempts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_attempts;
  END IF;
END;
$$;
