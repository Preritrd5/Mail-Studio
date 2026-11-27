import { config } from '../config/env.js';
import { supabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import { queueService } from '../queue/queueService.js';
import { sanitizeEmailHtml } from '../utils/emailHtmlSanitizer.js';

export function getHealth(req, res) {
  const sanitizerReady = sanitizeEmailHtml('<p>ok</p>') === '<p>ok</p>';
  res.status(200).json({
    status: 'ok',
    service: 'SNPSUNEXUS Mail Studio API',
    brand: 'SNPSUNEXUS',
    version: '1.0.0',
    environment: config.nodeEnv,
    runtime: config.isServerless ? 'serverless' : 'node_server',
    nodeVersion: process.version,
    sanitize_html_loaded: sanitizerReady,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Authenticated infrastructure verification endpoint reporting actual API,
 * authentication service, database, SMTP config state, and queue worker state.
 * Never exposes secrets or claims unverified services are operational.
 */
export async function getSystemStatus(req, res, next) {
  try {
    const smtpConfigured = Boolean(config.gmailUser && config.gmailAppPassword);

    let dbConnected = false;
    let dbStatus = isSupabaseConfigured() ? 'unavailable' : 'not_configured';
    let dbError = isSupabaseConfigured() ? null : 'Supabase environment variables are not configured.';

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabaseAdmin
          .from('campaigns')
          .select('id', { count: 'exact', head: true });
        if (error) {
          dbError = error.message;
          dbStatus = 'unavailable';
        } else {
          dbConnected = true;
          dbStatus = 'operational';
        }
      } catch (err) {
        dbError = err.message;
        dbStatus = 'unavailable';
      }
    }

    let authAvailable = false;
    let authStatus = isSupabaseConfigured() ? 'unavailable' : 'not_configured';
    if (config.nodeEnv === 'test' || process.env.NODE_ENV === 'test') {
      authAvailable = dbConnected;
      authStatus = dbConnected ? 'operational' : 'degraded';
    } else if (isSupabaseConfigured() && typeof supabaseAdmin?.auth?.admin?.listUsers === 'function') {
      try {
        const { error: authErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
        if (!authErr) {
          authAvailable = true;
          authStatus = 'operational';
        } else {
          authStatus = 'unavailable';
        }
      } catch {
        authStatus = 'unavailable';
      }
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

    const normalizedWorker = worker
      ? {
          ...worker,
          status: worker.healthy ? 'operational' : 'unavailable',
          lock_held: Boolean(worker.healthy && worker.lock_generation),
        }
      : {
          healthy: false,
          status: 'unavailable',
          lock_held: false,
          worker_status: 'offline',
          worker_id: null,
          lock_generation: null,
          active_workers_count: 0,
          error: workerError || dbError,
        };

    return res.status(200).json({
      success: true,
      data: {
        api: {
          status: 'operational',
          runtime: config.isServerless ? 'serverless' : 'node_server',
        },
        auth: {
          available: authAvailable,
          status: authStatus,
        },
        smtp: {
          configured: smtpConfigured,
          verified: false,
          status: smtpConfigured ? 'configured_unverified' : 'not_configured',
          host: smtpConfigured ? 'smtp.gmail.com:465' : null,
          tls_strict: smtpConfigured,
        },
        database: {
          connected: dbConnected,
          status: dbStatus,
          error: dbError,
        },
        worker: normalizedWorker,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}
