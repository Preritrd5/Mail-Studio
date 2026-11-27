import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import {
  getOverviewHandler,
  listCampaignReportsHandler,
  getCampaignReportDetailHandler,
  getTimelineHandler,
  exportCsvHandler,
  exportExcelHandler,
} from '../controllers/reportsController.js';

export const reportsRouter = Router();

// All reporting and analytics endpoints require administrator authorization
reportsRouter.use(requireAdminAuth);

reportsRouter.get('/reports/overview', getOverviewHandler);
reportsRouter.get('/reports/campaigns', listCampaignReportsHandler);
reportsRouter.get('/reports/campaigns/:id', getCampaignReportDetailHandler);
reportsRouter.get('/reports/timeline', getTimelineHandler);
reportsRouter.get('/reports/export/csv', exportCsvHandler);
reportsRouter.get('/reports/export/xlsx', exportExcelHandler);
