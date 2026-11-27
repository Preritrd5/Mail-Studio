# PHASE 6 — BULK RECIPIENT IMPORT & CAMPAIGN PREPARATION SPECIFICATION
## SNPSUNEXUS MAIL STUDIO
### Administrator Email Management Platform for Sapthagiri NPS University

---

## 1. Executive Summary

Phase 6 transforms the recipient management capabilities of **SNPSUNEXUS Mail Studio** from a frontend demonstration into a secure, production-grade, backend-integrated **Bulk Import & Campaign Preparation System**. 

The system provides an authoritative, end-to-end ingestion pipeline supporting:
- Server-side parsing of CSV, modern Excel (`.xlsx`), and legacy Excel (`.xls`) files.
- Binary signature / magic byte inspection to prevent extension spoofing.
- Auto-detection and manual configuration of email and name column mappings.
- A centralized validation engine with four distinct classifications: **Valid**, **Warning**, **Invalid**, and **Duplicate**.
- Persistent staging tables (`import_batches` and `import_batch_rows`) with Row Level Security (RLS).
- Interactive recipient review ledger with server-side pagination, searching, sorting, and granular row selection.
- Atomic, transactional campaign creation with template snapshotting (`public.commit_import_batch`) and idempotency key protection.
- State boundary enforcement: Prepared campaigns enter the **Ready** status and do **not** trigger email dispatching (which is reserved exclusively for Phase 7).

---

## 2. Ingestion Pipeline Architecture

```
[Administrator UI] (React / Vite)
        |
        | 1. Drag & Drop Upload (CSV / XLSX / XLS)
        v
[Express API: POST /api/imports]
        |
        |-- 2. Security Checks:
        |      - Size limit check (< 10 MB)
        |      - Extension whitelist check (.csv, .xlsx, .xls)
        |      - Magic byte signature verification
        |
        |-- 3. In-Memory Parsing:
        |      - CSV: PapaParse (UTF-8 / BOM, quoted commas, multi-line)
        |      - Excel: SheetJS (Disable formulas/macros, sheet selection)
        |      - Row limit verification (< 10,000 rows)
        |
        |-- 4. Auto-Column Detection:
        |      - Email column matching
        |      - Name column matching
        |
        |-- 5. Authoritative Validation Engine:
        |      - RFC 5322 regex validation
        |      - Whitespace & lowercase normalization
        |      - Batch duplicate detection (Row reference tracking)
        |      - Classify: Valid | Warning | Invalid | Duplicate
        v
[Supabase PostgreSQL Database]
        |
        |-- 6. Persistent Staging:
        |      - Insert import_batches (Status: 'Ready')
        |      - Chunked insert import_batch_rows (500 rows/chunk)
        v
[Review & Staging Interface]
        |
        |-- 7. Step 2: Worksheet & Column Mapping
        |-- 8. Step 3: Validation Metric Summary
        |-- 9. Step 4: Staged Recipient Review Ledger (Search, filter, select)
        |-- 10. Step 5: Campaign Setup & Phase 5 Active Template Attachment
        v
[Commit Confirmation]
        |
        | 11. POST /api/imports/:id/commit (Idempotency Key)
        v
[PostgreSQL RPC: commit_import_batch]
        |
        |-- 12. Transactional Lock (FOR UPDATE)
        |-- 13. Idempotency Check (Prevent duplicate campaigns)
        |-- 14. Capture Immutable Template Snapshot (id, version, HTML, subject)
        |-- 15. Create Bulk Campaign (Status: 'ready', pending_count: N)
        |-- 16. Insert Recipients into campaign_recipients (Status: 'pending')
        |-- 17. Update Batch Status: 'Committed'
        v
[Phase 6 Completion: Ready for Phase 7 Queue Engine]
```

---

## 3. Supported File Formats & Ingestion Limits

### Configured Safety Limits
- **Maximum File Size**: 10 MB (`10 * 1024 * 1024` bytes).
- **Maximum Recipient Rows**: 10,000 rows per file.
- **Accepted File Extensions**: `.csv`, `.xlsx`, `.xls`.

### Binary Signature (Magic Byte) Verification
To prevent malicious file upload or extension spoofing, the backend inspects the initial byte headers:
1. **XLSX (Office Open XML)**: Verified for standard PK ZIP signature `0x50, 0x4B, 0x03, 0x04`. Plain text files renamed to `.xlsx` are rejected.
2. **XLS (Legacy Binary BIFF8)**: Verified for Compound File Binary (CFB) header `0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1`.
3. **CSV (Text Format)**: Checked for absence of binary null bytes (`0x00`) in the leading 512 bytes.
4. **UTF-8 BOM**: Byte Order Mark `0xFEFF` is stripped cleanly without corrupting the first column header.
5. **Spreadsheet Security**: Formula calculation and VBA macro execution are explicitly disabled (`cellFormula: false`, `bookVBA: false`).

---

## 4. Recipient Column Mapping & Detection

### Auto-Detection Heuristics
The backend inspects sanitized, lowercased header names:
- **Email Candidates**: `email`, `email address`, `e-mail`, `e_mail`, `recipient email`, `recipient_email`, `mail`, `email id`, `student email`, `candidate email`, `institutional email`.
- **Name Candidates**: `name`, `full name`, `full_name`, `recipient name`, `recipient_name`, `student name`, `candidate name`, `participant name`, `faculty name`, `first name`.

### Manual Mapping Controls
Administrators can override mappings through the configuration interface:
1. **Worksheet Selection**: Choose active worksheet from multi-sheet Excel workbooks.
2. **Header Row Selector**: Specify header row index (e.g. Row 2 if Row 1 contains a banner title).
3. **Email Column Selector**: Required field.
4. **Name Column Selector**: Optional field (missing values generate warnings).
5. **Re-validation**: Calling `PATCH /api/imports/:id/mapping` triggers re-validation across all staging rows.

---

## 5. Recipient Validation Engine

Located in `backend/src/services/recipientValidator.js`.

### Normalization
Email addresses are normalized by trimming surrounding whitespace and converting to lowercase:
```javascript
const normalized_email = rawEmail.trim().toLowerCase();
```

### Four Validation Classifications

| Classification | Criteria | Selection Default | Campaign Importable | Diagnostic Reason Example |
|---|---|:---:|:---:|---|
| **Valid** | Email present, RFC 5322 valid syntax, unique in batch, name present | `true` | **Yes** | `Clean & verified` |
| **Warning** | Email valid & unique, but recipient name is empty | `true` | **Yes** | `Missing recipient name: Defaults to "Institutional Recipient"` |
| **Invalid** | Email is missing, empty, or malformed syntax | `false` (locked) | **No** | `Invalid email syntax format: "user@invalid"` |
| **Duplicate** | Normalized email was encountered earlier in the file | `false` (locked) | **No** | `Duplicate email address: Identical to record at Row #2` |

### Duplicate Policy
- **First Occurrence Rule**: The first valid occurrence of an email is registered in `seenEmailsMap` and marked `valid` or `warning`.
- **Subsequent Occurrence Flagging**: Later occurrences are classified as `duplicate` and annotated with the row number of the first occurrence.
- **Enforced Exclusion**: Rows classified as `invalid` or `duplicate` cannot be toggled to `is_selected: true`.

---

## 6. Database Schema & Staging Architecture

### Migration File: `supabase/migrations/20261126000006_bulk_import_system.sql`

```sql
-- 1. Table: import_batches
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'xls')),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Uploaded' CHECK (
    status IN ('Uploaded', 'Processing', 'Ready', 'Failed', 'Committed', 'Cancelled')
  ),
  worksheet_name TEXT,
  available_sheets JSONB DEFAULT '[]'::jsonb,
  header_row INTEGER NOT NULL DEFAULT 1,
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  selected_count INTEGER NOT NULL DEFAULT 0,
  mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_columns JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  committed_at TIMESTAMPTZ,
  committed_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Table: import_batch_rows
CREATE TABLE IF NOT EXISTS public.import_batch_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number >= 1),
  recipient_name TEXT,
  recipient_email TEXT,
  normalized_email TEXT,
  validation_status VARCHAR(20) NOT NULL CHECK (
    validation_status IN ('valid', 'warning', 'invalid', 'duplicate')
  ),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_selected BOOLEAN NOT NULL DEFAULT true,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_batch_row_number UNIQUE (batch_id, row_number)
);
```

### Performance & Chunking
- Staging rows are inserted in batches of 500 rows (`CHUNK_SIZE = 500`) to avoid memory bottlenecks and database timeout errors.
- Indexing on `(batch_id, is_selected)`, `validation_status`, and `normalized_email` ensures rapid queries even with 10,000 rows.

---

## 7. Transactional Campaign Commitment & RPC

### Stored Procedure: `public.commit_import_batch`
The commitment process is executed atomically within PostgreSQL:
1. **Batch Lock**: Selects the batch with `FOR UPDATE` to prevent race conditions.
2. **Idempotency Protection**: Checks if `batch.idempotency_key = p_idempotency_key`. If matching, returns the existing campaign details (`idempotent_replay: true`).
3. **Template Snapshotting**: Fetches active template, capturing `id`, `version`, `subject`, `html_content`, and `text_content` into `template_snapshot` JSONB.
4. **Atomic Bulk Insert**:
   - Creates a campaign record in `public.campaigns` with `status = 'ready'`.
   - Inserts all selected rows (`is_selected = true AND validation_status IN ('valid', 'warning')`) into `public.campaign_recipients` with `status = 'pending'`.
   - Uses `ON CONFLICT (campaign_id, normalized_email) DO NOTHING` for deduplication.
5. **Counter Reconciliation**: Sets `total_recipients = v_inserted_count` and `pending_count = v_inserted_count`.
6. **State Transition**: Sets batch `status = 'Committed'`, `committed_at = now()`.

---

## 8. Backend API Endpoints

Mounted under `/api/imports` and protected by `requireAdminAuth`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/imports` | Multipart file upload. Parses spreadsheet, runs validation, creates batch and staging rows. |
| `GET` | `/api/imports/:id` | Retrieves batch status, sheet list, and summary counts. |
| `GET` | `/api/imports/:id/rows` | Returns paginated, filtered, and sorted staging rows. |
| `PATCH` | `/api/imports/:id/mapping` | Updates column mapping/worksheet and re-validates all rows. |
| `PATCH` | `/api/imports/:id/selection` | Updates row selection (`rowIds`, `isSelected`, or `selectAllStatus`). |
| `POST` | `/api/imports/:id/commit` | Transactionally creates bulk campaign in `ready` state. |
| `POST` | `/api/imports/:id/cancel` | Cancels an uncommitted import batch. |

---

## 9. Frontend 6-Step Workflow (`BulkImportView.tsx`)

1. **Step 1 — Upload**: Drag-and-drop zone with visual feedback, format guidance, local sample CSV generator, and active batch recovery prompt.
2. **Step 2 — Configure Mapping**: Dropdown selectors for worksheet, header row index, and detected column mappings.
3. **Step 3 — Validation Summary**: Metric cards for Total Rows, Valid & Clean, Warnings (No Name), Duplicates Flagged, and Invalid Syntax.
4. **Step 4 — Recipient Review Ledger**: Searchable, paginated table with individual row checkboxes, select/deselect all, and diagnostics.
5. **Step 5 — Campaign Staging**: Campaign name input and Phase 5 active template selector with subject and body previews.
6. **Step 6 — Final Review & Confirmation**: Modal summarizing campaign parameters, warning count, excluded invalid/duplicate count, and audit guarantees before commit.
7. **Success Confirmation**: Real Campaign ID display, committed recipient count, and clear notice that emails have not yet been dispatched.

---

## 10. Automated Test Results

Executed via `node backend/tests/import.test.js`:
```
========================================================
  SNPSUNEXUS Mail Studio — Bulk Import Test Suite
  Testing 30 File Parsing, Validation & Commit Scenarios
========================================================

• Testing [1. Parse valid CSV with UTF-8 encoding and commas inside quotes]... ✓ PASSED
• Testing [2. Parse CSV with UTF-8 BOM without corrupting first header]... ✓ PASSED
• Testing [3. Parse valid XLSX workbook and extract sheets and rows]... ✓ PASSED
• Testing [4. Parse legacy XLS workbook structure]... ✓ PASSED
• Testing [5. Reject unsupported file extension (.pdf, .exe, .json)]... ✓ PASSED
• Testing [6. Reject spoofed XLSX file signature (plain text disguised as .xlsx)]... ✓ PASSED
• Testing [7. Reject CSV containing binary null bytes]... ✓ PASSED
• Testing [8. Reject empty file (0 bytes)]... ✓ PASSED
• Testing [9. Reject file exceeding 10 MB limit]... ✓ PASSED
• Testing [10. Multi-sheet workbook navigation and specific sheet selection]... ✓ PASSED
• Testing [11. Excel header row selection (row 2 instead of row 1)]... ✓ PASSED
• Testing [12. Email normalization trims whitespace and lowers case]... ✓ PASSED
• Testing [13. Valid recipient with name and proper email syntax]... ✓ PASSED
• Testing [14. Warning classification when recipient name is missing]... ✓ PASSED
• Testing [15. Invalid classification for empty email address]... ✓ PASSED
• Testing [16. Invalid classification for malformed email syntax]... ✓ PASSED
• Testing [17. Duplicate policy retains first occurrence and flags subsequent as duplicate]... ✓ PASSED
• Testing [18. Create persistent import batch with initial Ready status]... ✓ PASSED
• Testing [19. Save and retrieve staging rows preserving row numbers and reasons]... ✓ PASSED
• Testing [20. Filter staging rows by validation status]... ✓ PASSED
• Testing [21. Toggle individual row selection and update selected count]... ✓ PASSED
• Testing [22. Enforce that invalid and duplicate rows can never be marked selected]... ✓ PASSED
• Testing [23. Transactionally commit import batch into bulk campaign in ready state]... ✓ PASSED
• Testing [24. Replaying commit with identical idempotency key returns original campaign]... ✓ PASSED
• Testing [25. Re-committing an already committed batch with a new key is rejected]... ✓ PASSED
• Testing [26. Reject selection modification on an already committed batch]... ✓ PASSED
• Testing [27. Cancel an uncommitted import batch]... ✓ PASSED
• Testing [28. Reject commitment of a cancelled batch]... ✓ PASSED
• Testing [29. Auto-detect diverse header variants (E-mail, Recipient Name, Mail ID)]... ✓ PASSED
• Testing [30. Verify zero secret leakage across repository outputs]... ✓ PASSED

========================================================
Test Execution Finished: 30 Passed, 0 Failed
========================================================
✓ ALL 30 BULK IMPORT TESTS PASSED SUCCESSFULLY!
```

### Full System Test Run
- `backend/tests/import.test.js`: **30/30 PASSED**
- `backend/tests/template.test.js`: **20/20 PASSED**
- `backend/tests/run-all-tests.js`: **20/20 PASSED**
- `npm run build` (`tsc && vite build`): **0 ERRORS** (2,260 modules transformed, production assets generated cleanly)

---

## 11. Strict Phase Boundary Compliance

In strict adherence to instructions:
- **NO bulk emails were sent.**
- **NO global sending queue workers or 5-second interval dispatchers were executed.**
- **NO automated retry mechanisms for bulk sending were started.**
- **All created campaigns remain in the `ready` state, safely staged and prepared for Phase 7.**
