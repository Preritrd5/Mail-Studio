import { Router } from 'express';
import { resolveAdminAuth } from '../middleware/auth.js';

export const authRouter = Router();

/**
 * Resolves the current administrator session.
 * - No Bearer token: HTTP 200 { authenticated: false, isAdmin: false, profile: null }
 * - Invalid / expired token: HTTP 401
 * - Non-admin user: HTTP 403
 * - Missing database schema / backend outage: HTTP 503
 * - Authorized admin: HTTP 200 { authenticated: true, isAdmin: true, profile }
 */
authRouter.get('/auth/session', async (req, res, next) => {
  try {
    const result = await resolveAdminAuth(req, { allowMissingToken: true });

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

    if (!result.authenticated) {
      return res.status(200).json({
        success: true,
        data: {
          authenticated: false,
          isAdmin: false,
          profile: null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        isAdmin: true,
        profile: {
          id: result.admin?.id,
          userId: result.admin?.user_id || result.user?.id,
          displayName:
            result.admin?.display_name ||
            result.user?.user_metadata?.display_name ||
            result.user?.email?.split('@')[0] ||
            'Administrator',
          email: result.admin?.email || result.user?.email || '',
          createdAt: result.admin?.created_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});
