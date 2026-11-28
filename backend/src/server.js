import { app } from './app.js';
import { config } from './config/env.js';
import { verifySmtpConnection } from './services/smtpService.js';
import { queueService } from './queue/queueService.js';
import { queueRepository } from './queue/queueRepository.js';

function startEmbeddedLocalQueueRunner() {
  if (config.isServerless || process.env.NODE_ENV === 'test') return;

  const runnerWorkerId = 'local-server-auto-dispatcher';
  let ticking = false;

  const timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      const hasWork = await queueRepository.hasPendingBulkWork();
      if (!hasWork) return;

      const health = await queueService.getQueueHealth();
      // Yield if a standalone CLI worker is freshly active
      if (health.dispatch_mode === 'dedicated_worker' && (health.seconds_since_heartbeat ?? 999) <= 15) {
        return;
      }

      await queueService.executeSingleQueueStep(runnerWorkerId);
    } catch {
      // Non-fatal in background ticker; next tick or client dispatcher retries cleanly
    } finally {
      ticking = false;
    }
  }, 1500);

  if (timer.unref) timer.unref();
  console.log('✓ Embedded local sequential queue auto-runner active (5-second SMTP interval)');
}

async function startServer() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    const missing = [!config.supabaseUrl && 'SUPABASE_URL', !config.supabaseSecretKey && 'SUPABASE_SECRET_KEY'].filter(Boolean);
    console.error(`FATAL STARTUP ERROR: Missing or invalid mandatory environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('========================================================');
  console.log('   SNPSUNEXUS Mail Studio — Backend API Server');
  console.log('   SNPSUNEXUS Mail Studio');
  console.log('========================================================');
  console.log(`Environment:   ${config.nodeEnv}`);
  console.log(`Port:          ${config.port}`);
  console.log(`Client Origin: ${config.clientOrigin}`);
  console.log(`Supabase URL:  ${config.supabaseUrl}`);
  console.log(`Sender Name:   ${config.senderName}`);
  console.log('--------------------------------------------------------');

  // Verify SMTP connectivity on startup
  console.log('Verifying Gmail SMTP infrastructure...');
  const smtpStatus = await verifySmtpConnection();
  if (smtpStatus.connected) {
    console.log('✓ Gmail SMTP connection authenticated successfully (smtp.gmail.com:465 TLS strict)');
  } else {
    console.warn(`! SMTP Warning: Connectivity check reported: ${smtpStatus.error}`);
  }

  // Start HTTP Listener
  const server = app.listen(config.port, () => {
    console.log(`✓ Backend API server listening on http://localhost:${config.port}`);
    console.log(`✓ Health endpoint: http://localhost:${config.port}/api/health`);
    console.log(`✓ Email sending endpoint: POST http://localhost:${config.port}/api/emails/send`);
    console.log(`✓ Template management endpoints: http://localhost:${config.port}/api/templates`);
    console.log(`✓ Bulk import endpoints: http://localhost:${config.port}/api/imports`);
    console.log(`✓ Sequential queue endpoints: http://localhost:${config.port}/api/queue`);
    console.log(`✓ Email activity endpoints: http://localhost:${config.port}/api/activity`);
    console.log(`✓ Reports & export endpoints: http://localhost:${config.port}/api/reports`);
    console.log('========================================================');
    startEmbeddedLocalQueueRunner();
  });

  return server;
}

// Start server if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  startServer().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

export { startServer };
