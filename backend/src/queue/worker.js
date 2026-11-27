import { globalWorkerLock } from './workerLock.js';
import { queueRepository } from './queueRepository.js';
import { queueService } from './queueService.js';

let isRunning = true;
let isExecutingStep = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWorker() {
  const workerId = globalWorkerLock.getWorkerId();
  console.log('========================================================');
  console.log('   SNPSUNEXUS Mail Studio — Bulk Queue Worker');
  console.log('   SNPSUNEXUS Mail Studio Sequential Dispatcher');
  console.log('========================================================');
  console.log(`Worker ID:     ${workerId}`);
  console.log(`Process PID:   ${process.pid}`);
  console.log(`Platform:      ${process.platform}`);
  console.log('--------------------------------------------------------');

  // 1. Recover abandoned sending states from previous crashes
  console.log('Checking for abandoned sending states from prior runs...');
  try {
    const recovery = await queueRepository.recoverAbandonedAttempts(workerId);
    if (recovery && recovery.recovered_count > 0) {
      console.warn(`[QueueWorker] Recovered ${recovery.recovered_count} abandoned sending attempt(s) to 'outcome_unknown' for administrator audit.`);
    } else {
      console.log('✓ Clean state verified: No abandoned attempts found.');
    }
  } catch (err) {
    console.warn('[QueueWorker] Non-critical recovery check warning:', err.message);
  }

  // 2. Acquire Global Worker Lease
  console.log('Acquiring exclusive global worker lease in PostgreSQL...');
  const lockResult = await globalWorkerLock.acquireLock();
  if (!lockResult.acquired) {
    console.warn(`! Lease acquisition failed: ${lockResult.reason}`);
    console.warn('! Worker will monitor queue state and attempt lease acquisition in background.');
  } else {
    console.log(`✓ Exclusive global worker lease acquired (Lock Generation: ${lockResult.generation})`);
  }

  // 3. Graceful Shutdown Handlers
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Initiating graceful worker shutdown...`);
    isRunning = false;

    // Wait up to 10 seconds if currently transmitting an email
    let waitCount = 0;
    while (isExecutingStep && waitCount < 10) {
      console.log('Waiting for active SMTP transmission to complete...');
      await sleep(1000);
      waitCount++;
    }

    try {
      await globalWorkerLock.releaseLock();
      console.log('✓ Worker lease released gracefully. Exiting.');
    } catch (err) {
      console.error('Error during lease release:', err.message);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 4. Main Queue Loop
  console.log('✓ Sequential sending queue worker loop initialized.');
  console.log('Monitoring queued campaigns (mandatory 5-second interval between attempts)...');

  while (isRunning) {
    try {
      // If lock not currently held, try to acquire it
      if (!globalWorkerLock.isLockHeld()) {
        const recheck = await globalWorkerLock.acquireLock();
        if (!recheck.acquired) {
          await sleep(5000);
          continue;
        }
        console.log(`✓ Reacquired worker lease (Generation: ${recheck.generation})`);
      }

      // Check mandatory 5-second interval
      const workerState = await queueRepository.getWorkerState();
      if (workerState && workerState.next_send_allowed_at) {
        const allowedTime = new Date(workerState.next_send_allowed_at).getTime();
        const diffMs = allowedTime - Date.now();
        if (diffMs > 0) {
          // Wait for the persisted rate-limit interval to expire
          await sleep(Math.min(diffMs, 1000));
          continue;
        }
      }

      // Claim next eligible recipient (FIFO, 1 recipient at a time)
      isExecutingStep = true;
      const claim = await queueRepository.claimNextRecipient(workerId);

      if (!claim || !claim.has_work) {
        isExecutingStep = false;
        await sleep(2000); // Idle polling interval
        continue;
      }

      console.log(`\n[QueueWorker] Claimed recipient ${claim.recipient.recipient_email} (Campaign: "${claim.campaign.campaign_name}", Attempt #${claim.attempt_number})`);
      
      const dispatchOutcome = await queueService.processClaimedRecipient(claim, workerId);
      console.log(`[QueueWorker] Dispatch completed with outcome: ${dispatchOutcome.outcome.toUpperCase()}`);
      console.log(`[QueueWorker] Enforcing 5-second pause. Next send allowed at: ${dispatchOutcome.nextSendAllowedAt}`);

      isExecutingStep = false;
    } catch (loopErr) {
      isExecutingStep = false;
      console.error('[QueueWorker] Queue processing error:', loopErr.message);
      await sleep(3000);
    }
  }
}

// Start worker if run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runWorker().catch((err) => {
    console.error('Fatal worker loop exception:', err);
    process.exit(1);
  });
}

export { runWorker };
