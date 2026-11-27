-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - SECURE ADMINISTRATOR BOOTSTRAP SQL
-- ==============================================================================
-- Purpose: Controlled procedure to register the initial super administrator.
-- Execution: Can be run in Supabase SQL Editor or automated via server-side script.
-- Note: Replaces <TARGET_AUTH_USER_UUID> with the auth.users id.
-- ==============================================================================

-- Function to safely link an existing Auth user as an authorized Administrator
CREATE OR REPLACE FUNCTION public.bootstrap_admin_user(
  target_user_id UUID,
  target_display_name TEXT,
  target_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Verify the target user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user ID % does not exist in auth.users', target_user_id;
  END IF;

  -- Insert or update into public.admin_users
  INSERT INTO public.admin_users (user_id, display_name, email)
  VALUES (target_user_id, target_display_name, target_email)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    updated_at = now();

  RAISE NOTICE 'Administrator successfully authorized: % (%)', target_display_name, target_email;
END;
$$;

-- Revoke all permissions on bootstrap function from public & anon
REVOKE ALL ON FUNCTION public.bootstrap_admin_user(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_admin_user(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_admin_user(UUID, TEXT, TEXT) FROM authenticated;
