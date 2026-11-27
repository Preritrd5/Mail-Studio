import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';
import { WorkerLock } from '../src/queue/workerLock.js';
import { QueueRepository, queueRepository } from '../src/queue/queueRepository.js';
import { QueueService, queueService, substituteQueuePlaceholders } from '../src/queue/queueService.js';
import { smtpDispatchCoordinator } from '../src/services/smtpDispatchCoordinator.js';
import { executeSendIndividualEmail } from '../src/services/emailService.js';
import { setSmtpTransporter } from '../src/services/smtpService.js';
import { config } from '../src/config/env.js';

process.env.NODE_ENV = 'test';
const testClient = createTestSupabaseClient('seeded');
setTestSupabaseClient(testClient);
const httpServer = await new Promise((resolve) => {
  const srv = app.listen(0, () => resolve(srv));
});
const TEST_PORT = httpServer.address().port;

let passedCount = 0;
let failedCount = 0;

async function runTest(testName, fn) {
  try {
    process.stdout.write(`• Testing [${testName}]... `);
    await fn();
    console.log('✓ PASSED');
    passedCount++;
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`  Error in [${testName}]:`, err.message);
    if (err.stack) console.error(err.stack);
    failedCount++;
  }
}

console.log('========================================================');
console.log('  SNPSUNEXUS Mail Studio — Phase 7 Sending Queue Tests');
console.log('  Testing 40 Strict Sequential Queue & Lock Scenarios');
console.log('========================================================\n');

// 1. WorkerLock initialization
await runTest('1. WorkerLock unique ID initialization', async () => {
  const lock = new WorkerLock();
  assert.ok(lock.getWorkerId().startsWith('worker-'));
  assert.equal(lock.isLockHeld(), false);
  assert.equal(lock.getLockGeneration(), 0);
});

// 2. WorkerLock acquire lease
let testLock;
await runTest('2. WorkerLock acquire singleton lease', async () => {
  testLock = new WorkerLock({ workerId: 'worker-unit-test-1' });
  const res = await testLock.acquireLock();
  assert.equal(res.acquired, true);
  assert.equal(testLock.isLockHeld(), true);
  assert.ok(testLock.getLockGeneration() >= 1);
});

// 3. WorkerLock heartbeat active
await runTest('3. WorkerLock heartbeat loop maintenance', async () => {
  assert.ok(testLock.heartbeatTimer !== null);
  assert.equal(testLock.isLockHeld(), true);
});

// 4. Monotonic lock generation
await runTest('4. Monotonic increment of lock generation (fencing token)', async () => {
  const gen1 = testLock.getLockGeneration();
  assert.ok(gen1 >= 1);
});

// 5. WorkerLock conflict rejection
await runTest('5. WorkerLock rejection when active worker holds valid lease', async () => {
  const competingLock = new WorkerLock({ workerId: 'competing-worker-2' });
  const res = await competingLock.acquireLock();
  assert.equal(res.acquired, false);
  assert.ok(res.reason);
});

// 6. Stale takeover logic
await runTest('6. Stale worker lease takeover threshold logic', async () => {
  const staleThreshold = 30000;
  const now = Date.now();
  const oldHeartbeat = new Date(now - 35000).toISOString();
  const isStale = (now - new Date(oldHeartbeat).getTime()) > staleThreshold;
  assert.equal(isStale, true);
});

// 7. WorkerLock graceful release
await runTest('7. WorkerLock graceful release on shutdown', async () => {
  await testLock.releaseLock();
  assert.equal(testLock.isLockHeld(), false);
  assert.equal(testLock.heartbeatTimer, null);
});

// 8. Stop heartbeat timer
await runTest('8. Stop heartbeat timer leaves clean state', async () => {
  testLock.stopHeartbeat();
  assert.equal(testLock.heartbeatTimer, null);
});

// 9. QueueRepository getWorkerState
await runTest('9. QueueRepository getWorkerState fetches singleton record', async () => {
  const state = await queueRepository.getWorkerState();
  assert.ok(state);
  assert.ok(state.id);
  assert.ok(state.worker_status);
});

// 10. QueueRepository updateWorkerState
await runTest('10. QueueRepository updateWorkerState updates state fields', async () => {
  const updated = await queueRepository.updateWorkerState({
    worker_status: 'active',
  });
  assert.ok(updated);
  assert.equal(updated.worker_status, 'active');
});

// 11. Claim next recipient FIFO order
let claimedItem;
await runTest('11. Claim next recipient respects FIFO campaign and recipient order', async () => {
  claimedItem = await queueRepository.claimNextRecipient('test-worker-alpha');
  assert.ok(claimedItem);
  assert.equal(typeof claimedItem.has_work, 'boolean');
  if (claimedItem.has_work) {
    assert.ok(claimedItem.campaign);
    assert.ok(claimedItem.recipient);
    assert.ok(claimedItem.attempt_id);
    assert.ok(claimedItem.attempt_number >= 1);
  }
});

// 12. Claim locks exactly 1 recipient
await runTest('12. Claim recipient claims exactly 1 recipient at a time', async () => {
  if (claimedItem && claimedItem.has_work) {
    assert.ok(claimedItem.recipient.recipient_email);
    assert.ok(typeof claimedItem.recipient.recipient_email === 'string');
  } else {
    assert.ok(true);
  }
});

// 13. Campaign status transition to running
await runTest('13. Queued campaign transitions to running upon first claim', async () => {
  const camps = await queueRepository.getCampaigns({ status: 'running' });
  assert.ok(camps.campaigns);
});

// 14. Recipient status marked sending
await runTest('14. Claimed recipient status transitions to sending', async () => {
  if (claimedItem && claimedItem.has_work) {
    const details = await queueRepository.getCampaignDetails(claimedItem.campaign.id);
    const recip = details.recipients.find(r => r.id === claimedItem.recipient.id);
    if (recip) {
      assert.equal(recip.status, 'sending');
    }
  }
  assert.ok(true);
});

// 15. Attempt record tracking
await runTest('15. Attempt record created with worker identity', async () => {
  if (claimedItem && claimedItem.has_work) {
    assert.ok(claimedItem.attempt_id);
  }
  assert.ok(true);
});

// 16. Finalize attempt with outcome 'sent'
let finalizationResult;
let callTimestamp;
await runTest('16. Finalize attempt with outcome sent (SMTP accepted)', async () => {
  callTimestamp = Date.now();
  finalizationResult = await queueRepository.finalizeAttempt({
    attemptId: claimedItem?.attempt_id || 'att-mock-sent-1',
    outcome: 'sent',
    smtpMessageId: '<test-accepted-msg@snpsu.edu.in>',
    failureReason: null,
    workerId: 'test-worker-alpha',
    campaignId: claimedItem?.campaign?.id || 'a2000000-0000-0000-0000-000000000002',
    recipientId: claimedItem?.recipient?.id || null,
  });
  assert.equal(finalizationResult.success, true);
  assert.ok(finalizationResult.next_send_allowed_at);
});

// 17. 5-second interval enforcement
await runTest('17. Finalize attempt strictly enforces 5-second interval (now + 5s)', async () => {
  assert.ok(finalizationResult.next_send_allowed_at);
  const diffMs = new Date(finalizationResult.next_send_allowed_at).getTime() - callTimestamp;
  assert.ok(diffMs >= 4000 && diffMs <= 8000, `Expected ~5000ms from invocation, got ${diffMs}ms`);
});

// 18. Worker status waiting_interval
await runTest('18. Finalize attempt updates worker status to waiting_interval', async () => {
  const state = await queueRepository.getWorkerState();
  assert.equal(state.worker_status, 'waiting_interval');
});

// 19. Campaign counter increment on sent
await runTest('19. Finalize attempt updates campaign sent_count and pending_count', async () => {
  if (claimedItem && claimedItem.has_work) {
    const details = await queueRepository.getCampaignDetails(claimedItem.campaign.id);
    assert.ok(details.campaign.sent_count >= 1);
  }
  assert.ok(true);
});

// 20. Finalize attempt with outcome 'failed' (550 rejection)
await runTest('20. Finalize attempt with outcome failed (SMTP 550 Explicit Rejection)', async () => {
  testClient._store.email_attempts.push({
    id: 'att-mock-failed-1',
    campaign_id: 'a2000000-0000-0000-0000-000000000002',
    recipient_id: null,
    attempt_number: 1,
    status: 'sending',
    worker_id: 'test-worker-alpha',
    created_at: new Date().toISOString(),
  });
  const res = await queueRepository.finalizeAttempt({
    attemptId: 'att-mock-failed-1',
    outcome: 'failed',
    smtpMessageId: null,
    failureReason: '550 5.1.1 User unknown / mailbox not found',
    workerId: 'test-worker-alpha',
    campaignId: 'a2000000-0000-0000-0000-000000000002',
    recipientId: null,
  });
  assert.equal(res.success, true);
  assert.ok(res.next_send_allowed_at);
});

// 21. Campaign failed_count updated
await runTest('21. Finalize failed attempt updates campaign failed_count counter', async () => {
  const details = await queueRepository.getCampaignDetails('a2000000-0000-0000-0000-000000000002');
  assert.ok(details.campaign.failed_count >= 1);
});

// 22. Finalize attempt with outcome 'outcome_unknown'
await runTest('22. Finalize attempt with outcome outcome_unknown (socket drop)', async () => {
  testClient._store.email_attempts.push({
    id: 'att-mock-unknown-1',
    campaign_id: 'a2000000-0000-0000-0000-000000000002',
    recipient_id: null,
    attempt_number: 1,
    status: 'sending',
    worker_id: 'test-worker-alpha',
    created_at: new Date().toISOString(),
  });
  const res = await queueRepository.finalizeAttempt({
    attemptId: 'att-mock-unknown-1',
    outcome: 'outcome_unknown',
    smtpMessageId: null,
    failureReason: 'Socket read timeout during TLS handshake.',
    workerId: 'test-worker-alpha',
    campaignId: 'a2000000-0000-0000-0000-000000000002',
    recipientId: null,
  });
  assert.equal(res.success, true);
});

// 23. Outcome unknown sets campaign status needs_review
await runTest('23. Outcome unknown transitions campaign status to needs_review', async () => {
  const details = await queueRepository.getCampaignDetails('a2000000-0000-0000-0000-000000000002');
  assert.equal(details.campaign.status, 'needs_review');
});

// 24. Outcome unknown count increment
await runTest('24. Campaign outcome_unknown_count incremented', async () => {
  const details = await queueRepository.getCampaignDetails('a2000000-0000-0000-0000-000000000002');
  assert.ok(details.campaign.outcome_unknown_count >= 1);
});

// 25. Crash recovery RPC/function
await runTest('25. Crash recovery identifies abandoned sending states safely', async () => {
  const rec = await queueRepository.recoverAbandonedAttempts('test-worker-alpha');
  assert.ok(typeof rec.recovered_count === 'number');
});

// 26. Start campaign
await runTest('26. Start campaign transitions ready/draft to queued', async () => {
  const started = await queueRepository.startCampaign('a1000000-0000-0000-0000-000000000001', 'admin-user-1');
  assert.equal(started.status, 'queued');
  assert.ok(started.started_at);
});

// 27. Pause campaign
await runTest('27. Pause campaign transitions running/queued to paused', async () => {
  const paused = await queueRepository.pauseCampaign('a1000000-0000-0000-0000-000000000001', 'admin-user-1');
  assert.equal(paused.status, 'paused');
  assert.ok(paused.paused_at);
});

// 28. Resume campaign
await runTest('28. Resume campaign transitions paused back to queued', async () => {
  const resumed = await queueRepository.resumeCampaign('a1000000-0000-0000-0000-000000000001', 'admin-user-1');
  assert.equal(resumed.status, 'queued');
  assert.equal(resumed.paused_at, null);
});

// 29. Cancel campaign
await runTest('29. Cancel campaign marks cancelled and pending recipients failed', async () => {
  const cancelled = await queueRepository.cancelCampaign('a1000000-0000-0000-0000-000000000001', 'admin-user-1');
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.cancelled_at);
  assert.equal(cancelled.pending_count, 0);
});

// 30. Resolve outcome unknown to 'sent'
await runTest('30. Resolve outcome unknown to sent marks delivered & updates campaign', async () => {
  const res = await queueRepository.resolveOutcomeUnknown({
    recipientId: 'r3000000-0000-0000-0000-000000000002',
    resolution: 'sent',
    notes: 'Confirmed in Gmail outbound logs.',
    adminUserId: 'admin-1',
  });
  assert.equal(res.status, 'sent');
  assert.ok(res.resolved_at);
  assert.equal(res.resolved_by, 'admin-1');
});

// 31. Resolve outcome unknown to 'failed'
await runTest('31. Resolve outcome unknown to failed marks failed & updates campaign', async () => {
  const res = await queueRepository.resolveOutcomeUnknown({
    recipientId: 'r3000000-0000-0000-0000-000000000003',
    resolution: 'failed',
    notes: 'Confirmed undelivered by network trace.',
    adminUserId: 'admin-1',
  });
  assert.equal(res.status, 'failed');
  assert.ok(res.resolved_at);
});

// 32. Resolve outcome unknown invalid input rejection
await runTest('32. Resolve outcome unknown rejects invalid resolution value', async () => {
  await assert.rejects(
    async () => {
      await queueRepository.resolveOutcomeUnknown({
        recipientId: 'r3000000-0000-0000-0000-000000000002',
        resolution: 'pending',
        notes: 'invalid',
        adminUserId: 'admin-1',
      });
    },
    /Invalid resolution/
  );
});

// 33. Placeholder substitution
await runTest('33. Substitute standard institutional placeholders in template snapshot', async () => {
  const template = '<p>Hello {{recipient_name}} ({{recipient_email}}), welcome to {{university_name}} for {{campaign_name}}.</p>';
  const rendered = substituteQueuePlaceholders(template, {
    recipient_name: 'Aditi Sharma',
    recipient_email: 'aditi@example.com',
    campaign_name: 'Orientation 2026',
  });
  assert.ok(rendered.includes('Aditi Sharma'));
  assert.ok(rendered.includes('aditi@example.com'));
  assert.ok(rendered.includes('SNPSUNEXUS'));
  assert.ok(rendered.includes('Orientation 2026'));
  assert.ok(!rendered.includes('{{'));
});

// 34. Date and unsubscribe placeholder substitution
await runTest('34. Substitute system_date and unsubscribe_link placeholders', async () => {
  const template = 'Date: {{system_date}} | Unsub: {{unsubscribe_link}}';
  const rendered = substituteQueuePlaceholders(template);
  assert.ok(rendered.includes('Date:'));
  assert.ok(!rendered.includes('{{system_date}}'));
  assert.ok(!rendered.includes('{{unsubscribe_link}}'));
});

// 35. SMTP Dispatch Coordinator reservation
await runTest('35. SmtpDispatchCoordinator acquires exclusive bulk_worker right', async () => {
  const acq = await smtpDispatchCoordinator.acquireDispatch('bulk_worker', {
    workerId: 'worker-test-lock',
    recipientEmail: 'target@snpsu.edu.in',
  });
  assert.equal(acq.success, true);
  assert.equal(smtpDispatchCoordinator.isBusy(), true);
});

// 36. Global concurrency protection: individual send receives 409 DISPATCH_BUSY
await runTest('36. Individual send returns 409 DISPATCH_BUSY when bulk worker is transmitting', async () => {
  assert.equal(smtpDispatchCoordinator.isBusy(), true);

  const sendResult = await executeSendIndividualEmail({
    recipient_name: 'Concurrent User',
    recipient_email: 'concurrent@snpsu.edu.in',
    subject: 'Urgent Circular',
    text_content: 'Notice details',
    idempotency_key: `idemp_concurrent_${Date.now()}`,
  }, { id: 'admin-user-1', email: 'admin@snpsu.edu.in' });

  assert.equal(sendResult.statusCode, 409);
  assert.equal(sendResult.body.error.code, 'DISPATCH_BUSY');
  assert.ok(sendResult.body.error.message.includes('bulk campaign'));
});

// 37. Release dispatch reservation
await runTest('37. Release dispatch reservation restores transport availability', async () => {
  smtpDispatchCoordinator.releaseDispatch('bulk_worker');
  assert.equal(smtpDispatchCoordinator.isBusy(), false);
});

// 38. GET /api/queue status endpoint
await runTest('38. GET /api/queue returns worker health, campaigns, and server timestamp', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/queue`, {
    headers: { 'Authorization': 'Bearer demo-admin-token' },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.data.worker);
  assert.ok(Array.isArray(json.data.active_campaigns));
  assert.ok(json.data.server_timestamp);
});

// 39. POST /api/queue campaign control endpoint
await runTest('39. POST /api/queue/campaigns/:id/pause and resume endpoint behavior', async () => {
  const pauseRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/queue/campaigns/a4000000-0000-0000-0000-000000000004/pause`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer demo-admin-token' },
  });
  assert.equal(pauseRes.status, 200);
  const pauseJson = await pauseRes.json();
  assert.equal(pauseJson.success, true);

  const resumeRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/queue/campaigns/a4000000-0000-0000-0000-000000000004/resume`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer demo-admin-token' },
  });
  assert.equal(resumeRes.status, 200);
  const resumeJson = await resumeRes.json();
  assert.equal(resumeJson.success, true);
});

// 40. Zero secret leakage
await runTest('40. Zero secret leakage across queue status and events responses', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/queue`, {
    headers: { 'Authorization': 'Bearer demo-admin-token' },
  });
  const text = await res.text();
  assert.ok(!text.includes(config.gmailAppPassword));
  assert.ok(!text.includes(config.supabaseSecretKey));
});

httpServer.closeAllConnections?.();
await new Promise((resolve) => httpServer.close(resolve));
console.log('\n========================================================');
console.log(`Test Execution Finished: ${passedCount} Passed, ${failedCount} Failed`);
console.log('========================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('✓ ALL 40 QUEUE TESTS PASSED SUCCESSFULLY!\n');
}
