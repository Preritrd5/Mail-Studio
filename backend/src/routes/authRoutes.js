import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';

export const authRouter = Router();

/**
 * Verifies the active administrator bearer token against backend middleware
 * without issuing direct browser-side queries to public.admin_users.
 */
authRouter.get('/auth/session', requireAdminAuth, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      isAdmin: true,
      profile: {
        id: req.admin?.id,
        userId: req.admin?.user_id || req.user?.id,
        displayName:
          req.admin?.display_name ||
          req.user?.user_metadata?.display_name ||
          req.user?.email?.split('@')[0] ||
          'Administrator',
        email: req.admin?.email || req.user?.email || '',
        createdAt: req.admin?.created_at,
      },
    },
  });
});
