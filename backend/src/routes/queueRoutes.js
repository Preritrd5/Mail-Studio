import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import {
  getQueueStatusHandler,
  getWorkerHealthHandler,
  listQueueCampaignsHandler,
  getCampaignDetailsHandler,
  startCampaignHandler,
  pauseCampaignHandler,
  resumeCampaignHandler,
  cancelCampaignHandler,
  resolveOutcomeUnknownHandler,
  executeStepHandler,
} from '../controllers/queueController.js';

export const queueRouter = Router();

// All queue endpoints require administrator authentication
queueRouter.use(requireAdminAuth);

// Status and monitoring
queueRouter.get('/queue', getQueueStatusHandler);
queueRouter.get('/queue/worker/health', getWorkerHealthHandler);

// Campaign queue operations
queueRouter.get('/queue/campaigns', listQueueCampaignsHandler);
queueRouter.get('/queue/campaigns/:id', getCampaignDetailsHandler);
queueRouter.post('/queue/campaigns/:id/start', startCampaignHandler);
queueRouter.post('/queue/campaigns/:id/pause', pauseCampaignHandler);
queueRouter.post('/queue/campaigns/:id/resume', resumeCampaignHandler);
queueRouter.post('/queue/campaigns/:id/cancel', cancelCampaignHandler);

// Outcome Unknown resolution
queueRouter.post('/queue/recipients/:id/resolve-outcome', resolveOutcomeUnknownHandler);

// Manual or test-triggered step execution
queueRouter.post('/queue/step', executeStepHandler);
