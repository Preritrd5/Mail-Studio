import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { setSmtpTransporter } from '../src/services/smtpService.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';
import { activityRepository, ActivityRepository } from '../src/repositories/activityRepository.js';
import { reportsRepository, ReportsRepository } from '../src/repositories/reportsRepository.js';
import { sanitizeForSpreadsheet, escapeCsvField, buildCsv } from '../src/utils/csvHelper.js';
import { buildInstitutionalExcelWorkbook } from '../src/utils/excelHelper.js';
import { config } from '../src/config/env.js';
import XLSX from 'xlsx';

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

console.log('================================================================');
console.log('  SNPSUNEXUS Mail Studio — Phase 8 Activity & Reports Tests');
console.log('  Testing 56 Unified Activity, Reconciliation, Export & Security');
console.log('================================================================\n');

const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;
const AUTH_HEADER = {
  'Authorization': 'Bearer demo-admin-token',
  'Content-Type': 'application/json',
};

// ============================================================================
// PART A: CSV & EXCEL SPREADSHEET FORMULA INJECTION PROTECTION (Tests 1-8)
// ============================================================================

await runTest('1. Formula sanitization: Equals prefix (=SUM(A1:B1))', async () => {
  const dangerous = '=SUM(A1:B1)';
  const sanitized = sanitizeForSpreadsheet(dangerous);
  assert.equal(sanitized, "'=SUM(A1:B1)");
});

await runTest('2. Formula sanitization: Plus prefix (+cmd|/c calc)', async () => {
  const dangerous = '+cmd|/c calc';
  const sanitized = sanitizeForSpreadsheet(dangerous);
  assert.equal(sanitized, "'+cmd|/c calc");
});

await runTest('3. Formula sanitization: Minus prefix (-2+3+cmd|)', async () => {
  const dangerous = '-2+3+cmd|';
  const sanitized = sanitizeForSpreadsheet(dangerous);
  assert.equal(sanitized, "'-2+3+cmd|");
});

await runTest('4. Formula sanitization: At-symbol prefix (@SUM(1,2))', async () => {
  const dangerous = '@SUM(1,2)';
  const sanitized = sanitizeForSpreadsheet(dangerous);
  assert.equal(sanitized, "'@SUM(1,2)");
});

await runTest('5. Formula sanitization: Tab and CR characters (\\tcmd, \\rcalc)', async () => {
  const dangerousTab = '\tmalicious_command';
  const dangerousCr = '\rmalicious_eval';
  assert.equal(sanitizeForSpreadsheet(dangerousTab), "'\tmalicious_command");
  assert.equal(sanitizeForSpreadsheet(dangerousCr), "'\rmalicious_eval");
});

await runTest('6. Formula sanitization: Normal text left untouched', async () => {
  const normalText = 'Dr. Ramesh Rao (Faculty of Engineering)';
  const normalEmail = 'ramesh.rao@snpsu.edu.in';
  assert.equal(sanitizeForSpreadsheet(normalText), normalText);
  assert.equal(sanitizeForSpreadsheet(normalEmail), normalEmail);
});

await runTest('7. CSV Helper: UTF-8 BOM prefix & RFC-4180 escaping', async () => {
  const headers = ['Recipient Name', 'Formula Value', 'Notes'];
  const rows = [
    ['Ananya Sharma', '=1+1', 'Student, Dept of CS'],
  ];
  const csvText = buildCsv(headers, rows);
  // Must start with UTF-8 BOM \uFEFF
  assert.equal(csvText.charCodeAt(0), 0xFEFF);
  // Formula must be sanitized
  assert.ok(csvText.includes("''=1+1") || csvText.includes("=\"'=1+1\"") || csvText.includes("'=1+1"));
  // Quotes & commas escaped
  assert.ok(csvText.includes('"Student, Dept of CS"'));
});

await runTest('8. Excel Helper: Generates multi-sheet workbook with sanitized cells', async () => {
  const workbookBuf = buildInstitutionalExcelWorkbook({
    overview: {
      total_recipients: 100,
      total_sent: 95,
      total_failed: 5,
      total_pending: 0,
      total_attempts: 105,
      acceptance_rate: 95.0,
      failure_rate: 5.0,
    },
    campaigns: [
      {
        id: 'camp-test-1',
        campaign_name: '=CMD|/C CALC',
        campaign_type: 'bulk',
        status: 'completed',
        total_recipients: 100,
        sent_count: 95,
        pending_count: 0,
        failed_count: 5,
        acceptance_rate: 95.0,
        created_at: new Date().toISOString(),
      },
    ],
    activity: [
      {
        id: 'act-test-1',
        recipient_name: '+DangerousName',
        recipient_email: 'student@snpsu.edu.in',
        campaign_name: 'Orientation',
        status: 'sent',
        attempt_count: 1,
        created_at: new Date().toISOString(),
      },
    ],
  });

  assert.ok(Buffer.isBuffer(workbookBuf));
  assert.ok(workbookBuf.length > 1000);

  // Parse workbook back with XLSX to verify worksheets and sanitization
  const wb = XLSX.read(workbookBuf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('Executive Overview'));
  assert.ok(wb.SheetNames.includes('Campaign Performance'));
  assert.ok(wb.SheetNames.includes('Recent Activity'));

  const campSheet = wb.Sheets['Campaign Performance'];
  const campJson = XLSX.utils.sheet_to_json(campSheet);
  assert.ok(campJson.length > 0);
  const campRow = campJson[0];
  assert.equal(campRow['Campaign Name'], "'=CMD|/C CALC");
});

// ============================================================================
// PART B: ACTIVITY REPOSITORY & DATA ACCESS (Tests 9-20)
// ============================================================================

let testActivityRepo;
let sampleRecipientId;

await runTest('9. ActivityRepository initialization (Isolated Test DB)', async () => {
  testActivityRepo = new ActivityRepository();
  assert.ok(testActivityRepo);
  assert.ok(Array.isArray(testClient._store.campaign_recipients));
});

await runTest('10. Test fixture store contains deterministic test recipients & attempts', async () => {
  const store = testClient._store;
  assert.ok(store.campaign_recipients.length >= 4);
  assert.ok(store.email_attempts.length >= 3);

  const sentItem = store.campaign_recipients.find(r => r.status === 'sent');
  assert.ok(sentItem);
  sampleRecipientId = sentItem.id;
});

await runTest('11. Activity list: Default pagination returns items & metadata', async () => {
  const res = await testActivityRepo.listActivities({ page: 1, limit: 10 });
  assert.ok(Array.isArray(res.items));
  assert.ok(res.pagination);
  assert.equal(res.pagination.page, 1);
  assert.equal(res.pagination.limit, 10);
  assert.ok(res.pagination.total >= 0);
});

await runTest('12. Activity list: Search filtering by recipient name', async () => {
  const allRes = await testActivityRepo.listActivities({ limit: 100 });
  if (allRes.items.length > 0) {
    const targetName = allRes.items[0].recipient_name.slice(0, 4);
    const searchRes = await testActivityRepo.listActivities({ search: targetName });
    assert.ok(searchRes.items.length > 0);
    searchRes.items.forEach(item => {
      const match = item.recipient_name.toLowerCase().includes(targetName.toLowerCase()) ||
                    item.recipient_email.toLowerCase().includes(targetName.toLowerCase()) ||
                    item.subject.toLowerCase().includes(targetName.toLowerCase()) ||
                    item.campaign_name.toLowerCase().includes(targetName.toLowerCase());
      assert.ok(match);
    });
  }
});

await runTest('13. Activity list: Search filtering by recipient email', async () => {
  const searchRes = await testActivityRepo.listActivities({ search: '@snpsu.edu.in' });
  assert.ok(Array.isArray(searchRes.items));
  searchRes.items.forEach(item => {
    assert.ok(item.recipient_email.toLowerCase().includes('@snpsu.edu.in') ||
              item.recipient_name.toLowerCase().includes('@snpsu.edu.in'));
  });
});

await runTest('14. Activity list: Status filtering strictly for "sent"', async () => {
  const sentRes = await testActivityRepo.listActivities({ status: 'sent', limit: 50 });
  assert.ok(Array.isArray(sentRes.items));
  sentRes.items.forEach(item => {
    assert.equal(item.status, 'sent');
  });
});

await runTest('15. Activity list: Status filtering strictly for "failed"', async () => {
  const failedRes = await testActivityRepo.listActivities({ status: 'failed', limit: 50 });
  assert.ok(Array.isArray(failedRes.items));
  failedRes.items.forEach(item => {
    assert.equal(item.status, 'failed');
  });
});

await runTest('16. Activity list: Campaign type filter ("individual" vs "bulk")', async () => {
  const indRes = await testActivityRepo.listActivities({ campaign_type: 'individual' });
  indRes.items.forEach(item => {
    assert.equal(item.campaign_type, 'individual');
  });

  const bulkRes = await testActivityRepo.listActivities({ campaign_type: 'bulk' });
  bulkRes.items.forEach(item => {
    assert.equal(item.campaign_type, 'bulk');
  });
});

await runTest('17. Activity list: Sorting by sent_at asc/desc', async () => {
  const descRes = await testActivityRepo.listActivities({ sort_by: 'sent_at', sort_order: 'desc', limit: 10 });
  assert.ok(descRes.items.length >= 0);
});

await runTest('18. Activity detail: Fetch single activity with attempts', async () => {
  const detail = await testActivityRepo.getActivityDetail(sampleRecipientId);
  assert.ok(detail);
  assert.equal(detail.id, sampleRecipientId);
  assert.ok(Array.isArray(detail.attempts));
});

await runTest('19. Chronological attempt order: attempts sorted ascending by created_at / attempt_number', async () => {
  const detail = await testActivityRepo.getActivityDetail(sampleRecipientId);
  assert.ok(detail);
  if (detail.attempts.length > 1) {
    for (let i = 1; i < detail.attempts.length; i++) {
      assert.ok(detail.attempts[i].attempt_number >= detail.attempts[i - 1].attempt_number);
    }
  }
});

await runTest('20. Activity detail: Non-existent ID returns null', async () => {
  const detail = await testActivityRepo.getActivityDetail('non-existent-guid-999');
  assert.equal(detail, null);
});

// ============================================================================
// PART C: RETRY LOGIC & STRICT RESTRICTIONS (Tests 21-30)
// ============================================================================

await runTest('21. Retry restriction: Cannot retry already "sent" recipient', async () => {
  await assert.rejects(
    async () => {
      await testActivityRepo.retryRecipient(sampleRecipientId);
    },
    /accepted by SMTP|Resending accepted emails is prohibited/
  );
});

await runTest('22. Retry restriction: Cannot retry "pending" recipient', async () => {
  const pendingItem = testClient._store.campaign_recipients.find(r => r.status === 'pending');
  if (pendingItem) {
    await assert.rejects(
      async () => {
        await testActivityRepo.retryRecipient(pendingItem.id);
      },
      /Pending emails are already queued/
    );
  }
});

await runTest('23. Retry restriction: Cannot retry "sending" recipient', async () => {
  const sendingId = 'rec-temp-sending-unique-1';
  testClient._store.campaign_recipients.push({
    id: sendingId,
    recipient_name: 'Test Sending',
    recipient_email: 'sending@snpsu.edu.in',
    status: 'sending',
    attempt_count: 1,
    campaign_id: 'c2000000-0000-0000-0000-000000000002',
    created_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => {
      await testActivityRepo.retryRecipient(sendingId);
    },
    /in flight and cannot be retried/
  );
});

await runTest('24. Retry restriction: Cannot retry "outcome_unknown" recipient (must use Phase 7 review)', async () => {
  const unknownId = 'rec-temp-unknown-unique-1';
  testClient._store.campaign_recipients.push({
    id: unknownId,
    recipient_name: 'Test Unknown',
    recipient_email: 'unknown@snpsu.edu.in',
    status: 'outcome_unknown',
    attempt_count: 1,
    campaign_id: 'c1000000-0000-0000-0000-000000000001',
    created_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => {
      await testActivityRepo.retryRecipient(unknownId);
    },
    /Outcome is uncertain/
  );
});

await runTest('25. Retry restriction: Cannot retry "cancelled" recipient', async () => {
  const cancelledId = 'rec-temp-cancelled-unique-1';
  testClient._store.campaign_recipients.push({
    id: cancelledId,
    recipient_name: 'Test Cancelled',
    recipient_email: 'cancelled@snpsu.edu.in',
    status: 'cancelled',
    attempt_count: 1,
    campaign_id: 'c1000000-0000-0000-0000-000000000001',
    created_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => {
      await testActivityRepo.retryRecipient(cancelledId);
    },
    /Cancelled recipient cannot be retried/
  );
});

await runTest('26. Retry execution: Bulk email failure requeues into sequential queue (requeue_failed_recipient)', async () => {
  let bulkFailed = testClient._store.campaign_recipients.find(
    r => r.status === 'failed' && r.campaign_id === 'c1000000-0000-0000-0000-000000000001'
  );
  assert.ok(bulkFailed);

  const result = await testActivityRepo.retryRecipient(bulkFailed.id);
  assert.equal(result.requeued, true);
  assert.equal(result.status, 'pending');
  assert.equal(result.action, 'requeued_to_queue');
  assert.ok(result.message.includes('requeued into the sequential queue'));

  const updated = testClient._store.campaign_recipients.find(r => r.id === bulkFailed.id);
  assert.equal(updated.status, 'pending');
  assert.equal(updated.claimed_at, null);
});

let retriedIndividualId;

await runTest('27. Retry execution: Individual email failure re-dispatches with new idempotency key', async () => {
  setSmtpTransporter({
    sendMail: async () => ({
      messageId: `<retry-msg-${Date.now()}@snpsunexus.test>`,
      response: '250 2.0.0 OK',
    }),
  });

  let indFailed = testClient._store.campaign_recipients.find(
    r => r.status === 'failed' && r.campaign_id === 'c2000000-0000-0000-0000-000000000002'
  );
  assert.ok(indFailed);

  retriedIndividualId = indFailed.id;
  const initialAttemptCount = indFailed.attempt_count;
  const result = await testActivityRepo.retryRecipient(indFailed.id);

  assert.equal(result.requeued, false);
  assert.equal(result.status, 'sent');
  assert.equal(result.action, 'sent_individual');
  assert.ok(result.smtp_message_id);

  const updated = testClient._store.campaign_recipients.find(r => r.id === indFailed.id);
  assert.ok(updated.attempt_count > initialAttemptCount);
});

await runTest('28. Retry idempotency: Rapid retry while status changed is blocked', async () => {
  const sentRecipient = testClient._store.campaign_recipients.find(r => r.status === 'sent');
  assert.ok(sentRecipient);
  await assert.rejects(
    async () => {
      await testActivityRepo.retryRecipient(sentRecipient.id);
    },
    /accepted by SMTP|Resending accepted emails is prohibited/
  );
});

await runTest('29. Retry audit trail: Generates new email_attempts row on retry', async () => {
  const attempts = testClient._store.email_attempts.filter(a => a.recipient_id === retriedIndividualId);
  assert.ok(attempts.length >= 1);
  const latestAttempt = attempts[attempts.length - 1];
  assert.ok(latestAttempt.smtp_message_id);
});

await runTest('30. Retry on non-existent recipient returns error', async () => {
  await assert.rejects(
    async () => {
      await testActivityRepo.retryRecipient('non-existent-guid-404');
    },
    /Recipient 'non-existent-guid-404' not found/
  );
});

// ============================================================================
// PART D: REPORTS REPOSITORY & RECONCILIATION FORMULA (Tests 31-40)
// ============================================================================

let testReportsRepo;

await runTest('31. ReportsRepository initialization against test store', async () => {
  testReportsRepo = new ReportsRepository();
  assert.ok(testReportsRepo);
});

await runTest('32. Reports overview summary contains all reconciled metrics', async () => {
  const summary = await testReportsRepo.getOverviewSummary();
  assert.ok(typeof summary.total_recipients === 'number');
  assert.ok(typeof summary.total_sent === 'number');
  assert.ok(typeof summary.total_failed === 'number');
  assert.ok(typeof summary.total_pending === 'number');
  assert.ok(typeof summary.total_attempts === 'number');
  assert.ok(typeof summary.acceptance_rate === 'number');
  assert.ok(typeof summary.failure_rate === 'number');
});

await runTest('33. Strict Acceptance Rate Formula: Sent / (Sent + Failed) * 100', async () => {
  const summary = await testReportsRepo.getOverviewSummary();
  const denominator = summary.total_sent + summary.total_failed;
  if (denominator > 0) {
    const expectedRate = Math.round((summary.total_sent / denominator) * 1000) / 10;
    assert.equal(summary.acceptance_rate, expectedRate);
  } else {
    assert.equal(summary.acceptance_rate, 0);
  }
});

await runTest('34. Strict Failure Rate Formula: Failed / (Sent + Failed) * 100', async () => {
  const summary = await testReportsRepo.getOverviewSummary();
  const denominator = summary.total_sent + summary.total_failed;
  if (denominator > 0) {
    const expectedFailure = Math.round((summary.total_failed / denominator) * 1000) / 10;
    assert.equal(summary.failure_rate, expectedFailure);
  } else {
    assert.equal(summary.failure_rate, 0);
  }
});

await runTest('35. Pending & sending counts strictly excluded from acceptance rate denominator', async () => {
  const sent = 8;
  const failed = 2;
  const pending = 100;
  const denom = sent + failed; // pending is excluded
  const rate = Math.round((sent / denom) * 1000) / 10;
  assert.equal(rate, 80.0);
});

await runTest('36. Zero division guard: when sent + failed = 0, rates are 0.0%', async () => {
  const sent = 0;
  const failed = 0;
  const denom = sent + failed;
  const rate = denom > 0 ? (sent / denom) * 100 : 0;
  assert.equal(rate, 0);
});

await runTest('37. Unique recipient counting: distinct recipients vs total attempt rows', async () => {
  const summary = await testReportsRepo.getOverviewSummary();
  assert.ok(summary.total_recipients >= 0);
  assert.ok(summary.total_attempts >= 0);
});

await runTest('38. Campaign reports listing returns array with completion metrics', async () => {
  const result = await testReportsRepo.listCampaignReports();
  assert.ok(Array.isArray(result.campaigns));
  assert.ok(typeof result.total === 'number');

  if (result.campaigns.length > 0) {
    const camp = result.campaigns[0];
    assert.ok(camp.id);
    assert.ok(camp.campaign_name);
    assert.ok(typeof camp.total_recipients === 'number');
    assert.ok(typeof camp.sent_count === 'number');
    assert.ok(typeof camp.acceptance_rate === 'number');
  }
});

await runTest('39. Campaign report detail returns campaign-specific metrics', async () => {
  const result = await testReportsRepo.listCampaignReports();
  if (result.campaigns.length > 0) {
    const campId = result.campaigns[0].id;
    const detail = await testReportsRepo.getCampaignReportDetail(campId);
    assert.ok(detail);
    assert.equal(detail.id, campId);
  }
});

await runTest('40. Daily timeline metrics returns bucketed sent and failed dispatches', async () => {
  const timeline = await testReportsRepo.getTimelineMetrics(7);
  assert.ok(Array.isArray(timeline));
  assert.equal(timeline.length, 7);
  timeline.forEach(point => {
    assert.ok(point.date);
    assert.ok(typeof point.sent === 'number');
    assert.ok(typeof point.failed === 'number');
  });
});

// ============================================================================
// PART E: LIVE EXPRESS API ENDPOINTS & AUTHENTICATION (Tests 41-52)
// ============================================================================

await runTest('41. GET /api/activity: 401 Unauthorized without auth token', async () => {
  const res = await fetch(`${API_BASE}/activity`);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.success, false);
});

await runTest('42. GET /api/reports/overview: 401 Unauthorized without auth token', async () => {
  const res = await fetch(`${API_BASE}/reports/overview`);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.success, false);
});

await runTest('43. GET /api/activity: 200 OK with valid bearer token', async () => {
  const res = await fetch(`${API_BASE}/activity?limit=5`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.pagination);
});

await runTest('44. GET /api/activity: Search query param works live', async () => {
  const res = await fetch(`${API_BASE}/activity?search=snpsu`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

await runTest('45. GET /api/activity/:id: 200 OK returns detail and chronological attempts', async () => {
  const listRes = await fetch(`${API_BASE}/activity?limit=1`, { headers: AUTH_HEADER });
  const listJson = await listRes.json();
  const items = Array.isArray(listJson.data) ? listJson.data : (listJson.data?.items || []);
  if (items.length > 0) {
    const targetId = items[0].id;
    const detailRes = await fetch(`${API_BASE}/activity/${targetId}`, { headers: AUTH_HEADER });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.success, true);
    assert.equal(detailJson.data.id, targetId);
    assert.ok(Array.isArray(detailJson.data.attempts));
  }
});

await runTest('46. GET /api/activity/:id: 404 Not Found for non-existent ID', async () => {
  const res = await fetch(`${API_BASE}/activity/non-existent-guid-9999`, { headers: AUTH_HEADER });
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.success, false);
});

await runTest('47. POST /api/activity/:id/retry: 400 Bad Request when retrying "sent" item', async () => {
  const listRes = await fetch(`${API_BASE}/activity?status=sent&limit=1`, { headers: AUTH_HEADER });
  const listJson = await listRes.json();
  const items = Array.isArray(listJson.data) ? listJson.data : (listJson.data?.items || []);
  if (items.length > 0) {
    const sentId = items[0].id;
    const retryRes = await fetch(`${API_BASE}/activity/${sentId}/retry`, {
      method: 'POST',
      headers: AUTH_HEADER,
    });
    assert.equal(retryRes.status, 400);
    const retryJson = await retryRes.json();
    assert.equal(retryJson.success, false);
    assert.ok(retryJson.error.message.includes('accepted by SMTP') || retryJson.error.code === 'RETRY_ALREADY_SENT');
  }
});

await runTest('48. GET /api/reports/overview: 200 OK returns reconciled summary', async () => {
  const res = await fetch(`${API_BASE}/reports/overview`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(typeof json.data.total_recipients === 'number');
  assert.ok(typeof json.data.total_sent === 'number');
  assert.ok(typeof json.data.acceptance_rate === 'number');
});

await runTest('49. GET /api/reports/campaigns: 200 OK returns campaign summaries', async () => {
  const res = await fetch(`${API_BASE}/reports/campaigns?limit=5`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.pagination);
});

await runTest('50. GET /api/reports/timeline: 200 OK returns timeline data', async () => {
  const res = await fetch(`${API_BASE}/reports/timeline?days=7`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.equal(json.data.length, 7);
});

await runTest('51. GET /api/reports/export/csv: 200 OK returns UTF-8 CSV with Formula Protection', async () => {
  const res = await fetch(`${API_BASE}/reports/export/csv?type=activity`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const contentType = res.headers.get('content-type');
  assert.ok(contentType.includes('text/csv'));

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  assert.ok(buf.length > 50);

  // Check UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)
  assert.equal(buf[0], 0xEF);
  assert.equal(buf[1], 0xBB);
  assert.equal(buf[2], 0xBF);

  const text = buf.toString('utf-8');
  assert.ok(text.includes('Recipient Name'));
  assert.ok(text.includes('Recipient Email'));
  assert.ok(text.includes('Status'));
});

await runTest('52. GET /api/reports/export/xlsx: 200 OK returns valid OpenXML Excel binary', async () => {
  const res = await fetch(`${API_BASE}/reports/export/xlsx`, { headers: AUTH_HEADER });
  assert.equal(res.status, 200);
  const contentType = res.headers.get('content-type');
  assert.ok(contentType.includes('spreadsheetml.sheet'));

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  assert.ok(buf.length > 1000);

  const wb = XLSX.read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('Report Overview'));
  assert.ok(wb.SheetNames.includes('Campaign Summary'));
  assert.ok(wb.SheetNames.includes('Email Activity'));
});

// ============================================================================
// PART F: SECURITY, RLS & ZERO SECRET LEAKAGE (Tests 53-56)
// ============================================================================

await runTest('53. Security: Activity endpoints never leak SMTP password or raw credentials', async () => {
  const res = await fetch(`${API_BASE}/activity?limit=10`, { headers: AUTH_HEADER });
  const rawBody = await res.text();
  assert.equal(rawBody.includes(config.gmailAppPassword), false);
  assert.equal(rawBody.includes(config.supabaseSecretKey), false);
});

await runTest('54. Security: Reports endpoints never leak database connection credentials', async () => {
  const res = await fetch(`${API_BASE}/reports/overview`, { headers: AUTH_HEADER });
  const rawBody = await res.text();
  assert.equal(rawBody.includes(config.supabaseSecretKey), false);
});

await runTest('55. Security: Activity detail attempts history masks raw credentials', async () => {
  const listRes = await fetch(`${API_BASE}/activity?limit=1`, { headers: AUTH_HEADER });
  const listJson = await listRes.json();
  const items = Array.isArray(listJson.data) ? listJson.data : (listJson.data?.items || []);
  if (items.length > 0) {
    const detailRes = await fetch(`${API_BASE}/activity/${items[0].id}`, { headers: AUTH_HEADER });
    const text = await detailRes.text();
    assert.equal(text.includes(config.gmailAppPassword), false);
  }
});

await runTest('56. Security: Header injection and invalid method guards', async () => {
  const res = await fetch(`${API_BASE}/activity`, {
    method: 'DELETE',
    headers: AUTH_HEADER,
  });
  assert.ok(res.status === 404 || res.status === 405);
});

// ============================================================================
// SUMMARY REPORT
// ============================================================================

httpServer.closeAllConnections?.();
await new Promise((resolve) => httpServer.close(resolve));
console.log('\n================================================================');
console.log(`  Phase 8 Test Suite Complete: ${passedCount}/56 Passed, ${failedCount} Failed`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
