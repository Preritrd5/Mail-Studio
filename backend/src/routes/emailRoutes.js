import { Router } from 'express';
import { sendEmail, getEmailHealth } from '../controllers/emailController.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { emailRateLimiter } from '../middleware/rateLimiter.js';

export const emailRouter = Router();

// Protected health check for email service
emailRouter.get('/emails/health', requireAdminAuth, getEmailHealth);

// Protected individual email sending endpoint
// Enforces: Administrator JWT authentication, Rate Limiter, and Body validation
emailRouter.post('/emails/send', requireAdminAuth, emailRateLimiter, sendEmail);
