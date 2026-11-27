import { z } from 'zod';
import { sanitizeEmailHtml } from '../utils/emailHtmlSanitizer.js';

// Subject header sanitization: strictly disallow carriage return and newline characters to prevent SMTP header injection
export function sanitizeSubjectHeader(subject) {
  if (typeof subject !== 'string') return '';
  return subject.replace(/[\r\n\t]/g, ' ').trim();
}

// Zod Schema for Individual Email Sending
export const sendEmailSchema = z.object({
  template_id: z
    .string()
    .trim()
    .max(128)
    .optional(),

  template_version: z
    .number()
    .int()
    .positive()
    .optional(),

  recipient_name: z
    .string({ required_error: 'Recipient name is required' })
    .trim()
    .min(1, 'Recipient name cannot be empty')
    .max(100, 'Recipient name must not exceed 100 characters'),
  
  recipient_email: z
    .string({ required_error: 'Recipient email is required' })
    .trim()
    .email('Invalid email address format')
    .max(255, 'Recipient email must not exceed 255 characters'),

  designation: z
    .string()
    .trim()
    .max(150)
    .optional(),

  activation_link: z
    .string()
    .trim()
    .max(500)
    .optional(),

  institution_name: z
    .string()
    .trim()
    .max(150)
    .optional(),

  raw_subject: z
    .string()
    .trim()
    .max(200)
    .refine((val) => !/[\r\n]/.test(val), {
      message: 'Subject line contains invalid characters (header injection rejected)',
    })
    .optional(),
  
  subject: z
    .string()
    .trim()
    .max(200, 'Subject line must not exceed 200 characters')
    .refine((val) => !/[\r\n]/.test(val), {
      message: 'Subject line contains invalid characters (header injection rejected)',
    })
    .optional(),
  
  html_content: z
    .string()
    .max(150000, 'HTML content must not exceed 150KB')
    .optional(),
  
  text_content: z
    .string()
    .max(50000, 'Text content must not exceed 50KB')
    .optional(),
  
  campaign_name: z
    .string()
    .trim()
    .max(150, 'Campaign name must not exceed 150 characters')
    .optional()
    .default('Individual Transactional Dispatch'),
  
  idempotency_key: z
    .string({ required_error: 'Idempotency key is required' })
    .trim()
    .min(8, 'Idempotency key must be at least 8 characters')
    .max(128, 'Idempotency key must not exceed 128 characters'),
}).refine(
  (data) => Boolean(data.template_id) || (Boolean(data.subject) && data.subject.length > 0),
  {
    message: 'Subject line is required',
    path: ['subject'],
  }
).refine(
  (data) => Boolean(data.template_id) || (data.html_content && data.html_content.trim().length > 0) || (data.text_content && data.text_content.trim().length > 0),
  {
    message: 'Either html_content, text_content, or template_id must be provided and non-empty',
    path: ['html_content'],
  }
);

/**
 * Validates request payload and sanitizes HTML & subject headers
 */
export function validateAndSanitizeSendEmail(rawPayload) {
  // Reject arrays or multiple recipients (Strictly exactly one recipient)
  if (Array.isArray(rawPayload.recipient_email) || Array.isArray(rawPayload.recipient_name)) {
    throw {
      statusCode: 400,
      code: 'MULTIPLE_RECIPIENTS_REJECTED',
      message: 'Individual sending endpoint accepts exactly one recipient. Multiple recipients are rejected.',
    };
  }

  // Reject unexpected or dangerous fields like credentials or admin IDs
  if (rawPayload.sender_credentials || rawPayload.admin_id || rawPayload.smtp_pass) {
    throw {
      statusCode: 400,
      code: 'FORBIDDEN_FIELDS_DETECTED',
      message: 'Client cannot provide sender credentials or administrative overrides.',
    };
  }

  const parseResult = sendEmailSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    const errorList = parseResult.error.issues || parseResult.error.errors || [];
    const errorDetails = errorList.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    throw {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: errorDetails[0]?.message || 'Request payload validation failed.',
      details: errorDetails,
    };
  }

  const validData = parseResult.data;

  // Sanitize subject header to eliminate header injection risk
  const sanitizedSubject = sanitizeSubjectHeader(validData.subject || validData.raw_subject || '');

  // Sanitize HTML body preserving responsive layout & email tables
  let sanitizedHtml = validData.html_content;
  if (sanitizedHtml) {
    sanitizedHtml = sanitizeEmailHtml(sanitizedHtml);
  }

  return {
    template_id: validData.template_id || null,
    template_version: validData.template_version || null,
    recipient_name: validData.recipient_name,
    recipient_email: validData.recipient_email.toLowerCase(),
    designation: validData.designation || '',
    activation_link: validData.activation_link || '',
    institution_name: validData.institution_name || 'SNPSUNEXUS',
    raw_subject: validData.raw_subject ? sanitizeSubjectHeader(validData.raw_subject) : '',
    subject: sanitizedSubject,
    html_content: sanitizedHtml,
    text_content: validData.text_content || '',
    campaign_name: validData.campaign_name,
    idempotency_key: validData.idempotency_key,
  };
}
