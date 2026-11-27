import assert from 'node:assert';
import http from 'node:http';
import { app } from '../src/app.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';

process.env.NODE_ENV = 'test';
setTestSupabaseClient(createTestSupabaseClient('seeded'));
const server = await new Promise((resolve) => {
  const srv = app.listen(0, () => resolve(srv));
});
const TEST_PORT = server.address().port;

async function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer demo-admin-token',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('  SNPSUNEXUS Mail Studio — Queue Sync & Preview Verification');
  console.log('========================================================');

  // Test 1: Canonical /api/queue endpoint returns HTTP 200 with data
  console.log('• Testing [1. GET /api/queue canonical route resolution]...');
  const res1 = await makeRequest('/api/queue');
  assert.strictEqual(res1.status, 200, `Expected 200 OK, got ${res1.status}`);
  assert.strictEqual(res1.body.success, true);
  assert.ok(res1.body.data.worker, 'Worker health object must be present');
  assert.ok(
    res1.body.data.worker.lock_generation === null || typeof res1.body.data.worker.lock_generation === 'number',
    'Worker lock_generation must be null when offline or a number when active'
  );
  assert.ok(Array.isArray(res1.body.data.active_campaigns), 'active_campaigns must be an array');
  console.log('  ✓ PASSED');

  // Test 2: Defensive /queue route alias returns HTTP 200 with identical data
  console.log('• Testing [2. GET /queue defensive alias transparent rewrite]...');
  const res2 = await makeRequest('/queue');
  assert.strictEqual(res2.status, 200, `Expected 200 OK for /queue, got ${res2.status}`);
  assert.strictEqual(res2.body.success, true);
  assert.strictEqual(res2.body.data.total_campaigns, res1.body.data.total_campaigns);
  console.log('  ✓ PASSED');

  // Test 3: /api/queue/worker/health and /queue/worker/health
  console.log('• Testing [3. Worker health endpoint routing on /api and alias]...');
  const res3a = await makeRequest('/api/queue/worker/health');
  const res3b = await makeRequest('/queue/worker/health');
  assert.strictEqual(res3a.status, 200);
  assert.strictEqual(res3b.status, 200);
  assert.strictEqual(typeof res3a.body.data.healthy, 'boolean');
  assert.strictEqual(typeof res3b.body.data.healthy, 'boolean');
  assert.strictEqual(res3a.body.data.worker_id, res3b.body.data.worker_id);
  console.log('  ✓ PASSED');

  // Test 4: Activity and Reports aliases
  console.log('• Testing [4. Activity & Reports route aliases transparent rewrite]...');
  const res4 = await makeRequest('/activity');
  const res5 = await makeRequest('/reports/overview');
  assert.strictEqual(res4.status, 200);
  assert.strictEqual(res5.status, 200);
  console.log('  ✓ PASSED');

  // Test 5: Unauthenticated request rejection on /queue
  console.log('• Testing [5. Authentication guard on defensive route alias]...');
  const resUnauth = await makeRequest('/queue', { Authorization: '' });
  assert.strictEqual(resUnauth.status, 401, 'Should reject unauthenticated access with 401');
  console.log('  ✓ PASSED');

  console.log('========================================================');
  console.log('  All Queue Sync & Routing Tests Passed Successfully!');
  console.log('========================================================');
}

runTests()
  .finally(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  })
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
