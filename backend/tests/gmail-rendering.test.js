import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { config } from '../src/config/env.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';
import { executeSendIndividualEmail } from '../src/services/emailService.js';
import { setSmtpTransporter, prepareOutgoingHtmlAndAssets, sendEmailViaSmtp } from '../src/services/smtpService.js';
import { renderEmailFromTemplate, renderTemplateText, renderTemplateHtml } from '../src/services/templateRenderer.js';
import { PREMIUM_NOTIFICATION_CARD_TEMPLATE } from './fixtures/brandedTemplate.js';
import * as templateRepo from '../src/repositories/templateRepository.js';
import { ActivityRepository } from '../src/repositories/activityRepository.js';

process.env.NODE_ENV = 'test';
const testClient = createTestSupabaseClient('seeded');
// Ensure fixture store matches the exact v1 card template tested in this suite
testClient._store.email_templates = testClient._store.email_templates.filter(
  (t) => t.id !== PREMIUM_NOTIFICATION_CARD_TEMPLATE.id
);
testClient._store.template_versions = testClient._store.template_versions.filter(
  (tv) => tv.template_id !== PREMIUM_NOTIFICATION_CARD_TEMPLATE.id
);
testClient._store.email_templates.push({
  ...PREMIUM_NOTIFICATION_CARD_TEMPLATE,
  version: 1,
  is_active: true,
  archived_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
testClient._store.template_versions.push({
  id: 'tv-premium-fixture-1',
  template_id: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
  version: 1,
  name: PREMIUM_NOTIFICATION_CARD_TEMPLATE.name,
  description: PREMIUM_NOTIFICATION_CARD_TEMPLATE.description,
  category: PREMIUM_NOTIFICATION_CARD_TEMPLATE.category,
  subject: PREMIUM_NOTIFICATION_CARD_TEMPLATE.subject,
  html_content: PREMIUM_NOTIFICATION_CARD_TEMPLATE.html_content,
  text_content: PREMIUM_NOTIFICATION_CARD_TEMPLATE.text_content,
  created_at: new Date().toISOString(),
  change_summary: 'Fixture baseline for MIME verification',
});
setTestSupabaseClient(testClient);

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
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

const mockAdmin = {
  id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
  email: 'admin@snpsunexus.in',
  user_metadata: { role: 'administrator' },
};

console.log('========================================================');
console.log('  SNPSUNEXUS Mail Studio — Gmail HTML & MIME Test Suite');
console.log('========================================================\n');

// 1. Sender identity configured strictly as SNPSUNEXUS
await runTest('1. Sender identity is strictly "SNPSUNEXUS"', async () => {
  assert.equal(config.senderName, 'SNPSUNEXUS');
});

// 2. HTML template selection & exact saved version loaded
await runTest('2. Loads exact persisted template ID and version v1', async () => {
  const tpl = await templateRepo.getTemplateByIdAndVersion(PREMIUM_NOTIFICATION_CARD_TEMPLATE.id, 1);
  assert.ok(tpl);
  assert.equal(tpl.id, PREMIUM_NOTIFICATION_CARD_TEMPLATE.id);
  assert.equal(tpl.version, 1);
  assert.ok(tpl.html_content.includes('Official Semester Examination Admit Card'));
});

// 3. Shared renderer resolves subject placeholders cleanly
await runTest('3. Subject placeholder {{recipient_name}} resolved without literal token', async () => {
  const rendered = await renderEmailFromTemplate({
    templateId: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
    templateVersion: 1,
    recipientData: {
      recipient_name: 'Arjun Sharma',
      recipient_email: 'arjun.sharma@snpsunexus.in',
      designation: 'Undergraduate Scholar (B.Tech CSE)',
      activation_link: 'https://snpsunexus.in/exam/admit-card',
    },
  });
  assert.ok(!rendered.renderedSubject.includes('{{'));
  assert.ok(rendered.renderedSubject.includes('Arjun Sharma'));
  assert.equal(
    rendered.renderedSubject,
    'Official Semester Examination Admit Card & Schedule (v1) — Arjun Sharma'
  );
});

// 4. Shared renderer generates full HTML card & clean plain text without === bars
await runTest('4. Renders full HTML card and clean plain-text fallback', async () => {
  const rendered = await renderEmailFromTemplate({
    templateId: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
    templateVersion: 1,
    recipientData: {
      recipient_name: 'Arjun Sharma',
      recipient_email: 'arjun.sharma@snpsunexus.in',
      designation: 'Undergraduate Scholar',
      activation_link: 'https://snpsunexus.in/exam/admit-card',
    },
  });
  assert.ok(rendered.renderedHtml.includes('<!DOCTYPE html>'));
  assert.ok(rendered.renderedHtml.includes('<table'));
  assert.ok(rendered.renderedHtml.includes('Arjun Sharma'));
  assert.ok(rendered.renderedHtml.includes('arjun.sharma@snpsunexus.in'));
  assert.ok(rendered.renderedHtml.includes('https://snpsunexus.in/exam/admit-card'));
  assert.ok(!rendered.renderedHtml.includes('<title>'));
  assert.ok(!rendered.renderedText.includes('===='));
  assert.ok(rendered.renderedText.includes('Arjun Sharma'));
});

// 5. HTML sanitizer preserves layout while rejecting scripts, iframes, and unsafe URLs
await runTest('5. HTML sanitization keeps table layout and strips XSS / unsafe URLs', async () => {
  const unsafeInput = '<table width="100%"><tr><td><script>alert(1)</script><iframe src="https://evil.com"></iframe><p>Safe Content {{recipient_name}}</p><a href="{{activation_link}}">Link</a></td></tr></table>';
  const renderedHtml = renderTemplateHtml(unsafeInput, {
    recipient_name: 'Test User',
    activation_link: 'javascript:alert(99)',
  });
  assert.ok(!renderedHtml.includes('<script'));
  assert.ok(!renderedHtml.includes('<iframe'));
  assert.ok(!renderedHtml.includes('javascript:'));
  assert.ok(renderedHtml.includes('width="100%"'));
  assert.ok(renderedHtml.includes('Safe Content Test User'));
});

// 6. Official logo rewritten to verified public HTTPS asset with zero downloadable attachments
await runTest('6. Official logo resolved to verified HTTPS asset without attachment parts', async () => {
  const prepared = prepareOutgoingHtmlAndAssets(
    '<img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" /><img src="http://localhost:5173/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" />'
  );
  assert.equal(prepared.hasInlineLogo, true);
  assert.equal(prepared.logoDeliveryMode, 'public_https');
  assert.ok(prepared.html.includes('src="https://emaildraft.vercel.app/assets/snpsunexus-logo.png"'));
  assert.ok(!prepared.html.includes('/assets/snpsunexus-logo.png"') || prepared.html.includes('https://emaildraft.vercel.app/assets/snpsunexus-logo.png'));
  assert.ok(!prepared.html.includes('http://localhost'));
  assert.ok(!prepared.html.includes('cid:snpsunexus-logo@snpsunexus'));
  assert.equal(prepared.attachments.length, 0);
});

// 7. Actual MIME stream inspection via Nodemailer streamTransport
await runTest('7. Actual MIME structure contains From: SNPSUNEXUS, text/html, text/plain, and zero attachment parts', async () => {
  const streamTransporter = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
  setSmtpTransporter(streamTransporter);

  const rendered = await renderEmailFromTemplate({
    templateId: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
    templateVersion: 1,
    recipientData: {
      recipient_name: 'Arjun Sharma',
      recipient_email: 'arjun.sharma@snpsunexus.in',
      designation: 'Undergraduate Scholar (B.Tech CSE)',
      activation_link: 'https://snpsunexus.in/exam/admit-card',
    },
  });

  const info = await streamTransporter.sendMail({
    from: `"${config.senderName}" <${config.gmailUser}>`,
    to: '"Arjun Sharma" <arjun.sharma@snpsunexus.in>',
    subject: rendered.renderedSubject,
    text: rendered.renderedText,
    ...(() => {
      const a = prepareOutgoingHtmlAndAssets(rendered.renderedHtml);
      return { html: a.html, attachments: a.attachments };
    })(),
  });

  const rawMime = info.message.toString('utf8');
  const decodedMime = rawMime.replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
  assert.ok(rawMime.includes('From: SNPSUNEXUS <'), 'MIME From header must say SNPSUNEXUS');
  assert.ok(!rawMime.includes('SNPSUNEXUS Mail Studio'), 'MIME From must not say SNPSUNEXUS Mail Studio');
  assert.ok(rawMime.includes('Subject: =?UTF-8?') || rawMime.includes('Subject: Official Semester Examination Admit Card'));
  assert.ok(rawMime.includes('Content-Type: text/plain'));
  assert.ok(rawMime.includes('Content-Type: text/html'));
  assert.ok(decodedMime.includes('https://emaildraft.vercel.app/assets/snpsunexus-logo.png'));
  assert.ok(!decodedMime.includes('Content-Disposition: attachment'), 'Must never attach logo as a downloadable attachment');
  assert.ok(!decodedMime.includes('Content-Disposition: inline; filename=snpsunexus-logo.png'), 'Must not attach binary image filename triggering Gmail inbox pill');
  assert.ok(!decodedMime.includes('http://localhost'));
});

// 8. Missing template version throws explicit error (No silent fallback)
await runTest('8. Missing template or missing version rejects loudly without silent fallback', async () => {
  await assert.rejects(
    async () => renderEmailFromTemplate({
      templateId: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
      templateVersion: 999,
      recipientData: { recipient_name: 'Arjun', recipient_email: 'a@b.com' },
    }),
    (err) => err.code === 'TEMPLATE_VERSION_NOT_FOUND'
  );

  await assert.rejects(
    async () => renderEmailFromTemplate({
      templateId: null,
      htmlOverride: '',
      textOverride: 'Only text here',
      recipientData: { recipient_name: 'Arjun', recipient_email: 'a@b.com' },
      requireHtml: true,
    }),
    (err) => err.code === 'MISSING_HTML_CONTENT'
  );
});

// 9. Unresolved placeholder token rejected strictly before SMTP dispatch
await runTest('9. Rejects unresolved placeholders before sending', async () => {
  await assert.rejects(
    async () => renderTemplateText('Hello {{unknown_missing_field}}', {}, { strict: true }),
    (err) => err.code === 'UNRESOLVED_PLACEHOLDERS'
  );
  await assert.rejects(
    async () => renderTemplateHtml('<p>{{unknown_missing_field}}</p>', {}, { strict: true }),
    (err) => err.code === 'UNRESOLVED_PLACEHOLDERS'
  );
});

// 10. End-to-end executeSendIndividualEmail with mock transporter + Activity sync + Idempotency
await runTest('10. End-to-end individual send renders template, enforces idempotency, and updates Activity ledger', async () => {
  let capturedMail = null;
  setSmtpTransporter({
    verify: async () => true,
    sendMail: async (mailOptions) => {
      capturedMail = mailOptions;
      return { messageId: '<e2e-test-msg@snpsunexus>', response: '250 2.0.0 OK' };
    },
  });

  const idemKey = `test_html_e2e_${Date.now()}`;
  const res = await executeSendIndividualEmail({
    template_id: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
    template_version: 1,
    recipient_name: 'Arjun Sharma',
    recipient_email: 'arjun.sharma@snpsunexus.in',
    designation: 'Scholar',
    activation_link: 'https://snpsunexus.in/exam/admit-card',
    raw_subject: 'Official Notification — {{recipient_name}}',
    subject: 'Official Notification — {{recipient_name}}',
    idempotency_key: idemKey,
  }, mockAdmin);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.template_id, PREMIUM_NOTIFICATION_CARD_TEMPLATE.id);
  assert.equal(res.body.data.template_version, 1);
  assert.equal(res.body.data.rendered_subject, 'Official Notification — Arjun Sharma');
  assert.ok(capturedMail);
  assert.ok(capturedMail.from.startsWith('"SNPSUNEXUS"'));
  assert.equal(capturedMail.subject, 'Official Notification — Arjun Sharma');
  assert.ok(capturedMail.html.includes('https://emaildraft.vercel.app/assets/snpsunexus-logo.png'));
  assert.ok(!capturedMail.html.includes('cid:snpsunexus-logo@snpsunexus'));
  assert.ok(!capturedMail.html.includes('http://localhost'));
  assert.ok(capturedMail.html.includes('Official Semester Examination Admit Card'));
  assert.ok(capturedMail.text.includes('Arjun Sharma'));
  assert.equal(capturedMail.attachments?.length || 0, 0);

  // Verify Activity ledger shows this send
  const actRepo = new ActivityRepository();
  const actList = await actRepo.getActivityList({ search: 'arjun.sharma@snpsunexus.in' });
  assert.ok(actList.items.some((it) => it.recipient_id === res.body.data.recipient_id || it.recipient_email === 'arjun.sharma@snpsunexus.in'));

  // Verify duplicate idempotency key replay
  const replay = await executeSendIndividualEmail({
    template_id: PREMIUM_NOTIFICATION_CARD_TEMPLATE.id,
    template_version: 1,
    recipient_name: 'Arjun Sharma',
    recipient_email: 'arjun.sharma@snpsunexus.in',
    designation: 'Scholar',
    activation_link: 'https://snpsunexus.in/exam/admit-card',
    raw_subject: 'Official Notification — {{recipient_name}}',
    subject: 'Official Notification — {{recipient_name}}',
    idempotency_key: idemKey,
  }, mockAdmin);
  assert.equal(replay.body.is_idempotent_replay, true);
});

console.log('\n========================================================');
console.log(`  Gmail Rendering & MIME Suite Complete: ${passed} Passed, ${failed} Failed`);
console.log('========================================================');
if (failed > 0) process.exit(1);
process.exit(0);
