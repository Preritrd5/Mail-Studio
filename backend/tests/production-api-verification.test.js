import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { config } from '../src/config/env.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';

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

console.log('================================================================');
console.log('  SNPSUNEXUS Mail Studio — Production API Verification Suite');
console.log('  Testing Auth Session, Queue, Reports, Activity, Templates & System');
console.log('================================================================\n');

const seededDb = createTestSupabaseClient('seeded');
const emptyDb = createTestSupabaseClient('empty');

function createAuthAwareDb(baseDb, userLookupMap = {}) {
  const client = {
    from: (...args) => baseDb.from(...args),
    rpc: (...args) => baseDb.rpc(...args),
    _store: baseDb._store,
    auth: {
      async getUser(token) {
        if (token in userLookupMap) {
          const entry = userLookupMap[token];
          if (entry.error) return { data: { user: null }, error: entry.error };
          return { data: { user: entry.user }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid or expired JWT' } };
      },
    },
  };
  return client;
}

const server = await new Promise((resolve) => {
  const srv = app.listen(0, () => resolve(srv));
});
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION SESSION TESTS
  // --------------------------------------------------------------------------
  await test('1. GET /api/auth/session returns 200 explicit unauthenticated when no token', async () => {
    setTestSupabaseClient(seededDb);
    const res = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.authenticated, false);
    assert.equal(json.data.isAdmin, false);
    assert.equal(json.data.profile, null);
  });

  await test('2. GET /api/auth/session returns 200 authenticated admin when valid', async () => {
    setTestSupabaseClient(seededDb);
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.authenticated, true);
    assert.equal(json.data.isAdmin, true);
    assert.ok(json.data.profile.email);
  });

  await test('3. GET /api/auth/session returns 401 with requestId for invalid/expired token', async () => {
    const authDb = createAuthAwareDb(seededDb, {
      'expired-jwt-token': { error: { message: 'JWT expired' } },
    });
    setTestSupabaseClient(authDb);
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: 'Bearer expired-jwt-token' },
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'INVALID_TOKEN');
    assert.ok(json.error.requestId);
    assert.ok(res.headers.get('x-request-id'));
  });

  await test('4. Security: Rejects forged editable user_metadata role and email substrings (403)', async () => {
    const authDb = createAuthAwareDb(seededDb, {
      'user-metadata-tamper-jwt': {
        user: {
          id: '00000000-0000-0000-0000-000000009999',
          email: 'admin-impersonator@example.com',
          user_metadata: { role: 'administrator' }, // user-editable, must NEVER grant admin
          app_metadata: {},
        },
      },
    });
    setTestSupabaseClient(authDb);
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: 'Bearer user-metadata-tamper-jwt' },
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  await test('5. Authorization: Accepts server-only app_metadata.role=administrator (200)', async () => {
    const authDb = createAuthAwareDb(seededDb, {
      'app-metadata-admin-jwt': {
        user: {
          id: '00000000-0000-0000-0000-000000008888',
          email: 'ops@snpsunexus.vercel.app',
          app_metadata: { role: 'administrator' },
          user_metadata: { display_name: 'Ops Admin' },
        },
      },
    });
    setTestSupabaseClient(authDb);
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: 'Bearer app-metadata-admin-jwt' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.authenticated, true);
    assert.equal(json.data.isAdmin, true);
  });

  await test('6. GET /api/auth/session fails closed with 503 when admin_users table missing', async () => {
    const brokenBase = createTestSupabaseClient('empty');
    brokenBase._store = {};
    const brokenAuthDb = {
      ...createAuthAwareDb(brokenBase, {
        'valid-non-app-meta-jwt': {
          user: {
            id: '00000000-0000-0000-0000-000000007777',
            email: 'admin@snpsu.edu.in',
            app_metadata: {},
            user_metadata: {},
          },
        },
      }),
      from: () => ({
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({
          data: null,
          error: { code: 'PGRST205', message: "Could not find the table 'public.admin_users' in the schema cache" },
        }),
      }),
    };
    setTestSupabaseClient(brokenAuthDb);
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: 'Bearer valid-non-app-meta-jwt' },
    });
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.error.code, 'DATABASE_SCHEMA_MISSING');
  });

  // --------------------------------------------------------------------------
  // 2. QUEUE, REPORTS, ACTIVITY & TEMPLATES API TESTS
  // --------------------------------------------------------------------------
  await test('7. GET /api/queue returns honest offline worker & empty campaigns on empty DB', async () => {
    setTestSupabaseClient(emptyDb);
    const res = await fetch(`${baseUrl}/api/queue`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.deepEqual(json.data.active_campaigns, []);
    assert.equal(json.data.worker.healthy, false);
    assert.equal(json.data.worker.worker_status, 'offline');
  });

  await test('8. GET /api/queue and /worker/health return active/queued campaigns accurately', async () => {
    setTestSupabaseClient(seededDb);
    const [qRes, wRes] = await Promise.all([
      fetch(`${baseUrl}/api/queue`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
      fetch(`${baseUrl}/api/queue/worker/health`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
    ]);
    assert.equal(qRes.status, 200);
    assert.equal(wRes.status, 200);
    const qJson = await qRes.json();
    assert.ok(qJson.data.active_campaigns.length >= 1);
    const statuses = qJson.data.active_campaigns.map((c) => c.status);
    assert.ok(statuses.includes('ready') || statuses.includes('running') || statuses.includes('queued'));
  });

  await test('9. Reporting APIs return exact zeros on empty DB without dummy data', async () => {
    setTestSupabaseClient(emptyDb);
    const [ov, tl, cp] = await Promise.all([
      fetch(`${baseUrl}/api/reports/overview?date_range=7d`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
      fetch(`${baseUrl}/api/reports/timeline?days=7`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
      fetch(`${baseUrl}/api/reports/campaigns?limit=5`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
    ]);
    assert.equal(ov.status, 200);
    assert.equal(tl.status, 200);
    assert.equal(cp.status, 200);

    const ovJson = await ov.json();
    const tlJson = await tl.json();
    const cpJson = await cp.json();

    assert.equal(ovJson.data.total_campaigns, 0);
    assert.equal(ovJson.data.total_recipients, 0);
    assert.equal(ovJson.data.total_sent, 0);
    assert.equal(tlJson.data.length, 7);
    assert.ok(tlJson.data.every((d) => d.sent === 0 && d.failed === 0));
    assert.deepEqual(cpJson.data, []);
  });

  await test('10. Reporting overview counts distinct recipients separately from multiple attempts', async () => {
    const customDb = createTestSupabaseClient('empty');
    customDb._store.campaigns.push({
      id: 'c0000000-0000-0000-0000-000000000001',
      campaign_name: 'Multi-Attempt Integrity Test',
      campaign_type: 'bulk',
      subject: 'Test',
      status: 'completed',
      total_recipients: 1,
      sent_count: 1,
      failed_count: 0,
      pending_count: 0,
      created_at: new Date().toISOString(),
    });
    customDb._store.campaign_recipients.push({
      id: 'r0000000-0000-0000-0000-000000000001',
      campaign_id: 'c0000000-0000-0000-0000-000000000001',
      recipient_name: 'One Candidate',
      recipient_email: 'candidate@example.com',
      status: 'sent',
      attempt_count: 3,
      created_at: new Date().toISOString(),
    });
    for (let i = 1; i <= 3; i++) {
      customDb._store.email_attempts.push({
        id: `a0000000-0000-0000-0000-00000000000${i}`,
        campaign_id: 'c0000000-0000-0000-0000-000000000001',
        recipient_id: 'r0000000-0000-0000-0000-000000000001',
        attempt_number: i,
        status: i < 3 ? 'failed' : 'sent',
        created_at: new Date().toISOString(),
      });
    }
    setTestSupabaseClient(customDb);
    const res = await fetch(`${baseUrl}/api/reports/overview?date_range=7d`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.total_recipients, 1);
    assert.equal(json.data.total_sent, 1);
    assert.equal(json.data.total_attempts, 3);
  });

  await test('11. Activity & Templates honor empty DB, limit bounds, and query validation', async () => {
    setTestSupabaseClient(emptyDb);
    const [actRes, tplRes] = await Promise.all([
      fetch(`${baseUrl}/api/activity?limit=999`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
      fetch(`${baseUrl}/api/templates?status=all`, { headers: { Authorization: 'Bearer demo-admin-token' } }),
    ]);
    assert.equal(actRes.status, 200);
    assert.equal(tplRes.status, 200);
    const actJson = await actRes.json();
    const tplJson = await tplRes.json();
    assert.deepEqual(actJson.data, []);
    assert.equal(actJson.pagination.limit, 100);
    assert.deepEqual(tplJson.data.templates, []);
  });

  // --------------------------------------------------------------------------
  // 3. SYSTEM HEALTH, ERROR HANDLING, CORS & SECURITY
  // --------------------------------------------------------------------------
  await test('12. /api/health and /api/system/status differentiate health without leaking secrets', async () => {
    setTestSupabaseClient(emptyDb);
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.nodeVersion, process.version);
    assert.equal(healthJson.sanitize_html_loaded, true);

    const sysRes = await fetch(`${baseUrl}/api/system/status`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(sysRes.status, 200);
    const raw = await sysRes.text();
    if (config.gmailAppPassword) assert.equal(raw.includes(config.gmailAppPassword), false);
    if (config.supabaseSecretKey) assert.equal(raw.includes(config.supabaseSecretKey), false);

    const sysJson = JSON.parse(raw);
    assert.equal(sysJson.data.api.status, 'operational');
    assert.equal(sysJson.data.database.status, 'operational');
    assert.notEqual(sysJson.data.smtp.status, 'operational');
    assert.equal(sysJson.data.worker.status, 'unavailable');
    assert.equal(sysJson.data.worker.lock_held, false);
  });

  await test('13. Malformed JSON, unknown route (404), and blocked CORS (403) return structured requestId', async () => {
    setTestSupabaseClient(seededDb);
    const badJsonRes = await fetch(`${baseUrl}/api/emails/send`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer demo-admin-token',
        'Content-Type': 'application/json',
      },
      body: '{invalid-json',
    });
    assert.equal(badJsonRes.status, 400);
    const badJson = await badJsonRes.json();
    assert.equal(badJson.error.code, 'INVALID_JSON_PAYLOAD');
    assert.ok(badJson.error.requestId);

    const notFoundRes = await fetch(`${baseUrl}/api/unknown-endpoint-xyz`, {
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(notFoundJson.error.requestId);

    const badCorsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://untrusted-origin.example.com' },
    });
    assert.equal(badCorsRes.status, 403);
    const badCorsJson = await badCorsRes.json();
    assert.equal(badCorsJson.error.code, 'CORS_ORIGIN_FORBIDDEN');
  });

  await test('14. Rejects non-admin JWT (forged user_metadata role) on DELETE /api/templates/:id (403)', async () => {
    const targetTplId = seededDb._store.email_templates[0]?.id;
    assert.ok(targetTplId, 'Seeded fixture should provide a template ID');
    const authDb = createAuthAwareDb(seededDb, {
      'non-admin-user-jwt': {
        user: {
          id: '00000000-0000-0000-0000-000000009998',
          email: 'user@snpsu.edu.in',
          user_metadata: { role: 'administrator' },
          app_metadata: {},
        },
      },
    });
    setTestSupabaseClient(authDb);
    const res = await fetch(`${baseUrl}/api/templates/${targetTplId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer non-admin-user-jwt' },
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error.code, 'FORBIDDEN');
    assert.ok(seededDb._store.email_templates.some((t) => t.id === targetTplId));
  });
} finally {
  setTestSupabaseClient(seededDb);
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

console.log('\n================================================================');
console.log(`Production API Verification Complete: ${passed} Passed, ${failed} Failed`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
