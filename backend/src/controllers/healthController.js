import { config } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { queueService } from '../queue/queueService.js';

export function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'SNPSUNEXUS Mail Studio API',
    brand: 'SNPSUNEXUS',
    version: '1.0.0',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Authenticated infrastructure verification endpoint reporting actual database,
 * SMTP configuration, and global worker state without fabricated indicators.
 */
export async function getSystemStatus(req, res, next) {
  try {
    const smtpConfigured = Boolean(config.gmailUser && config.gmailAppPassword);

    let dbConnected = false;
    let dbError = null;
    try {
      const { error } = await supabaseAdmin
        .from('campaigns')
        .select('id', { count: 'exact', head: true });
      if (error) {
        dbError = error.message;
      } else {
        dbConnected = true;
      }
    } catch (err) {
      dbError = err.message;
    }

    let worker = null;
    let workerError = null;
    if (dbConnected) {
      try {
        worker = await queueService.getQueueHealth();
      } catch (err) {
        workerError = err.message;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        smtp: {
          configured: smtpConfigured,
          host: smtpConfigured ? 'smtp.gmail.com:465' : null,
          tls_strict: smtpConfigured,
        },
        database: {
          connected: dbConnected,
          error: dbError,
        },
        worker: worker || {
          healthy: false,
          worker_status: 'offline',
          worker_id: null,
          lock_generation: null,
          error: workerError || dbError,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}
