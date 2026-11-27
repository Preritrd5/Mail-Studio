import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import {
  listActivityHandler,
  getActivityDetailHandler,
  retryActivityHandler,
} from '../controllers/activityController.js';

export const activityRouter = Router();

// All email activity endpoints require administrator authorization
activityRouter.use(requireAdminAuth);

activityRouter.get('/activity', listActivityHandler);
activityRouter.get('/activity/:id', getActivityDetailHandler);
activityRouter.post('/activity/:id/retry', retryActivityHandler);
