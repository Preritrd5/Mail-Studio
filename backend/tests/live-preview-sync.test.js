import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { config } from '../src/config/env.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';
import { setSmtpTransporter } from '../src/services/smtpService.js';
import { renderEmailFromTemplate } from '../src/services/templateRenderer.js';
import { executeSendIndividualEmail } from '../src/services/emailService.js';

process.env.NODE_ENV = 'test';
const testDb = createTestSupabaseClient('seeded');
setTestSupabaseClient(testDb);

const server = await new Promise((resolve) => {
  const srv = app.listen(0, () => resolve(srv));
});
const PORT = server.address().port;

const mockAdminUser = {
  id: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
  email: 'admin@snpsu.edu.in',
};

const SEEDED_TPL_ID = 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7';

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
    console.error(`  ${err.message}`);
    failed++;
  }
}

async function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-admin-token',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        });
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

console.log('========================================================');
console.log('  Live Email Preview Sync & Shared Render Parity Suite');
console.log('========================================================');

await test('1. POST /api/templates/preview interpolates draft HTML, subject, and text + strips XSS', async () => {
  const res = await postJson('/api/templates/preview', {
    subject: 'Semester Update for {{recipient_name}}',
    html_content:
      '<h2>Hello {{recipient_name}}</h2><p>Role: {{designation}} | <a href="{{activation_link}}">Portal</a></p><script>alert(1)</script><img src="x" onerror="alert(2)">',
    variables: {
      recipient_name: 'Prerit R D',
      recipient_email: 'prerit@example.com',
      designation: 'Lead Coordinator',
      activation_link: 'https://snpsunexus.vercel.app/exam',
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.rendered_subject, 'Semester Update for Prerit R D');
  assert.ok(res.body.data.rendered_html.includes('Hello Prerit R D'));
  assert.ok(res.body.data.rendered_html.includes('Lead Coordinator'));
  assert.ok(res.body.data.rendered_html.includes('https://snpsunexus.vercel.app/exam'));
  assert.ok(!res.body.data.rendered_html.includes('<script'));
  assert.ok(!res.body.data.rendered_html.includes('onerror'));
  assert.ok(res.body.data.sender_identity.name === config.senderName);
});

await test('2. POST /api/templates/:id/preview honors unsaved draft overrides instead of stale template DB body', async () => {
  const res = await postJson(`/api/templates/${SEEDED_TPL_ID}/preview`, {
    version: 1,
    subject: 'Custom Edited Subject — {{recipient_name}}',
    html_content: '<h1>Live Edited Heading</h1><p>Updated copy for {{recipient_name}} ({{designation}})</p>',
    text_content: 'Updated plain text for {{recipient_name}}',
    variables: {
      recipient_name: 'Ananya S',
      designation: 'Registrar',
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.rendered_subject, 'Custom Edited Subject — Ananya S');
  assert.ok(res.body.data.rendered_html.includes('Live Edited Heading'));
  assert.ok(res.body.data.rendered_html.includes('Updated copy for Ananya S (Registrar)'));
  assert.ok(!res.body.data.rendered_html.includes('Welcome to SNPSUNEXUS'));
  assert.equal(res.body.data.rendered_text, 'Updated plain text for Ananya S');
});

await test('3. POST /api/templates/:id/preview respects explicit empty html_content string', async () => {
  const res = await postJson(`/api/templates/${SEEDED_TPL_ID}/preview`, {
    subject: 'Plain Text Only Subject',
    html_content: '',
    text_content: 'Pure plain text body for {{recipient_name}}',
    variables: { recipient_name: 'Kiran Rao' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.rendered_html, '');
  assert.equal(res.body.data.rendered_text, 'Pure plain text body for Kiran Rao');
});

await test('4. POST /api/templates/preview surfaces unsupported and unresolved placeholder warnings', async () => {
  const res = await postJson('/api/templates/preview', {
    subject: 'Hello {{recipient_name}} {{non_existent_token}}',
    html_content: '<p>Testing {{bad_placeholder}}</p>',
    variables: { recipient_name: 'Vikram' },
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.data.unsupported_placeholders.includes('{{non_existent_token}}'));
  assert.ok(res.body.data.unsupported_placeholders.includes('{{bad_placeholder}}'));
  assert.ok(res.body.data.unresolved_placeholders.includes('{{bad_placeholder}}'));
});

await test('5. renderEmailFromTemplate prioritizes admin htmlOverride over stored template HTML while preserving version traceability', async () => {
  const rendered = await renderEmailFromTemplate({
    templateId: SEEDED_TPL_ID,
    templateVersion: 1,
    subjectOverride: 'Edited Notification for {{recipient_name}}',
    htmlOverride: '<div><h2>Approved Live Notice</h2><p>Dear {{recipient_name}}, Dept: {{designation}}</p></div>',
    textOverride: 'Approved Live Notice for {{recipient_name}}',
    recipientData: {
      recipient_name: 'Neha Verma',
      recipient_email: 'neha@example.com',
      designation: 'Dean',
    },
    requireHtml: true,
    strict: true,
  });

  assert.equal(rendered.templateId, SEEDED_TPL_ID);
  assert.equal(rendered.templateVersion, 1);
  assert.equal(rendered.renderedSubject, 'Edited Notification for Neha Verma');
  assert.ok(rendered.renderedHtml.includes('Approved Live Notice'));
  assert.ok(rendered.renderedHtml.includes('Dear Neha Verma, Dept: Dean'));
  assert.ok(!rendered.renderedHtml.includes('Welcome to SNPSUNEXUS'));
  assert.ok(rendered.templateSnapshot.html_content.includes('Approved Live Notice'));
});

await test('6. executeSendIndividualEmail transmits exact edited HTML and subject to SMTP instead of reverting to stale DB HTML', async () => {
  let capturedMail = null;
  setSmtpTransporter({
    sendMail: async (mailOptions) => {
      capturedMail = mailOptions;
      return { messageId: '<sync-test-123@snpsu.edu.in>', response: '250 2.0.0 OK' };
    },
  });

  const res = await executeSendIndividualEmail(
    {
      idempotency_key: `sync_test_send_${Date.now()}`,
      template_id: SEEDED_TPL_ID,
      template_version: 1,
      recipient_name: 'Prerit R D',
      recipient_email: 'prerit@example.com',
      designation: 'Academic Chair',
      activation_link: 'https://snpsunexus.vercel.app/portal',
      raw_subject: 'Live Edited Dispatch — {{recipient_name}}',
      subject: 'Live Edited Dispatch — Prerit R D',
      html_content:
        '<div><h2>Urgent Circular</h2><p>Hello {{recipient_name}}, your role is {{designation}}.</p><a href="{{activation_link}}">Open Portal</a></div>',
      text_content: 'Urgent Circular: Hello {{recipient_name}}, role {{designation}}.',
    },
    mockAdminUser
  );

  assert.equal(res.statusCode, 200);
  assert.ok(capturedMail, 'SMTP sendMail must receive MIME message');
  assert.equal(capturedMail.subject, 'Live Edited Dispatch — Prerit R D');
  assert.ok(capturedMail.html.includes('Urgent Circular'));
  assert.ok(capturedMail.html.includes('Hello Prerit R D, your role is Academic Chair.'));
  assert.ok(capturedMail.html.includes('https://snpsunexus.vercel.app/portal'));
  assert.ok(!capturedMail.html.includes('Welcome to SNPSUNEXUS'));
  assert.ok(capturedMail.text.includes('Urgent Circular: Hello Prerit R D, role Academic Chair.'));

  setSmtpTransporter(null);
});

await test('7. GET /api/system/status exposes configured sender email/name without credential leakage', async () => {
  const unauthRes = await new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}/api/system/status`, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode }));
      })
      .on('error', reject);
  });
  assert.equal(unauthRes.status, 401);

  const statusRes = await new Promise((resolve, reject) => {
    http
      .get(
        `http://127.0.0.1:${PORT}/api/system/status`,
        { headers: { Authorization: 'Bearer demo-admin-token' } },
        (res) => {
          let raw = '';
          res.on('data', (c) => {
            raw += c;
          });
          res.on('end', () => resolve({ status: res.statusCode, raw, body: JSON.parse(raw) }));
        }
      )
      .on('error', reject);
  });

  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.data.smtp.sender_name, config.senderName);
  assert.ok('sender_email' in statusRes.body.data.smtp);
  if (config.gmailAppPassword) {
    assert.ok(!statusRes.raw.includes(config.gmailAppPassword));
  }
});

await test('8. renderEmailFromTemplate strictly rejects unsupported {{tokens}} inside edited htmlOverride', async () => {
  await assert.rejects(
    async () =>
      renderEmailFromTemplate({
        templateId: SEEDED_TPL_ID,
        templateVersion: 1,
        subjectOverride: 'Valid Subject',
        htmlOverride: '<p>Hello {{recipient_name}}, unknown {{unregistered_var}}</p>',
        recipientData: { recipient_name: 'Aarav', recipient_email: 'aarav@example.com' },
        requireHtml: true,
        strict: true,
      }),
    (err) => err.statusCode === 422
  );
});

await test('9. Normalizes inline Hello greeting into separate <p>Hello <strong>Name</strong>,</p> and message body <p> without duplicating greetings', async () => {
  const previewRes = await postJson('/api/templates/preview', {
    subject: 'Welcome to SNPSU Nexus',
    html_content:
      '<p>Hello {{recipient_name}}, 🚀 Welcome to SNPSU Nexus! SNPSU Nexus is a student-focused learning platform.</p>',
    text_content:
      'Hello {{recipient_name}}, 🚀 Welcome to SNPSU Nexus! SNPSU Nexus is a student-focused learning platform.',
    variables: { recipient_name: 'Adarsh' },
  });

  assert.equal(previewRes.status, 200);
  const html = previewRes.body.data.rendered_html;
  assert.ok(html.includes('>Hello <strong>Adarsh</strong>,</p>'));
  assert.ok(html.includes('>🚀 Welcome to SNPSU Nexus! SNPSU Nexus is a student-focused learning platform.</p>'));
  assert.equal((html.match(/Hello/g) || []).length, 1, 'Must never duplicate existing greeting');
  assert.equal(
    previewRes.body.data.rendered_text,
    'Hello Adarsh,\n\n🚀 Welcome to SNPSU Nexus! SNPSU Nexus is a student-focused learning platform.'
  );
});

await test('10. Handles missing recipient_name gracefully in preview without unresolved placeholders', async () => {
  const previewRes = await postJson('/api/templates/preview', {
    subject: 'Welcome',
    html_content: '<p>Hello {{recipient_name}}, 🚀 Welcome to SNPSU Nexus!</p>',
    variables: { recipient_name: '' },
  });

  assert.equal(previewRes.status, 200);
  assert.ok(!previewRes.body.data.rendered_html.includes('{{recipient_name}}'));
  assert.ok(previewRes.body.data.rendered_html.includes('>🚀 Welcome to SNPSU Nexus!</p>'));
});

server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));
console.log('========================================================');
console.log(`Live Preview Sync Suite Finished: ${passed} Passed, ${failed} Failed`);
console.log('========================================================');

if (failed > 0) {
  process.exit(1);
}
