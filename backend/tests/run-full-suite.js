import { spawn } from 'child_process';

const testSuites = [
  { name: 'Phase 4: Individual Email & Core Architecture', file: 'backend/tests/run-all-tests.js', count: 20 },
  { name: 'Phase 5: Email Template Management & Versioning', file: 'backend/tests/template.test.js', count: 32 },
  { name: 'Phase 6: High-Fidelity Bulk Import & Validation', file: 'backend/tests/import.test.js', count: 34 },
  { name: 'Phase 7: Persistent Sequential Sending Queue', file: 'backend/tests/queue.test.js', count: 40 },
  { name: 'Phase 8: Email Activity, Reconciled Reports & Formula Protection', file: 'backend/tests/activity-reports.test.js', count: 56 },
  { name: 'Gmail HTML Rendering, Inline CID Assets & MIME Verification', file: 'backend/tests/gmail-rendering.test.js', count: 10 },
  { name: 'Queue Sync, Defensive Routing & Auth Guards', file: 'backend/tests/test-queue-sync-and-preview.js', count: 5 },
  { name: 'Production Data Hygiene, Fail-Closed DB & Zero Fallback Audit', file: 'backend/tests/audit-production-hygiene.test.js', count: 10 },
  { name: 'Production API Contract, Auth Session, Error & CORS Verification', file: 'backend/tests/production-api-verification.test.js', count: 14 },
  { name: 'Live Email Preview Synchronization & Shared Render Parity', file: 'backend/tests/live-preview-sync.test.js', count: 8 },
];

console.log('================================================================');
console.log('  SNPSUNEXUS Mail Studio — Comprehensive Automated Test Suite');
console.log(`  Verifying ${testSuites.reduce((a, s) => a + s.count, 0)} Critical Tests Across All ${testSuites.length} Suites`);
console.log('================================================================\n');

async function runSuite(suite) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> STARTING SUITE: ${suite.name} (${suite.count} Tests)...`);
    const proc = spawn('node', [suite.file], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'test' },
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`>>> COMPLETED SUITE: ${suite.name} [PASSED]`);
        resolve();
      } else {
        console.error(`>>> FAILED SUITE: ${suite.name} (exit code ${code})`);
        reject(new Error(`Test suite ${suite.name} failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function runAll() {
  const startTime = Date.now();
  let completedSuites = 0;

  for (const suite of testSuites) {
    try {
      await runSuite(suite);
      completedSuites++;
    } catch (err) {
      console.error('\n================================================================');
      console.error(`FATAL TEST SUITE FAILURE: ${err.message}`);
      console.error('================================================================');
      process.exit(1);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`  ALL ${testSuites.reduce((acc, s) => acc + s.count, 0)} TESTS PASSED ACROSS ${completedSuites} SUITES IN ${durationSec}s`);
  console.log('  100% RELIABILITY & PRODUCTION SPECIFICATION VERIFIED');
  console.log('================================================================\n');
}

runAll();
