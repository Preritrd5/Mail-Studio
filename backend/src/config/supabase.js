import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

// Server-side privileged Supabase client
// Never exposes SUPABASE_SECRET_KEY to client-side bundles
const liveSupabaseAdmin = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

let activeClient = liveSupabaseAdmin;

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
