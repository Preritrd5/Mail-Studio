import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

// Server-side privileged Supabase client
// Never exposes SUPABASE_SECRET_KEY to client-side bundles
const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseSecretKey);
let liveSupabaseAdmin = null;
let supabaseInitError = null;

try {
  liveSupabaseAdmin = createClient(
    config.supabaseUrl || 'https://unconfigured.supabase.co',
    config.supabaseSecretKey || 'unconfigured-secret-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
} catch (err) {
  supabaseInitError = err?.message || 'Failed to initialize Supabase admin client.';
  console.warn('[Supabase Config Notice]:', supabaseInitError);
}

let activeClient = liveSupabaseAdmin;

export function isSupabaseConfigured() {
  return (hasSupabaseConfig && !supabaseInitError && Boolean(liveSupabaseAdmin)) || activeClient !== liveSupabaseAdmin;
}

/**
 * Allows isolated automated tests (NODE_ENV === 'test' only) to inject an ephemeral test database adapter.
 * Production and development runtimes always execute directly against the live Supabase PostgreSQL project.
 */
export function setTestSupabaseClient(mockClient = null) {
  if (config.nodeEnv !== 'test' && process.env.NODE_ENV !== 'test') {
    throw new Error('Test database adapter injection is strictly forbidden outside NODE_ENV=test.');
  }
  activeClient = mockClient || liveSupabaseAdmin;
}

export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const value = activeClient[prop];
      return typeof value === 'function' ? value.bind(activeClient) : value;
    },
  }
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves a public.admin_users primary key (`id`) from either an admin_users.id
 * or an auth.users.id (`user_id`). Returns null cleanly if invalid or absent so
 * nullable foreign keys referencing public.admin_users(id) never fail with 23503/22P02.
 */
export async function resolveAdminUsersRecordId(actorId) {
  if (!actorId || typeof actorId !== 'string') return null;
  const trimmed = actorId.trim();
  if (!UUID_REGEX.test(trimmed)) return null;

  const { data: byUserId, error: byUserErr } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('user_id', trimmed)
    .maybeSingle();

  if (byUserErr) {
    throw createDatabaseError('resolveAdminUsersRecordId.byUserId', byUserErr);
  }
  if (byUserId?.id) {
    return byUserId.id;
  }

  const { data: byAdminId, error: byAdminErr } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('id', trimmed)
    .maybeSingle();

  if (byAdminErr) {
    throw createDatabaseError('resolveAdminUsersRecordId.byAdminId', byAdminErr);
  }
  return byAdminId?.id || null;
}

/**
 * Helper to translate Supabase / PostgREST failures into explicit HTTP 503 service errors
 * so repositories never substitute dummy fallback records or mask database failures as empty states.
 */
export function createDatabaseError(operation, error) {
  const isMissingSchema = error?.code === 'PGRST205' || String(error?.message || '').includes('schema cache');
  const err = new Error(
    isMissingSchema
      ? `Database schema not initialized during ${operation}: ${error.message}`
      : `Database error during ${operation}: ${error?.message || 'Unable to query Supabase.'}`
  );
  err.statusCode = 503;
  err.code = isMissingSchema ? 'DATABASE_SCHEMA_MISSING' : 'DATABASE_UNAVAILABLE';
  return err;
}
