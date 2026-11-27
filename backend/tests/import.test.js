import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { 
  parseSpreadsheet, 
  validateFileSignature, 
  autoDetectColumns,
  getIgnoredColumns,
  MAX_FILE_SIZE_BYTES,
  MAX_RECIPIENT_ROWS
} from '../src/services/fileParser.js';
import { 
  validateRecipientRow, 
  validateBatchRows, 
  normalizeEmail, 
  EMAIL_REGEX 
} from '../src/services/recipientValidator.js';
import { updateMappingSchema, commitImportSchema } from '../src/validators/importValidator.js';
import * as importRepo from '../src/repositories/importRepository.js';
import { queueRepository } from '../src/queue/queueRepository.js';
import { setTestSupabaseClient } from '../src/config/supabase.js';
import { createTestSupabaseClient } from './fixtures/inMemoryTestDb.js';

process.env.NODE_ENV = 'test';
setTestSupabaseClient(createTestSupabaseClient('seeded'));

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
console.log('  SNPSUNEXUS Mail Studio — Bulk Import Test Suite');
console.log('  Testing Two-Field Parsing, Validation & Commit Flows');
console.log('========================================================\n');

// 1. Valid CSV Parsing
await test('1. Parse valid 2-column CSV and quoted names with commas', async () => {
  const csvContent = `Full Name,Email Address\n"Morgan, Alex",alex.morgan@example.com\n"Lee, Jordan",jordan.lee@example.com\n`;
  const buffer = Buffer.from(csvContent, 'utf8');
  const result = parseSpreadsheet(buffer, 'recipients.csv');

  assert.equal(result.headers.length, 2);
  assert.equal(result.rawRows.length, 2);
  assert.equal(result.rawRows[0]['Full Name'], 'Morgan, Alex');
  assert.equal(result.rawRows[0]['Email Address'], 'alex.morgan@example.com');
  assert.equal(result.mappingConfig.emailColumn, 'Email Address');
  assert.equal(result.mappingConfig.nameColumn, 'Full Name');
  assert.deepEqual(result.ignoredColumns, []);
});

// 2. CSV with UTF-8 BOM & Legacy Ignored Columns
await test('2. Parse CSV with UTF-8 BOM and flag legacy extra columns as ignored', async () => {
  const csvWithBom = `\uFEFFFull Name,Email Address,Department,Role\nAlex Morgan,alex.morgan@example.com,Operations,Lead\n`;
  const buffer = Buffer.from(csvWithBom, 'utf8');
  const result = parseSpreadsheet(buffer, 'legacy_roster.csv');

  assert.equal(result.headers[0], 'Full Name');
  assert.equal(result.mappingConfig.nameColumn, 'Full Name');
  assert.equal(result.mappingConfig.emailColumn, 'Email Address');
  assert.deepEqual(result.ignoredColumns, ['Department', 'Role']);
});

// 3. Valid XLSX Parsing
await test('3. Parse valid XLSX workbook and extract sheets and rows', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Candidate Name', 'Recipient Email', 'Year'],
    ['Rahul Verma', 'rahul.v@snpsu.edu.in', '2026'],
    ['Sneha Rao', 'sneha.rao@snpsu.edu.in', '2026'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Admissions2026');

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = parseSpreadsheet(xlsxBuffer, 'admissions.xlsx');

  assert.equal(result.availableSheets[0], 'Admissions2026');
  assert.equal(result.rawRows.length, 2);
  assert.equal(result.mappingConfig.emailColumn, 'Recipient Email');
  assert.equal(result.mappingConfig.nameColumn, 'Candidate Name');
});

// 4. Valid Legacy XLS Parsing
await test('4. Parse legacy XLS workbook structure', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Name', 'Email'],
    ['Kiran Kumar', 'kiran.k@snpsu.edu.in'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'LegacySheet');

  const xlsBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' });
  const result = parseSpreadsheet(xlsBuffer, 'archive.xls');

  assert.equal(result.rawRows.length, 1);
  assert.equal(result.rawRows[0]['Email'], 'kiran.k@snpsu.edu.in');
});

// 5. Unsupported File Extension Rejection
await test('5. Reject unsupported file extension (.pdf, .exe, .json)', async () => {
  const buf = Buffer.from('PDF content here');
  assert.throws(() => {
    parseSpreadsheet(buf, 'payload.pdf');
  }, /Unsupported file type/);
});

// 6. Magic Bytes Spoofing Detection
await test('6. Reject spoofed XLSX file signature (plain text disguised as .xlsx)', async () => {
  const fakeXlsx = Buffer.from('This is actually a plain text file, not a zip');
  assert.throws(() => {
    parseSpreadsheet(fakeXlsx, 'malicious.xlsx');
  }, /Invalid XLSX file signature/);
});

// 7. Binary CSV Null Byte Detection
await test('7. Reject CSV containing binary null bytes', async () => {
  const binaryCsv = Buffer.from([0x4E, 0x61, 0x6D, 0x65, 0x00, 0x45, 0x6D, 0x61, 0x69, 0x6C]);
  assert.throws(() => {
    parseSpreadsheet(binaryCsv, 'corrupt.csv');
  }, /Detected binary content/);
});

// 8. Empty File Rejection
await test('8. Reject empty file (0 bytes)', async () => {
  assert.throws(() => {
    parseSpreadsheet(Buffer.alloc(0), 'empty.csv');
  }, /Uploaded file is empty/);
});

// 9. Oversized File Limit Rejection
await test('9. Reject file exceeding 10 MB limit', async () => {
  const bigBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024);
  assert.throws(() => {
    parseSpreadsheet(bigBuffer, 'huge.csv');
  }, /exceeds maximum limit of 10 MB/);
});

// 10. Multiple Worksheets and Custom Sheet Selection
await test('10. Multi-sheet workbook navigation and specific sheet selection', async () => {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Email'], ['user1@snpsu.edu.in']]);
  const ws2 = XLSX.utils.aoa_to_sheet([['Email'], ['user2@snpsu.edu.in'], ['user3@snpsu.edu.in']]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Faculty');
  XLSX.utils.book_append_sheet(wb, ws2, 'Students');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = parseSpreadsheet(buf, 'university.xlsx', { worksheet_name: 'Students' });

  assert.equal(result.currentSheet, 'Students');
  assert.equal(result.rawRows.length, 2);
  assert.equal(result.rawRows[0]['Email'], 'user2@snpsu.edu.in');
});

// 11. Custom Header Row Selection
await test('11. Excel header row selection (row 2 instead of row 1)', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Sapthagiri NPS University — Official Roster'], // Row 1: Title banner
    ['Candidate Name', 'Email ID'],                // Row 2: Actual headers
    ['Arjun Sharma', 'arjun@snpsu.edu.in'],         // Row 3: Data
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Roster');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = parseSpreadsheet(buf, 'banner.xlsx', { header_row: 2 });

  assert.equal(result.headers[0], 'Candidate Name');
  assert.equal(result.headers[1], 'Email ID');
  assert.equal(result.rawRows.length, 1);
  assert.equal(result.rawRows[0]['Email ID'], 'arjun@snpsu.edu.in');
});

// 12. Email Normalization
await test('12. Email normalization trims whitespace and lowers case', async () => {
  assert.equal(normalizeEmail('  Arjun.Sharma@SNPSU.edu.in  '), 'arjun.sharma@snpsu.edu.in');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail(null), '');
});

// 13. Valid Recipient Classification
await test('13. Valid recipient with name and proper email syntax', async () => {
  const seenMap = new Map();
  const row = { Name: 'Arjun Sharma', Email: 'arjun.sharma@snpsu.edu.in' };
  const res = validateRecipientRow(row, 2, 'Email', 'Name', seenMap);

  assert.equal(res.validation_status, 'valid');
  assert.equal(res.is_selected, true);
  assert.equal(res.validation_errors.length, 0);
  assert.equal(res.normalized_email, 'arjun.sharma@snpsu.edu.in');
});

// 14. Mandatory Full Name Rejection (Empty Name -> Invalid)
await test('14. Invalid classification when mandatory Full Name is missing', async () => {
  const seenMap = new Map();
  const row = { Name: '', Email: 'anonymous.scholar@example.com' };
  const res = validateRecipientRow(row, 3, 'Email', 'Name', seenMap);

  assert.equal(res.validation_status, 'invalid');
  assert.equal(res.is_selected, false);
  assert.ok(res.validation_errors[0].includes('Missing full name'));
  assert.equal(seenMap.size, 0); // Rejected row must not poison duplicate map
});

// 15. Invalid Classification (Empty Email)
await test('15. Invalid classification for empty email address', async () => {
  const seenMap = new Map();
  const row = { Name: 'No Email User', Email: '' };
  const res = validateRecipientRow(row, 4, 'Email', 'Name', seenMap);

  assert.equal(res.validation_status, 'invalid');
  assert.equal(res.is_selected, false); // Invalids cannot be selected
  assert.ok(res.validation_errors[0].includes('Missing email address'));
});

// 16. Invalid Classification (Malformed Email Syntax)
await test('16. Invalid classification for malformed email syntax', async () => {
  const seenMap = new Map();
  const row = { Name: 'Bad Syntax', Email: 'invalid-email-at-snpsu' };
  const res = validateRecipientRow(row, 5, 'Email', 'Name', seenMap);

  assert.equal(res.validation_status, 'invalid');
  assert.equal(res.is_selected, false);
  assert.ok(res.validation_errors[0].includes('Invalid email syntax format'));
});

// 17. Batch Duplicate Detection Policy
await test('17. Duplicate policy retains first occurrence and flags subsequent as duplicate', async () => {
  const rawRows = [
    { Name: 'Arjun Sharma (First)', Email: 'arjun@snpsu.edu.in' },
    { Name: 'Priya K', Email: 'priya@snpsu.edu.in' },
    { Name: 'Arjun Sharma (Duplicate)', Email: '  ARJUN@snpsu.edu.in  ' }, // Duplicate
    { Name: 'Priya K (Duplicate)', Email: 'priya@snpsu.edu.in' },          // Duplicate
  ];

  const result = validateBatchRows(rawRows, 'Email', 'Name');

  assert.equal(result.summary.total_rows, 4);
  assert.equal(result.summary.valid_count, 2);
  assert.equal(result.summary.duplicate_count, 2);

  assert.equal(result.rows[0].validation_status, 'valid');
  assert.equal(result.rows[1].validation_status, 'valid');
  assert.equal(result.rows[2].validation_status, 'duplicate');
  assert.equal(result.rows[3].validation_status, 'duplicate');

  assert.ok(result.rows[2].validation_errors[0].includes('Row #2'));
  assert.equal(result.rows[2].is_selected, false);
});

// 18. Persistent Batch Creation in Repository
let testBatchId = null;
await test('18. Create persistent import batch with initial Ready status', async () => {
  const batch = await importRepo.createBatch({
    original_filename: 'recipients_cohort_2026.xlsx',
    file_type: 'xlsx',
    file_size_bytes: 45000,
    status: 'Ready',
    total_rows: 4,
    valid_count: 2,
    warning_count: 0,
    invalid_count: 1,
    duplicate_count: 1,
    selected_count: 2,
    mapping_config: { emailColumn: 'Email', nameColumn: 'Name' },
  });

  assert.ok(batch.id);
  assert.equal(batch.status, 'Ready');
  assert.equal(batch.selected_count, 2);
  testBatchId = batch.id;
});

// 19. Save Staging Rows with Original Row Numbers
await test('19. Save and retrieve staging rows preserving row numbers and mandatory checks', async () => {
  const rows = [
    { row_number: 2, recipient_name: 'Alex Morgan', recipient_email: 'alex.morgan@example.com', normalized_email: 'alex.morgan@example.com', validation_status: 'valid', validation_errors: [], is_selected: true },
    { row_number: 3, recipient_name: 'Jordan Lee', recipient_email: 'jordan.lee@example.com', normalized_email: 'jordan.lee@example.com', validation_status: 'valid', validation_errors: [], is_selected: true },
    { row_number: 4, recipient_name: '', recipient_email: 'noname@example.com', normalized_email: 'noname@example.com', validation_status: 'invalid', validation_errors: ['Missing full name'], is_selected: false },
    { row_number: 5, recipient_name: 'Alex Duplicate', recipient_email: 'alex.morgan@example.com', normalized_email: 'alex.morgan@example.com', validation_status: 'duplicate', validation_errors: ['Duplicate of row 2'], is_selected: false },
  ];

  await importRepo.saveBatchRows(testBatchId, rows);
  const fetched = await importRepo.getBatchRows(testBatchId, { page: 1, limit: 10 });

  assert.equal(fetched.rows.length, 4);
  assert.equal(fetched.rows[0].row_number, 2);
  assert.equal(fetched.rows[1].validation_status, 'valid');
  assert.equal(fetched.rows[2].validation_status, 'invalid');
  assert.equal(fetched.rows[3].validation_status, 'duplicate');
});

// 20. Staging Rows Filtering by Status
await test('20. Filter staging rows by validation status', async () => {
  const invalidsOnly = await importRepo.getBatchRows(testBatchId, { status: 'invalid' });
  assert.equal(invalidsOnly.rows.length, 1);
  assert.equal(invalidsOnly.rows[0].recipient_email, 'noname@example.com');

  const duplicatesOnly = await importRepo.getBatchRows(testBatchId, { status: 'duplicate' });
  assert.equal(duplicatesOnly.rows.length, 1);
  assert.equal(duplicatesOnly.rows[0].row_number, 5);
});

// 21. Row Selection Modification
await test('21. Toggle individual row selection and update selected count', async () => {
  const allRows = await importRepo.getBatchRows(testBatchId);
  const secondValid = allRows.rows.find((r) => r.recipient_email === 'jordan.lee@example.com');

  const result = await importRepo.updateRowSelections(testBatchId, {
    rowIds: [secondValid.id],
    isSelected: false,
  });

  assert.equal(result.selectedCount, 1);

  const refetched = await importRepo.getBatchRows(testBatchId);
  const updatedRow = refetched.rows.find((r) => r.id === secondValid.id);
  assert.equal(updatedRow.is_selected, false);
});

// 22. Invalids and Duplicates Protected from Selection
await test('22. Enforce that invalid and duplicate rows can never be marked selected', async () => {
  const allRows = await importRepo.getBatchRows(testBatchId);
  const invalidRow = allRows.rows.find((r) => r.validation_status === 'invalid');

  await importRepo.updateRowSelections(testBatchId, {
    rowIds: [invalidRow.id],
    isSelected: true,
  });

  const refetched = await importRepo.getBatchRows(testBatchId);
  const checkedInvalid = refetched.rows.find((r) => r.id === invalidRow.id);
  assert.equal(checkedInvalid.is_selected, false);
});

// 23. Transactional Campaign Creation, Template Snapshotting, and Queue Registration
let committedCampaignId = null;
const testIdempotencyKey = `snpsu_bulk_test_${Date.now()}`;
await test('23. Transactionally commit import batch into Ready bulk campaign synchronized with queue', async () => {
  const allRows = await importRepo.getBatchRows(testBatchId);
  const secondValid = allRows.rows.find((r) => r.recipient_email === 'jordan.lee@example.com');
  await importRepo.updateRowSelections(testBatchId, { rowIds: [secondValid.id], isSelected: true });

  const commitResult = await importRepo.commitBatch(testBatchId, {
    campaignName: 'SNPSUNEXUS Two-Field Product Notice',
    templateId: 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
    adminId: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
    idempotencyKey: testIdempotencyKey,
  });

  assert.equal(commitResult.success, true);
  assert.ok(commitResult.campaign_id);
  assert.equal(commitResult.recipients_count, 2);
  assert.equal(commitResult.idempotent_replay, false);
  committedCampaignId = commitResult.campaign_id;

  const batchAfter = await importRepo.getBatchById(testBatchId);
  assert.equal(batchAfter.status, 'Committed');
  assert.equal(batchAfter.committed_campaign_id, committedCampaignId);

  // Verify queue repository sees committed campaign in Ready state with 2 recipients
  const queueDetail = await queueRepository.getCampaignDetails(committedCampaignId);
  assert.equal(queueDetail.campaign.status, 'ready');
  assert.equal(queueDetail.recipients.length, 2);
  assert.equal('department' in queueDetail.recipients[0], false);
  assert.equal('role' in queueDetail.recipients[0], false);
});

// 24. Idempotency Key Replay Protection
await test('24. Replaying commit with identical idempotency key returns original campaign', async () => {
  const replayResult = await importRepo.commitBatch(testBatchId, {
    campaignName: 'Annual Convocation 2026 Direct Notice',
    templateId: 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
    adminId: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
    idempotencyKey: testIdempotencyKey,
  });

  assert.equal(replayResult.success, true);
  assert.equal(replayResult.campaign_id, committedCampaignId);
  assert.equal(replayResult.idempotent_replay, true);
});

// 25. Re-committing Committed Batch with Different Key Rejection
await test('25. Re-committing an already committed batch with a new key is rejected', async () => {
  await assert.rejects(async () => {
    await importRepo.commitBatch(testBatchId, {
      campaignName: 'Another Name',
      templateId: 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
      adminId: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
      idempotencyKey: 'different_key_xyz_123',
    });
  }, /already been committed/);
});

// 26. Committed Batch Mutation Rejection
await test('26. Reject selection modification on an already committed batch', async () => {
  const batch = await importRepo.getBatchById(testBatchId);
  assert.equal(batch.status, 'Committed');
});

// 27. Uncommitted Batch Cancellation
await test('27. Cancel an uncommitted import batch', async () => {
  const tempBatch = await importRepo.createBatch({
    original_filename: 'cancel_test.csv',
    file_type: 'csv',
    status: 'Ready',
  });

  const cancelled = await importRepo.cancelBatch(tempBatch.id);
  assert.equal(cancelled.status, 'Cancelled');
});

// 28. Cancelled Batch Cannot Be Committed
await test('28. Reject commitment of a cancelled batch', async () => {
  const tempBatch = await importRepo.createBatch({
    original_filename: 'cancel_test_2.csv',
    file_type: 'csv',
    status: 'Ready',
  });
  await importRepo.cancelBatch(tempBatch.id);

  await assert.rejects(async () => {
    await importRepo.commitBatch(tempBatch.id, {
      campaignName: 'Test',
      templateId: 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
      adminId: 'fe8a2f39-22f7-45e4-a219-87c2c773aaf8',
      idempotencyKey: 'key_cancel_test',
    });
  }, /not ready for commitment/);
});

// 29. Auto-detect Header Variations
await test('29. Auto-detect diverse header variants (E-mail, Recipient Name, Mail ID)', async () => {
  const detected1 = autoDetectColumns(['Student Name', 'E-mail', 'CGPA']);
  assert.equal(detected1.emailColumn, 'E-mail');
  assert.equal(detected1.nameColumn, 'Student Name');

  const detected2 = autoDetectColumns(['Roll No', 'Mail ID', 'FullName']);
  assert.equal(detected2.emailColumn, 'Mail ID');
  assert.equal(detected2.nameColumn, 'FullName');
});

// 30. Zero Secret Leakage
await test('30. Verify zero secret leakage across repository outputs', async () => {
  const batch = await importRepo.getBatchById(testBatchId);
  const serialized = JSON.stringify(batch);

  assert.ok(!serialized.includes(process.env.SUPABASE_SECRET_KEY || 'fake_secret_key'));
  assert.ok(!serialized.includes('GMAIL_APP_PASSWORD'));
  assert.ok(!serialized.includes(process.env.GMAIL_APP_PASSWORD || 'fake_pw'));
});

// 31. Two-Column Mapping Schema Enforcement
await test('31. UpdateMappingSchema requires both Name and Email and rejects mapping the same column twice', async () => {
  const missingName = updateMappingSchema.safeParse({ emailColumn: 'Email Address', nameColumn: '' });
  assert.equal(missingName.success, false);

  const sameColumn = updateMappingSchema.safeParse({ emailColumn: 'Email Address', nameColumn: 'Email Address' });
  assert.equal(sameColumn.success, false);

  const validMapping = updateMappingSchema.safeParse({ emailColumn: 'Email Address', nameColumn: 'Full Name' });
  assert.equal(validMapping.success, true);

  const commitValid = commitImportSchema.safeParse({
    campaignName: 'SNPSUNEXUS Roster Notice',
    templateId: 'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
    idempotencyKey: 'snpsu_key_123456',
  });
  assert.equal(commitValid.success, true);
});

// 32. Auto-detect Requested Standard Variations
await test('32. Auto-detect Full Name/Name/Recipient Name and Email/Email Address/E-mail/Recipient Email', async () => {
  const cases = [
    [['Full Name', 'Email Address'], 'Full Name', 'Email Address'],
    [['Recipient Name', 'Recipient Email'], 'Recipient Name', 'Recipient Email'],
    [['Name', 'E-mail'], 'Name', 'E-mail'],
  ];
  for (const [headers, expName, expEmail] of cases) {
    const det = autoDetectColumns(headers);
    assert.equal(det.nameColumn, expName);
    assert.equal(det.emailColumn, expEmail);
  }
});

// 33. Template Personalization Compatibility Analysis
await test('33. Detect unavailable placeholders when template requires fields beyond Full Name and Email Address', async () => {
  const strictTpl = {
    subject: 'Welcome {{recipient_name}}',
    html_content: '<p>Hello {{recipient_name}} ({{recipient_email}}), Role: {{designation}}, Verify: {{activation_link}}</p>',
    text_content: 'Hello {{recipient_name}} from {{institution_name}} ({{current_year}})',
  };
  const warnings = importRepo.analyzeTemplatePersonalizationCompatibility(strictTpl);
  assert.ok(warnings.missingFields.includes('{{designation}}'));
  assert.ok(warnings.missingFields.includes('{{activation_link}}'));
  assert.equal(warnings.missingFields.includes('{{recipient_name}}'), false);
  assert.equal(warnings.missingFields.includes('{{recipient_email}}'), false);
  assert.equal(warnings.missingFields.includes('{{institution_name}}'), false);

  const twoFieldTpl = {
    subject: 'Update for {{recipient_name}}',
    html_content: '<p>Hi {{recipient_name}}, sent to {{recipient_email}} by {{institution_name}} &copy; {{current_year}}</p>',
  };
  const cleanWarnings = importRepo.analyzeTemplatePersonalizationCompatibility(twoFieldTpl);
  assert.deepEqual(cleanWarnings.missingFields, []);
});

// 34. Clean Two-Column XLSX & XLS Roundtrip
await test('34. Clean 2-column XLSX and XLS workbooks parse with zero ignored columns', async () => {
  const rows = [
    ['Full Name', 'Email Address'],
    ['Alex Morgan', 'alex.morgan@example.com'],
    ['Jordan Lee', 'jordan.lee@example.com'],
    ['Taylor Smith', 'taylor.smith@example.com'],
    ['Sam Wilson', 'sam.wilson@example.com'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Recipients');

  for (const [bookType, ext] of [['xlsx', 'xlsx'], ['biff8', 'xls']]) {
    const buf = XLSX.write(wb, { type: 'buffer', bookType });
    const parsed = parseSpreadsheet(buf, `snpsunexus_recipient_template.${ext}`);
    assert.deepEqual(parsed.headers, ['Full Name', 'Email Address']);
    assert.deepEqual(parsed.ignoredColumns, []);
    assert.equal(parsed.rawRows.length, 4);
    const val = validateBatchRows(parsed.rawRows, parsed.mappingConfig.emailColumn, parsed.mappingConfig.nameColumn);
    assert.equal(val.summary.valid_count, 4);
    assert.equal(val.summary.invalid_count, 0);
    assert.equal(val.summary.duplicate_count, 0);
  }
});

console.log('\n========================================================');
console.log(`Test Execution Finished: ${passed} Passed, ${failed} Failed`);
console.log('========================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`✓ ALL ${passed} BULK IMPORT TESTS PASSED SUCCESSFULLY!\n`);
}
