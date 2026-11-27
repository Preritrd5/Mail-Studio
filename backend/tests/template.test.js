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
    headers: { Authorization: 'Bearer mock-token' },
  });
  const text = await res.text();
  assert.ok(!text.includes(config.gmailAppPassword));
  assert.ok(!text.includes(config.supabaseSecretKey));
});

httpServer.closeAllConnections?.();
await new Promise((resolve) => httpServer.close(resolve));
console.log('\n========================================================');
console.log(`Test Execution Finished: ${passed} Passed, ${failed} Failed`);
console.log('========================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ ALL 20 TEMPLATE TESTS PASSED SUCCESSFULLY!\n');
}
