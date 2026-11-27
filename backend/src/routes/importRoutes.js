import { Router } from 'express';
import multer from 'multer';
import { requireAdminAuth } from '../middleware/auth.js';
import * as importController from '../controllers/importController.js';

export const importRouter = Router();

// Configure Multer for memory storage with 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

// All bulk import endpoints require certified administrator authorization
importRouter.use('/imports', requireAdminAuth);

// 1. Upload and process spreadsheet
importRouter.post('/imports', upload.single('file'), importController.uploadAndProcess);

// 2. Retrieve batch metadata and validation summary
importRouter.get('/imports/:id', importController.getBatch);

// 3. Retrieve paginated and filtered staging rows
importRouter.get('/imports/:id/rows', importController.getBatchRows);

// 4. Update column mapping and re-validate
importRouter.patch('/imports/:id/mapping', importController.updateMapping);

// 5. Update row selection status
importRouter.patch('/imports/:id/selection', importController.updateSelection);

// 6. Transactionally commit import batch and create bulk campaign in ready state
importRouter.post('/imports/:id/commit', importController.commitImport);

// 7. Cancel uncommitted batch
importRouter.post('/imports/:id/cancel', importController.cancelImport);
