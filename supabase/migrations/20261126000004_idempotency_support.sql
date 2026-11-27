-- ==============================================================================
-- SNPSUNEXUS MAIL STUDIO - MIGRATION 04: IDEMPOTENCY & DUPLICATE PROTECTION
-- ==============================================================================
-- Purpose: Additive migration for strict database-level duplicate prevention,
--          concurrent request locking, and idempotent response caching.
-- ==============================================================================

-- 1. Add idempotency_key to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- 2. Create idempotency_keys table
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

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_idempotency_keys_updated_at ON public.idempotency_keys;
CREATE TRIGGER set_idempotency_keys_updated_at
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- 3. Row Level Security for idempotency_keys
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idempotency_keys_admin_all" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_admin_all"
  ON public.idempotency_keys
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
