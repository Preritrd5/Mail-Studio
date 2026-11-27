import { Router } from 'express';
import { getHealth, getSystemStatus } from '../controllers/healthController.js';
import { requireAdminAuth } from '../middleware/auth.js';

export const healthRouter = Router();

healthRouter.get('/health', getHealth);
healthRouter.get('/system/status', requireAdminAuth, getSystemStatus);
