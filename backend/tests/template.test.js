import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { config } from '../src/config/env.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';
import * as templateRepo from '../src/repositories/templateRepository.js';
import { validateAndSanitizeTemplate } from '../src/validators/templateValidator.js';
import { PLACEHOLDER_REGISTRY, inspectPlaceholders } from '../src/services/placeholderRegistry.js';
import { renderTemplateHtml, renderTemplateText, getSamplePreviewContext } from '../src/services/templateRenderer.js';

process.env.NODE_ENV = 'test';
const testDb = createTestSupabaseClient('seeded');
setTestSupabaseClient(testDb);
const httpServer = await new Promise((resolve) => {
  const srv = app.listen(0, () => resolve(srv));
});
const TEST_PORT = httpServer.address().port;

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

const mockAdminUser = {
  id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
  email: 'admin@snpsu.edu.in',
  user_metadata: { role: 'administrator' },
};

console.log('========================================================');
console.log('  SNPSUNEXUS Mail Studio — Template Management Test Suite');
console.log('  Testing 20 Template CRUD, Versioning & Security Scenarios');
console.log('========================================================\n');

// 1. Placeholder Registry Completeness
await test('1. Centralized placeholder registry contract (all 6 tokens)', async () => {
  const expectedTokens = [
    '{{recipient_name}}',
    '{{recipient_email}}',
    '{{institution_name}}',
    '{{designation}}',
    '{{activation_link}}',
    '{{current_year}}',
  ];
  for (const token of expectedTokens) {
    const key = token.replace(/[{}]/g, '');
    assert.ok(PLACEHOLDER_REGISTRY[key], `Missing registry entry for ${key}`);
    assert.equal(PLACEHOLDER_REGISTRY[key].token, token);
  }
});

// 2. Placeholder Detection & Unsupported Reporting
await test('2. Detection of supported and unsupported placeholder tokens', async () => {
  const text = 'Hello {{recipient_name}}, your {{activation_link}} and {{unknown_token_xyz}} are ready.';
  const report = inspectPlaceholders(text);
  assert.equal(report.found.length, 3);
  assert.ok(report.supported.includes('{{recipient_name}}'));
  assert.ok(report.supported.includes('{{activation_link}}'));
  assert.ok(report.unsupported.includes('{{unknown_token_xyz}}'));
});

// 3. Safe Dynamic Text Rendering & HTML Escaping
await test('3. Dynamic text rendering with HTML entity escaping', async () => {
  const template = 'Dear {{recipient_name}}, welcome to {{institution_name}}!';
  const values = {
    recipient_name: 'Dr. <MaliciousTag>&"Special"',
    institution_name: 'Sapthagiri NPS University',
  };
  const rendered = renderTemplateHtml(template, values);
  assert.ok(rendered.includes('&lt;MaliciousTag&gt;'));
  assert.ok(!rendered.includes('<MaliciousTag>'));
  assert.ok(rendered.includes('Sapthagiri NPS University'));
});

// 4. URL Validation for Activation Links (Strict HTTPS)
await test('4. URL validation for activation links (reject javascript: and unsafe schemes)', async () => {
  const maliciousUrl = 'javascript:alert("pwned")';
  const sanitized = PLACEHOLDER_REGISTRY.activation_link.sanitize(maliciousUrl);
  assert.ok(!sanitized.startsWith('javascript:'));
  assert.ok(sanitized.startsWith('https://'));
});

// 5. Allowlist HTML Sanitization on Templates
await test('5. Allowlist HTML sanitization (strips <script> & <iframe> from templates)', async () => {
  const maliciousHtml = '<div><h3>Header</h3><script>window.hack=1;</script><iframe src="evil.com"></iframe><p>Body</p></div>';
  const validated = validateAndSanitizeTemplate({
    name: 'XSS Test Template',
    subject: 'Security Check',
    html_content: maliciousHtml,
  });
  assert.ok(!validated.html_content.includes('<script'));
  assert.ok(!validated.html_content.includes('<iframe'));
  assert.ok(validated.html_content.includes('<h3>Header</h3>'));
});

// 6. Template Creation Validation (Reject empty name/subject)
await test('6. Template creation validation (rejects empty name and subject)', async () => {
  assert.throws(() => {
    validateAndSanitizeTemplate({
      name: '',
      subject: 'Valid Subject',
      html_content: '<p>Content</p>',
    });
  }, (err) => err.statusCode === 422);

  assert.throws(() => {
    validateAndSanitizeTemplate({
      name: 'Valid Name',
      subject: '',
      html_content: '<p>Content</p>',
    });
  }, (err) => err.statusCode === 422);
});

// 7. Template Creation & Version 1 Initialization
let createdTemplateId = null;
await test('7. Create template and initialize version 1 baseline snapshot', async () => {
  const created = await templateRepo.createTemplate({
    name: 'Semester Commencement Advisory 2026',
    description: 'Notice regarding commencement of semester coursework and classroom allocations.',
    category: 'Notifications',
    subject: 'Commencement Notice — {{recipient_name}} ({{current_year}})',
    html_content: '<div style="font-family: Arial;"><p>Dear {{recipient_name}}, coursework begins on schedule.</p></div>',
    text_content: 'Dear {{recipient_name}}, coursework begins on schedule.',
    userId: mockAdminUser.id,
  });

  assert.ok(created.id);
  assert.equal(created.version, 1);
  assert.equal(created.is_active, true);
  assert.equal(created.archived_at, null);
  createdTemplateId = created.id;
});

// 8. Retrieve Template by ID with Version History
await test('8. Retrieve template by ID including historical version list', async () => {
  const fetched = await templateRepo.getTemplateById(createdTemplateId);
  assert.ok(fetched);
  assert.equal(fetched.id, createdTemplateId);
  assert.equal(fetched.version, 1);
  assert.ok(Array.isArray(fetched.versions));
  assert.equal(fetched.versions.length, 1);
  assert.equal(fetched.versions[0].version, 1);
});

// 9. Update Template & Version Auto-Increment
await test('9. Update template, auto-increment version to v2, and preserve v1 snapshot', async () => {
  const updated = await templateRepo.updateTemplate(createdTemplateId, {
    subject: 'REVISED: Commencement Notice — {{recipient_name}} ({{current_year}})',
    html_content: '<div style="font-family: Arial;"><p>Dear {{recipient_name}}, coursework schedule has been updated.</p></div>',
    changeSummary: 'Updated schedule instructions for classrooms',
    userId: mockAdminUser.id,
  });

  assert.equal(updated.version, 2);
  assert.ok(updated.subject.includes('REVISED'));

  // Verify historical version integrity
  const full = await templateRepo.getTemplateById(createdTemplateId);
  assert.equal(full.versions.length, 2);
  const v1 = full.versions.find((v) => v.version === 1);
  const v2 = full.versions.find((v) => v.version === 2);
  assert.ok(v1);
  assert.ok(v2);
  assert.ok(!v1.subject.includes('REVISED'), 'Historical v1 subject must remain immutable!');
  assert.ok(v2.subject.includes('REVISED'), 'v2 subject contains revision');
});

// 10. Duplicate Template
let duplicatedTemplateId = null;
await test('10. Duplicate template (copies content, assigns new ID, version 1)', async () => {
  const copy = await templateRepo.duplicateTemplate(createdTemplateId, {
    newName: 'Semester Commencement Advisory 2026 (Duplicate)',
    userId: mockAdminUser.id,
  });

  assert.ok(copy.id);
  assert.notEqual(copy.id, createdTemplateId);
  assert.equal(copy.name, 'Semester Commencement Advisory 2026 (Duplicate)');
  assert.equal(copy.version, 1);
  duplicatedTemplateId = copy.id;
});

// 11. Archive Template (Soft-Delete)
await test('11. Safe template archival (is_active = false, archived_at recorded)', async () => {
  const archived = await templateRepo.archiveTemplate(duplicatedTemplateId, mockAdminUser.id);
  assert.equal(archived.is_active, false);
  assert.ok(archived.archived_at);

  const check = await templateRepo.getTemplateById(duplicatedTemplateId);
  assert.equal(check.is_active, false);
  assert.ok(check.archived_at);
});

// 12. Active List Filtering (Excludes Archived Templates)
await test('12. Active gallery list filter excludes archived templates', async () => {
  const activeList = await templateRepo.listTemplates({ status: 'active' });
  const found = activeList.templates.find((t) => t.id === duplicatedTemplateId);
  assert.equal(found, undefined, 'Archived template must NOT appear in default active gallery!');
});

// 13. Archived List Filtering (Retrieves Archived Templates)
await test('13. Archived filter retrieves archived templates for historical audit', async () => {
  const archivedList = await templateRepo.listTemplates({ status: 'archived' });
  const found = archivedList.templates.find((t) => t.id === duplicatedTemplateId);
  assert.ok(found, 'Archived template must be accessible via archived filter');
});

// 14. Restore Archived Template
await test('14. Restore archived template back to active gallery', async () => {
  const restored = await templateRepo.restoreTemplate(duplicatedTemplateId, mockAdminUser.id);
  assert.equal(restored.is_active, true);
  assert.equal(restored.archived_at, null);

  const activeList = await templateRepo.listTemplates({ status: 'active' });
  const found = activeList.templates.find((t) => t.id === duplicatedTemplateId);
  assert.ok(found, 'Restored template must reappear in active gallery');
});

// 15. Search & Category Filtering
await test('15. Search and category filtering in template list', async () => {
  const searchResults = await templateRepo.listTemplates({ search: 'Commencement', status: 'all' });
  assert.ok(searchResults.templates.length >= 1);

  const categoryResults = await templateRepo.listTemplates({ category: 'Examinations', status: 'all' });
  assert.ok(categoryResults.templates.every((t) => t.category === 'Examinations'));
});

// 16. Template Preview Generation with Sample Context
await test('16. Safe template preview generation with sample context', async () => {
  const sample = getSamplePreviewContext();
  const html = '<h1>Dear {{recipient_name}}</h1><p>Visit: {{activation_link}}</p>';
  const renderedHtml = renderTemplateHtml(html, sample);
  assert.ok(renderedHtml.includes(`Dear ${sample.recipient_name}`));
  assert.ok(renderedHtml.includes(sample.activation_link));
});

// 17. Unresolved Placeholder Highlighting in Preview
await test('17. Unresolved placeholder detection and safe highlighting', async () => {
  const html = '<p>Your score: {{unsupported_score_token}}</p>';
  const renderedHtml = renderTemplateHtml(html, {});
  assert.ok(renderedHtml.includes('[UNRESOLVED: {{unsupported_score_token}}]'));
  assert.ok(!renderedHtml.includes('<script'));
});

// 18. Plain Text Rendering Integrity
await test('18. Plain text email rendering integrity', async () => {
  const text = 'Hello {{recipient_name}},\nSession: {{current_year}}';
  const rendered = renderTemplateText(text, { recipient_name: 'Priya Nair', current_year: '2026' });
  assert.equal(rendered, 'Hello Priya Nair,\nSession: 2026');
});

// 19. Unauthorized API Access Rejection
await test('19. Unauthorized API access rejection without token (HTTP 401)', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
});

// 20. Zero Secret Leakage in Template Responses
await test('20. Zero secret leakage across template responses', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/placeholders`, {
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  const text = await res.text();
  assert.ok(!text.includes(config.gmailAppPassword));
  assert.ok(!text.includes(config.supabaseSecretKey));
});

// 21. Reject Unauthorized DELETE /api/templates/:id without token (HTTP 401)
await test('21. Reject unauthorized DELETE /api/templates/:id without token (401)', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${duplicatedTemplateId}`, {
    method: 'DELETE',
  });
  assert.equal(res.status, 401);
  const stillExists = await templateRepo.getTemplateById(duplicatedTemplateId);
  assert.ok(stillExists, 'Unauthorized delete must never remove template');
});

// 22. Invalid UUID Rejected Safely on DELETE /api/templates/:id (HTTP 400)
await test('22. Reject non-UUID template ID cleanly with HTTP 400', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/not-a-valid-uuid`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_TEMPLATE_ID');
});

// 23. Unknown UUID Returns HTTP 404 TEMPLATE_NOT_FOUND
await test('23. Unknown valid UUID on DELETE returns HTTP 404', async () => {
  const res = await fetch(
    `http://127.0.0.1:${TEST_PORT}/api/templates/00000000-0000-4000-8000-000000000999`,
    {
      method: 'DELETE',
      headers: { Authorization: 'Bearer demo-admin-token' },
    }
  );
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'TEMPLATE_NOT_FOUND');
});

// 24. Reject Forged admin_id in Request Body on DELETE
await test('24. Reject client-supplied admin_id override in DELETE body (400)', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${duplicatedTemplateId}`, {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer demo-admin-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ admin_id: '00000000-0000-4000-8000-000000001111' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'FORBIDDEN_ACTOR_OVERRIDE');
});

// 25. Permanent Delete Removes Active Template, Cascades Versions & Preserves Unrelated Templates
await test('25. Permanent delete removes active template + versions, records audit & preserves others', async () => {
  const beforeCount = testDb._store.email_templates.length;
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${duplicatedTemplateId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.data.id, duplicatedTemplateId);

  const afterGet = await templateRepo.getTemplateById(duplicatedTemplateId);
  assert.equal(afterGet, null);
  assert.equal(
    testDb._store.template_versions.filter((v) => v.template_id === duplicatedTemplateId).length,
    0,
    'Owned template_versions must be cascade-removed'
  );
  assert.equal(testDb._store.email_templates.length, beforeCount - 1);
  assert.ok(await templateRepo.getTemplateById(createdTemplateId), 'Unrelated template must remain untouched');
  const auditEvent = testDb._store.queue_events.find(
    (e) => e.event_type === 'template_permanently_deleted' && e.event_details?.template_id === duplicatedTemplateId
  );
  assert.ok(auditEvent, 'Non-PII deletion audit event must be logged');
});

// 26. Repeated DELETE / GET After Deletion Returns HTTP 404 Cleanly
await test('26. Repeated DELETE and GET on permanently deleted template returns 404', async () => {
  const delAgain = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${duplicatedTemplateId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(delAgain.status, 404);

  const getAgain = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${duplicatedTemplateId}`, {
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(getAgain.status, 404);
});

// 27. Archived Template Can Be Permanently Deleted Cleanly
await test('27. Archived template can also be permanently deleted from Archived gallery', async () => {
  const temp = await templateRepo.createTemplate({
    name: 'Temp Archived For Permanent Delete',
    category: 'Notifications',
    subject: 'Temp Archived Subject',
    html_content: '<p>Hello {{recipient_name}}</p>',
    text_content: 'Hello {{recipient_name}}',
    userId: mockAdminUser.id,
  });
  await templateRepo.archiveTemplate(temp.id, mockAdminUser.id);

  const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${temp.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(delRes.status, 200);

  const allList = await templateRepo.listTemplates({ status: 'all' });
  assert.equal(allList.templates.find((t) => t.id === temp.id), undefined);
});

// 28. Snapshotted Campaign Preserved When Template Permanently Deleted
await test('28. Permanent delete preserves historical campaigns with immutable snapshot & recipients', async () => {
  const snapTpl = await templateRepo.createTemplate({
    name: 'Snapshotted Historical Template',
    category: 'General Notifications',
    subject: 'Official Notice for {{recipient_name}}',
    html_content: '<p>Dear {{recipient_name}}, snapshotted HTML notice.</p>',
    text_content: 'Dear {{recipient_name}}, snapshotted text notice.',
    userId: mockAdminUser.id,
  });

  const histCampId = 'c9000000-0000-4000-8000-000000000001';
  const histRecipId = 'r9000000-0000-4000-8000-000000000001';
  const histAttemptId = 'at-hist-9001';
  testDb._store.campaigns.push({
    id: histCampId,
    campaign_name: 'Completed Snapshotted Campaign',
    campaign_type: 'bulk',
    subject: snapTpl.subject,
    template_id: snapTpl.id,
    template_version: snapTpl.version,
    template_snapshot: {
      id: snapTpl.id,
      name: snapTpl.name,
      version: snapTpl.version,
      subject: snapTpl.subject,
      html_content: snapTpl.html_content,
      text_content: snapTpl.text_content,
    },
    status: 'completed',
    total_recipients: 1,
    sent_count: 1,
    failed_count: 0,
    pending_count: 0,
    created_at: new Date().toISOString(),
  });
  testDb._store.campaign_recipients.push({
    id: histRecipId,
    campaign_id: histCampId,
    recipient_name: 'Alumni User',
    recipient_email: 'alumni@snpsu.edu.in',
    status: 'sent',
    attempt_count: 1,
    created_at: new Date().toISOString(),
  });
  testDb._store.email_attempts.push({
    id: histAttemptId,
    campaign_id: histCampId,
    recipient_id: histRecipId,
    attempt_number: 1,
    status: 'sent',
    created_at: new Date().toISOString(),
  });

  const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${snapTpl.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(delRes.status, 200);
  const json = await delRes.json();
  assert.equal(json.data.detached_campaigns, 1);

  const preservedCamp = testDb._store.campaigns.find((c) => c.id === histCampId);
  assert.ok(preservedCamp, 'Historical campaign row must NOT be cascade deleted');
  assert.equal(preservedCamp.template_id, null, 'campaigns.template_id must be detached to NULL');
  assert.ok(preservedCamp.template_snapshot?.html_content?.includes('snapshotted HTML notice'));
  assert.ok(testDb._store.campaign_recipients.find((r) => r.id === histRecipId), 'Recipients must stay intact');
  assert.ok(testDb._store.email_attempts.find((a) => a.id === histAttemptId), 'Attempts must stay intact');
});

// 29. Live Unsnapshotted Campaign Blocks Deletion (HTTP 409)
await test('29. Blocks permanent delete with HTTP 409 when campaign lacks complete template_snapshot', async () => {
  const blockedTpl = await templateRepo.createTemplate({
    name: 'Active Dependency Protected Template',
    category: 'Account Alerts',
    subject: 'Account Verification Needed',
    html_content: '<p>Verify now {{recipient_name}}</p>',
    text_content: 'Verify now {{recipient_name}}',
    userId: mockAdminUser.id,
  });

  const liveCampId = 'c9000000-0000-4000-8000-000000000002';
  testDb._store.campaigns.push({
    id: liveCampId,
    campaign_name: 'Legacy Unsnapshotted Campaign',
    campaign_type: 'bulk',
    subject: blockedTpl.subject,
    template_id: blockedTpl.id,
    template_version: 1,
    template_snapshot: null,
    status: 'queued',
    total_recipients: 1,
    pending_count: 1,
    created_at: new Date().toISOString(),
  });

  const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${blockedTpl.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer demo-admin-token' },
  });
  assert.equal(delRes.status, 409);
  const json = await delRes.json();
  assert.equal(json.error.code, 'TEMPLATE_IN_USE_WITHOUT_SNAPSHOT');
  assert.ok(await templateRepo.getTemplateById(blockedTpl.id), 'Blocked template must remain in DB');
  assert.ok(testDb._store.campaigns.find((c) => c.id === liveCampId), 'Campaign must stay untouched');
});

// 30. HTML Sanitizer Inline Style + XSS Hardening Verification (sanitize-html@^2.18.2)
await test('30. Sanitizer strips inline CSS url(javascript:...) and XSS payloads while preserving table layout', async () => {
  const dirtyHtml = `
    <table style="width:100%;background-color:#FFFFFF">
      <tr><td style="padding:20px;background:url(javascript:alert(1));color:#172E58">
        <p style="font-size:14px;expression(alert(1))">Official Text</p>
        <noscript><img src="x" onerror="alert(1)"></noscript>
        <meta http-equiv="refresh" content="0;url=javascript:alert(1)">
        <svg><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>
        <a href="javascript:alert(1)" onclick="steal()">Evil</a>
        <a href="https://snpsunexus.edu.in">Valid Link</a>
      </td></tr>
    </table>
  `;
  const validated = validateAndSanitizeTemplate({
    name: 'Deep Sanitizer Security Template',
    subject: 'Security Check',
    html_content: dirtyHtml,
  });
  assert.ok(validated.html_content.includes('<table'));
  assert.ok(validated.html_content.includes('color:#172E58'));
  assert.ok(validated.html_content.includes('https://snpsunexus.edu.in'));
  assert.ok(!validated.html_content.includes('javascript:'));
  assert.ok(!validated.html_content.includes('expression('));
  assert.ok(!validated.html_content.includes('<noscript'));
  assert.ok(!validated.html_content.includes('<meta'));
  assert.ok(!validated.html_content.includes('<animate'));
  assert.ok(!validated.html_content.includes('onclick'));
});

// 31. PGRST202 Repository Fallback Path Safety Check
await test('31. PGRST202 fallback path preserves snapshotted campaigns and removes template safely', async () => {
  const fallbackTpl = await templateRepo.createTemplate({
    name: 'Fallback Delete Path Template',
    category: 'Notifications',
    subject: 'Fallback Notice',
    html_content: '<p>Fallback content for {{recipient_name}}</p>',
    text_content: 'Fallback content for {{recipient_name}}',
    userId: mockAdminUser.id,
  });

  const rpcOnlyMissingDb = {
    from: (...args) => testDb.from(...args),
    auth: testDb.auth,
    _store: testDb._store,
    rpc: async (fnName, params) => {
      if (fnName === 'delete_email_template_permanently') {
        return { data: null, error: { code: 'PGRST202', message: 'Function not found in schema cache' } };
      }
      return testDb.rpc(fnName, params);
    },
  };

  setTestSupabaseClient(rpcOnlyMissingDb);
  try {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates/${fallbackTpl.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer demo-admin-token' },
    });
    assert.equal(res.status, 200);
    assert.equal(await templateRepo.getTemplateById(fallbackTpl.id), null);
  } finally {
    setTestSupabaseClient(testDb);
  }
});

// 32. Foreign-Key Resolution: auth.users.id Maps Cleanly to public.admin_users.id
await test('32. POST /api/templates resolves auth user_id to admin_users.id for created_by FK integrity', async () => {
  const createdDirect = await templateRepo.createTemplate({
    name: 'Direct AuthId FK Check',
    category: 'Notifications',
    subject: 'Direct Check',
    html_content: '<p>Hello {{recipient_name}}</p>',
    text_content: 'Hello {{recipient_name}}',
    userId: mockAdminUser.id,
  });
  assert.equal(createdDirect.created_by, 'a1000000-0000-4000-8000-000000000001');
  await templateRepo.permanentDeleteTemplate(createdDirect.id, mockAdminUser.id);

  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/templates`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer demo-admin-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'FK Safe Creation Test',
      category: 'Notifications',
      subject: 'Official Notice',
      html_content: '<p>Hello {{recipient_name}}</p>',
      text_content: 'Hello {{recipient_name}}',
    }),
  });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.data.created_by, 'a1000000-0000-4000-8000-000000000001');
  assert.equal(json.data.updated_by, 'a1000000-0000-4000-8000-000000000001');
  const ver = testDb._store.template_versions.find((v) => v.template_id === json.data.id);
  assert.equal(ver?.created_by, 'a1000000-0000-4000-8000-000000000001');
  await templateRepo.permanentDeleteTemplate(json.data.id, mockAdminUser.id);
});

httpServer.closeAllConnections?.();
await new Promise((resolve) => httpServer.close(resolve));
console.log('\n========================================================');
console.log(`Test Execution Finished: ${passed} Passed, ${failed} Failed`);
console.log('========================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`✓ ALL ${passed} TEMPLATE TESTS PASSED SUCCESSFULLY!\n`);
}
