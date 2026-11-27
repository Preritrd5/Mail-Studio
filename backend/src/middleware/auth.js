import { supabaseAdmin, createDatabaseError } from '../config/supabase.js';

/**
 * Shared authentication and administrator authorization resolver.
 * Supports optional unauthenticated inspection for /api/auth/session while
 * keeping all protected endpoints fail-closed (HTTP 401/403/503).
 */
export async function resolveAdminAuth(req, { allowMissingToken = false } = {}) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (allowMissingToken) {
      return { ok: true, authenticated: false, isAdmin: false, user: null, admin: null };
    }
    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Missing or malformed Authorization Bearer token.',
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Empty authentication token provided.',
    };
  }

  // Strictly accept synthetic test token ONLY during automated NODE_ENV=test execution
  if (process.env.NODE_ENV === 'test' && token === 'demo-admin-token') {
    const testUser = {
      id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
      email: 'admin@snpsu.edu.in',
      app_metadata: { role: 'administrator' },
      user_metadata: { display_name: 'Test Administrator' },
    };
    const testAdmin = {
      user_id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
      display_name: 'Test Administrator',
      email: 'admin@snpsu.edu.in',
    };
    return { ok: true, authenticated: true, isAdmin: true, user: testUser, admin: testAdmin };
  }

  // 1. Verify JWT access token against Supabase Auth
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    return {
      ok: false,
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: authError?.message || 'Authentication token is invalid or expired.',
    };
  }

  const user = userData.user;

  // 2. Verify administrator authorization exclusively via public.admin_users
  //    or server-only app_metadata (never editable user_metadata or email substrings).
  const { data: adminRecord, error: dbError } = await supabaseAdmin
    .from('admin_users')
    .select('id, user_id, display_name, email, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (dbError) {
    // Allow non-editable service-role app_metadata.role === 'administrator' only as secondary check
    if (user.app_metadata?.role === 'administrator') {
      return {
        ok: true,
        authenticated: true,
        isAdmin: true,
        user,
        admin: {
          user_id: user.id,
          display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
          email: user.email,
        },
      };
    }
    const mappedErr = createDatabaseError('auth.verifyAdminUsers', dbError);
    return {
      ok: false,
      statusCode: mappedErr.statusCode || 503,
      code: mappedErr.code || 'DATABASE_UNAVAILABLE',
      message: mappedErr.message,
    };
  }

  if (adminRecord) {
    return { ok: true, authenticated: true, isAdmin: true, user, admin: adminRecord };
  }

  if (user.app_metadata?.role === 'administrator') {
    return {
      ok: true,
      authenticated: true,
      isAdmin: true,
      user,
      admin: {
        user_id: user.id,
        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
        email: user.email,
      },
    };
  }

  return {
    ok: false,
    statusCode: 403,
    code: 'FORBIDDEN',
    message: 'Access restricted: User is authenticated but lacks Certified Administrator privileges.',
  };
}

/**
 * Authentication and Administrator Authorization Middleware
 * Verifies Supabase JWT access token and ensures user is registered in public.admin_users
 */
export async function requireAdminAuth(req, res, next) {
  try {
    const result = await resolveAdminAuth(req, { allowMissingToken: false });
    if (!result.ok) {
      return res.status(result.statusCode).json({
        success: false,
        error: {
          code: result.code,
          message: result.message,
          requestId: req.requestId,
        },
      });
    }

    req.user = result.user;
    req.admin = result.admin;
    next();
  } catch (error) {
    next(error);
  }
}
