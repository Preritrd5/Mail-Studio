import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import * as templateCtrl from '../controllers/templateController.js';

export const templateRouter = Router();

// Centralized dynamic placeholder registry metadata
templateRouter.get('/templates/placeholders', requireAdminAuth, templateCtrl.getPlaceholders);

// Safe draft template preview
templateRouter.post('/templates/preview', requireAdminAuth, templateCtrl.previewTemplate);

// Template list and CRUD operations (All strictly protected by administrator authorization)
templateRouter.get('/templates', requireAdminAuth, templateCtrl.getTemplates);
templateRouter.get('/templates/:id', requireAdminAuth, templateCtrl.getTemplate);
templateRouter.post('/templates', requireAdminAuth, templateCtrl.createTemplate);
templateRouter.put('/templates/:id', requireAdminAuth, templateCtrl.updateTemplate);
templateRouter.post('/templates/:id/duplicate', requireAdminAuth, templateCtrl.duplicateTemplate);
templateRouter.patch('/templates/:id/archive', requireAdminAuth, templateCtrl.archiveTemplate);
templateRouter.patch('/templates/:id/restore', requireAdminAuth, templateCtrl.restoreTemplate);
templateRouter.delete('/templates/:id', requireAdminAuth, templateCtrl.deleteTemplate);
templateRouter.post('/templates/:id/preview', requireAdminAuth, templateCtrl.previewTemplate);
