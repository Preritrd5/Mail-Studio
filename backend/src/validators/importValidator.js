import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidParamSchema = z.string().regex(UUID_REGEX, 'Invalid UUID parameter format.');

export const updateMappingSchema = z.object({
  emailColumn: z.string().trim().min(1, 'Email Address column mapping is required.'),
  nameColumn: z.string().trim().min(1, 'Full Name column mapping is required.'),
  headerRow: z.number().int().min(1).default(1),
  worksheetName: z.string().optional(),
}).refine((data) => data.emailColumn !== data.nameColumn, {
  message: 'Full Name and Email Address must be mapped to different columns.',
});

export const updateSelectionSchema = z.object({
  rowIds: z.array(z.union([z.string(), z.number()])).optional(),
  isSelected: z.boolean(),
  selectAllStatus: z.enum(['valid', 'warning', 'invalid', 'duplicate', 'all']).optional(),
});

export const commitImportSchema = z.object({
  campaignName: z.string().trim().min(3, 'Campaign name must be at least 3 characters.').max(255, 'Campaign name cannot exceed 255 characters.'),
  templateId: z.string().regex(UUID_REGEX, 'Template ID must be a valid UUID.'),
  idempotencyKey: z.string().trim().min(8, 'Idempotency key must be at least 8 characters.').max(128),
});
