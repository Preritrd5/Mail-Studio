import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';
import * as templateRepo from '../src/repositories/templateRepository.js';
import { activityRepository } from '../src/repositories/activityRepository.js';
import { reportsRepository } from '../src/repositories/reportsRepository.js';
import { queueRepository } from '../src/queue/queueRepository.js';
import { queueService } from '../src/queue/queueService.js';
import { WorkerLock } from '../src/queue/workerLock.js';
import * as importRepo from '../src/repositories/importRepository.js';

process.env.NODE_ENV = 'test';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    process.stdout.write(`• Testing [${name}]... `);
    await fn();
    console.log('✓ PASSED');
    passed++;
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`  Error in [${name}]:`, err.message);
    if (err.stack) console.error(err.stack);
    failed++;
  }
}

console.log('========================================================');
console.log('  SNPSUNEXUS Mail Studio — Production Data Hygiene Suite');
console.log('  Verifying Zero Dummy Fallbacks, Empty DBs & Strict Auth');
console.log('========================================================\n');

function createBrokenSchemaClient() {
  const broken = createTestSupabaseClient('empty');
  // Remove tables from _store so MockQueryBuilder returns PGRST205 schema missing errors
  broken._store = {};
  const brokenFrom = () => ({
    select() { return this; },
    insert() { return this; },
    update() { return this; },
    upsert() { return this; },
    delete() { return this; },
    eq() { return this; },
    in() { return this; },
    gt() { return this; },
    gte() { return this; },
    lte() { return this; },
    is() { return this; },
    ilike() { return this; },
    or() { return this; },
    order() { return this; },
    range() { return this; },
    limit() { return this; },
    single: async () => ({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.missing' in the schema cache" },
    }),
    maybeSingle: async () => ({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.missing' in the schema cache" },
    }),
    then(resolve) {
      return Promise.resolve({
        data: null,
        error: { code: 'PGRST205', message: "Could not find the table 'public.missing' in the schema cache" },
      }).then(resolve);
    },
  });
  return {
    auth: broken.auth,
    from: brokenFrom,
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in schema cache' },
    }),
  };
}

// 1. Connected empty DB returns strictly [] and 0 for Templates
await test('1. Connected empty database returns 0 templates (no seeded samples)', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const res = await templateRepo.listTemplates({ status: 'all' });
  assert.deepEqual(res.templates, []);
  assert.equal(res.total, 0);
});

// 2. Connected empty DB returns strictly [] and 0 for Activity
await test('2. Connected empty database returns 0 email activity records (no Suresh Rao / sample rows)', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const res = await activityRepository.getActivityList({});
  assert.deepEqual(res.items, []);
  assert.equal(res.pagination.total, 0);
});

// 3. Connected empty DB returns strictly 0 metrics and [] campaigns for Reports
await test('3. Connected empty database returns 0 report metrics and empty campaigns list', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const overview = await reportsRepository.getOverviewMetrics();
  assert.equal(overview.total_campaigns, 0);
  assert.equal(overview.total_recipients, 0);
  assert.equal(overview.total_sent, 0);
  assert.equal(overview.total_failed, 0);
  assert.equal(overview.total_pending, 0);
  assert.equal(overview.acceptance_rate, 0);

  const camps = await reportsRepository.getCampaignReports({});
  assert.deepEqual(camps.campaigns, []);
  assert.equal(camps.total, 0);
});

// 4. Connected empty DB returns strictly [] campaigns and offline worker when unassigned
await test('4. Connected empty database returns [] queue campaigns and offline worker when unassigned', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const list = await queueRepository.getCampaigns({});
  assert.deepEqual(list.campaigns, []);

  const health = await queueService.getQueueHealth();
  assert.equal(health.healthy, false);
  assert.equal(health.worker_status, 'offline');
  assert.equal(health.worker_id, null);
  assert.equal(health.active_workers_count, 0);
});

// 5. Missing schema (PGRST205) throws 503 DATABASE_SCHEMA_MISSING across repositories (no fallback store!)
await test('5. PGRST205 schema missing throws 503 DATABASE_SCHEMA_MISSING across all repositories', async () => {
  setTestSupabaseClient(createBrokenSchemaClient());

  for (const fn of [
    () => templateRepo.listTemplates({ status: 'all' }),
    () => activityRepository.getActivityList({}),
    () => reportsRepository.getOverviewMetrics(),
    () => reportsRepository.getCampaignReports({}),
    () => queueRepository.getCampaigns({}),
    () => queueRepository.getWorkerState(),
    () => importRepo.createBatch({ original_filename: 'a.csv', file_type: 'csv' }),
  ]) {
    await assert.rejects(fn, (err) => err.statusCode === 503 && err.code === 'DATABASE_SCHEMA_MISSING');
  }
});

// 6. WorkerLock fails closed (acquired: false) when database is unavailable
await test('6. WorkerLock returns acquired: false when database is unavailable (never grants fake lease)', async () => {
  setTestSupabaseClient(createBrokenSchemaClient());
  const lock = new WorkerLock({ workerId: 'worker-fail-closed-check' });
  const res = await lock.acquireLock();
  assert.equal(res.acquired, false);
  assert.equal(lock.isLockHeld(), false);
  assert.equal(res.fallback, undefined);
});

// 7. Express API endpoints return honest HTTP 503 (never fake 200 JSON) when PGRST205 occurs
await test('7. HTTP API routes return 503 DATABASE_SCHEMA_MISSING when schema tables are missing', async () => {
  setTestSupabaseClient(createBrokenSchemaClient());
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const port = server.address().port;

  try {
    for (const path of ['/api/queue', '/api/templates', '/api/activity', '/api/reports/overview']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { Authorization: 'Bearer demo-admin-token' },
      });
      assert.equal(res.status, 503, `Expected 503 for ${path}, got ${res.status}`);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'DATABASE_SCHEMA_MISSING');
    }

    // System status returns structured diagnostic payload (200) showing database.connected = false
    const sysRes = await fetch(`http://127.0.0.1:${port}/api/system/status`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(sysRes.status, 200);
    const sysJson = await sysRes.json();
    assert.equal(sysJson.data.database.connected, false);
    assert.ok(sysJson.data.database.error);
    assert.equal(sysJson.data.worker.healthy, false);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 8. Production NODE_ENV rejects demo-admin-token with 401
await test('8. Non-test NODE_ENV strictly rejects demo-admin-token with HTTP 401', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/queue`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(res.status, 401);
  } finally {
    process.env.NODE_ENV = prevEnv;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 9. Unauthenticated requests rejected with 401 across all protected routes
await test('9. Unauthenticated access rejected with 401 across protected endpoints', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const port = server.address().port;

  try {
    for (const path of ['/api/queue', '/api/templates', '/api/activity', '/api/reports/overview', '/api/system/status']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 401, `Expected 401 for unauthenticated ${path}`);
    }
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 10. System status reports healthy connected DB and offline worker accurately
await test('10. /api/system/status reflects connected DB accurately without hardcoded Operational lies', async () => {
  setTestSupabaseClient(createTestSupabaseClient('empty'));
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/system/status`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.database.connected, true);
    assert.equal(json.data.database.error, null);
    assert.equal(json.data.worker.healthy, false);
    assert.equal(json.data.worker.worker_status, 'offline');
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

console.log('\n========================================================');
console.log(`Production Data Hygiene Suite Complete: ${passed} Passed, ${failed} Failed`);
console.log('========================================================\n');

if (failed > 0) {
  process.exit(1);
}
