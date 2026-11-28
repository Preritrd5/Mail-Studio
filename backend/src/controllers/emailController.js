import { executeSendIndividualEmail } from '../services/emailService.js';
import { verifySmtpConnection } from '../services/smtpService.js';

export async function sendEmail(req, res, next) {
  try {
    const result = await executeSendIndividualEmail(req.body, req.user, req.admin);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    next(error);
  }
}

export async function getEmailHealth(req, res, next) {
  try {
    const smtpHealth = await verifySmtpConnection();
    const isHealthy = smtpHealth.connected;

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'operational' : 'degraded',
      service: 'Individual Email Dispatch Gateway',
      smtp: {
        host: 'smtp.gmail.com:465',
        tlsStrict: true,
        authenticated: isHealthy,
        ...(isHealthy ? {} : { error: smtpHealth.error }),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
