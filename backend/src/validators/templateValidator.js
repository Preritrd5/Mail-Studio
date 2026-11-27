import { z } from 'zod';
import { inspectPlaceholders } from '../services/placeholderRegistry.js';
import { sanitizeEmailHtml } from '../utils/emailHtmlSanitizer.js';

export const createTemplateSchema = z.object({
  name: z
    .string({ required_error: 'Template name is required' })
    .trim()
    .min(1, 'Template name cannot be empty')
    .max(120, 'Template name must not exceed 120 characters'),
  description: z
    .string()
    .trim()
    .max(300, 'Description must not exceed 300 characters')
    .optional()
    .default(''),
  category: z
    .enum(['Examinations', 'Fees', 'Admissions', 'Notifications', 'General'], {
      errorMap: () => ({ message: 'Category must be Examinations, Fees, Admissions, Notifications, or General' }),
    })
    .default('Examinations'),
  subject: z
    .string({ required_error: 'Subject line is required' })
    .trim()
    .min(1, 'Subject line cannot be empty')
    .max(200, 'Subject line must not exceed 200 characters')
    .refine((val) => !/[\r\n]/.test(val), {
      message: 'Subject line contains invalid newline characters',
    }),
  html_content: z
    .string({ required_error: 'HTML content is required' })
    .min(1, 'HTML content cannot be empty')
    .max(150000, 'HTML content must not exceed 150KB'),
  text_content: z
    .string()
    .max(50000, 'Text content must not exceed 50KB')
    .optional()
    .default(''),
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(300).optional(),
  category: z.enum(['Examinations', 'Fees', 'Admissions', 'Notifications', 'General']).optional(),
  subject: z.string().trim().min(1).max(200).refine((val) => !/[\r\n]/.test(val), {
    message: 'Subject line contains invalid newline characters',
  }).optional(),
  html_content: z.string().min(1).max(150000).optional(),
  text_content: z.string().max(50000).optional(),
  change_summary: z.string().max(250).optional(),
});

/**
 * Validates and sanitizes template payload
 */
export function validateAndSanitizeTemplate(rawPayload, isUpdate = false) {
  const schema = isUpdate ? updateTemplateSchema : createTemplateSchema;
  const result = schema.safeParse(rawPayload);

  if (!result.success) {
    const errorList = result.error.issues || result.error.errors || [];
    const errorDetails = errorList.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: errorDetails[0]?.message || 'Template validation failed.',
      details: errorDetails,
    };
  }

  const validData = result.data;

  // Sanitize HTML preserving valid email layout while blocking scripts/XSS
  if (validData.html_content) {
    validData.html_content = sanitizeEmailHtml(validData.html_content);
  }

  // Check for unsupported placeholders in subject and content
  const subjectCheck = inspectPlaceholders(validData.subject);
  const htmlCheck = inspectPlaceholders(validData.html_content);
  const textCheck = inspectPlaceholders(validData.text_content);

  const allUnsupported = Array.from(new Set([
    ...subjectCheck.unsupported,
    ...htmlCheck.unsupported,
    ...textCheck.unsupported,
  ]));

  return {
    ...validData,
    unsupportedPlaceholders: allUnsupported,
  };
}
