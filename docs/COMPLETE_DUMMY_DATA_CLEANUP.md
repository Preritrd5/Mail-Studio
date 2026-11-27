# SNPSUNEXUS Mail Studio — Complete Dummy Data & Default Record Cleanup Report

## 1. Executive Summary

A full-stack production data hygiene audit was conducted across the React frontend, Express backend API, SQL schema/seed migrations, browser `localStorage`, queue worker subsystem, and connected Supabase project (`https://spbxafucskpsjsapkdnt.supabase.co`).

All hardcoded dummy recipients, fallback campaigns, seeded institutional email templates, fabricated queue/system indicators, and unauthenticated bypass tokens have been removed from runtime code and SQL seed scripts.

Test fixtures are now strictly isolated under `backend/tests/fixtures/` (`NODE_ENV === 'test'`) and are never imported by production runtime code.

---

## 2. Root Causes of Dummy Records Identified in Screenshots

1. **Email Activity (`Suresh Rao`, `Kavita Menon`, `Aditi Sharma`, `Rahul Verma`, `Security & Access Update`, `Verify Your Email Address`)**
   - **Root Cause:** Queries against `https://spbxafucskpsjsapkdnt.supabase.co` returned `PGRST205` (`Could not find the table 'public.*' in the schema cache`) because the schema migrations have not yet been executed on that Supabase instance. Previously, `backend/src/repositories/activityRepository.js` caught table/schema failures and returned a hardcoded `fallbackActivityStore` array containing those sample records.
2. **Sending Queue (`Product Announcement`, `System Update`, `Service Notification`, `Administrative Bulletin`, `Alex Morgan`, `Priya Sundaram`, `Vikram Joshi`, `Reset Guard Test`)**
   - **Root Cause:** `backend/src/queue/queueRepository.js` previously caught PostgreSQL/PostgREST errors and fell back to a mutable in-memory `fallbackStore` seeded with those 4 sample campaigns and sample recipients (`Reset Guard Test` had been appended during an earlier test against the fallback store). Additionally, `src/views/SendingQueueView.tsx` promoted merely `pending` recipients into `currentInFlight` and hardcoded `12 emails / minute`, `Strictly 1 Worker`, `5.0 Seconds`, and green pipeline checkmarks (`1. Template Snapshots`, `2. TLS Strict (Port 465)`).
3. **Email Templates & Compose (`SNPSUNEXUS Premium Notification Card`, `Official Semester Examination Admit Card & Schedule (v1)`, `Arjun Sharma`, `Sapthagiri NPS University`)**
   - **Root Cause:** `backend/src/repositories/templateRepository.js` called `seedInitialTemplates()` on DB error/empty response; `src/data/initialData.ts` + `src/services/storageService.ts` + `src/services/templateService.ts` injected `OFFICIAL_PREMIUM_NOTIFICATION_CARD` whenever the backend returned 0 templates or failed; SQL seeds in `supabase/migrations/20261126000003_seed_institutional_templates.sql` and `supabase/consolidated_schema_migration.sql` contained institutional `Sapthagiri NPS University` seed templates; `src/views/ComposeEmailView.tsx` and `src/views/EmailTemplatesView.tsx` contained `Arjun Sharma` / academic placeholders; and frontend API services fell back to `'Bearer demo-admin-token'` when no Supabase session existed.

---

## 3. Connected Supabase Database Inspection (`https://spbxafucskpsjsapkdnt.supabase.co`)

- **Supabase Auth (`auth.users`):** `1` verified account (`snpsunexus@gmail.com`).
- **Schema Tables Checked:** `admin_users`, `campaigns`, `campaign_recipients`, `email_attempts`, `email_templates`, `app_settings`, `import_batches`, `import_batch_rows`, `queue_worker_state`, `queue_events`, `template_versions`, `idempotency_keys`.
- **Observed Database State:** All 12 `public.*` tables returned `PGRST205` (`Could not find the table 'public.<table_name>' in the schema cache`) because DDL migrations have not yet been applied to `spbxafucskpsjsapkdnt`.
- **Action Required After This Cleanup:** Run the cleaned [supabase/consolidated_schema_migration.sql](../supabase/consolidated_schema_migration.sql) and [supabase/seed_admin_bootstrap.sql](../supabase/seed_admin_bootstrap.sql) in the Supabase Dashboard SQL Editor for project `spbxafucskpsjsapkdnt`. Until then, authenticated API requests fail loudly with `HTTP 503` (`DATABASE_SCHEMA_MISSING`) rather than serving dummy fallback records.

---

## 4. Production Code & Schema Changes

### Backend (`backend/src/`)
- **`config/supabase.js`**: Added proxy-backed `supabaseAdmin`, `setTestSupabaseClient(mockClient)` guarded strictly by `NODE_ENV === 'test'`, and `createDatabaseError(operation, error)` mapping missing tables (`PGRST205`) to `503 DATABASE_SCHEMA_MISSING` and DB failures to `503 DATABASE_UNAVAILABLE`.
- **`middleware/auth.js`**: Restricted `'demo-admin-token'` auth bypass strictly to `process.env.NODE_ENV === 'test'`. Unauthenticated or invalid requests return `HTTP 401`.
- **`controllers/healthController.js`, `routes/healthRoutes.js`, `app.js`**: Added authenticated `GET /api/system/status` (and `/system` alias) returning verified database connectivity, SMTP host/TLS configuration status, and live queue worker lease status.
- **`repositories/*.js` & `queue/queueRepository.js`**: Removed all `fallbackStore`, `fallbackActivityStore`, `fallbackReportsData`, `seedInitialTemplates()`, and in-memory seed records across `activityRepository.js`, `reportsRepository.js`, `templateRepository.js`, `emailRepository.js`, `idempotencyRepository.js`, `importRepository.js`, and `queueRepository.js`. Database/table errors throw explicit `503` errors; genuinely empty tables return `[]` and `0` metrics.
- **`queue/workerLock.js`**: Removed `isFallback`; database unavailability returns `{ acquired: false }` cleanly instead of granting a fake lease.
- **`queue/queueService.js`**: `getQueueHealth()` reports `healthy: false`, `worker_status: 'offline'`, `worker_id: null`, `lock_generation: null`, and `active_workers_count: 0` when the database row is `unassigned` or stale, alongside verified `policy` values.
- **`controllers/queueController.js` & `controllers/importController.js`**: Propagate database `503` / `404` status codes cleanly via `next(err)` and replaced `'demo-admin-uuid'` with `null`.
- **`services/placeholderRegistry.js`**: Replaced personal example names with neutral placeholder labels (`[Recipient Name]`, `[recipient@domain.com]`, `[Designation]`).
- **`services/brandedTemplate.js`**: Removed from production `backend/src/services/` and moved to `backend/tests/fixtures/brandedTemplate.js`.

### SQL Migrations (`supabase/`)
- **`supabase/consolidated_schema_migration.sql`**: Removed Sapthagiri NPS University references, seeded exam/placement `email_templates`, and `institution_profile` setting inserts; kept schema DDL and operational `system_rate_limits`.
- **`supabase/migrations/20261126000003_seed_institutional_templates.sql`**: Removed all institutional sample templates and university profile inserts so clean migration replays start with zero sample templates.

### Frontend (`src/`)
- **Removed Files:** `src/data/initialData.ts`, `src/data/mockData.ts`.
- **`src/services/storageService.ts`**: Removed `templates`, `activity`, `campaigns`, and `queue` persistence; kept only UI sidebar preference (`snpsunexus_sidebar_collapsed`) and added `clearLegacyDemoStorage()` executed on app boot to purge `snpsunexus_mail_studio_templates`, `snpsunexus_mail_studio_activity`, `snpsunexus_mail_studio_campaigns`, and `snpsunexus_mail_studio_queue`.
- **`src/services/apiConfig.ts` & API Services (`templateService.ts`, `queueService.ts`, `activityService.ts`, `reportsService.ts`, `importService.ts`, `systemService.ts`)**: Removed `'demo-admin-token'` bypasses and all fallback template/preview datasets. Missing auth sessions raise `ApiError` (`401 AUTH_REQUIRED`). Empty template responses return `[]`.
- **`src/context/AppContext.tsx`**: Removed simulated queue timers (`setInterval`), fake retry timeouts, and `localStorage` data caches; added `templateLoadState` and real auth-aware refreshes.
- **`src/components/common/StateNotice.tsx`**: Shared status banner component distinguishing **Loading**, **Administrator Sign-In Required (`401`)**, **Database Schema / Service Error (`503`)**, and **Empty State**.
- **Template Builder & Presets (`src/services/templateHtmlGenerator.ts`, `src/components/templates/BlockBasedEditor.tsx`, `src/views/EmailTemplatesView.tsx`)**: Replaced exam admit-card / `Arjun Sharma` / `Your Trusted Education Partner` defaults with neutral SNPSUNEXUS copy, blank default template creation modal (`openCreateModal`), and explicit load states.
- **Views (`DashboardView.tsx`, `ComposeEmailView.tsx`, `BulkImportView.tsx`, `SendingQueueView.tsx`, `EmailActivityView.tsx`, `ReportsView.tsx`)**:
  - `DashboardView`: Removed `analytics`/`campaigns`/`activityLogs` fallback reads and hardcoded `System Health: Operational` card; now renders live `GET /api/system/status` (`Unauthenticated` / `Checking...` / `Operational` / `Degraded` / `DB Offline`) and real `0` counters when empty.
  - `SendingQueueView`: Stops polling when unauthenticated or failed; renders explicit `AUTH_REQUIRED` or `error` notices; `currentInFlight` shows only active `status === 'sending'` rows (never `pending`); pipeline stages & `Sequential Delivery Policy` show `Unverified` / `0 Verified` instead of hardcoded `12 emails / minute`, `Strictly 1 Worker`, or premature green checkmarks.
  - `ReportsView`: Removed `contextCampaigns`, `analytics`, `ExportService` client fallbacks, and `'Local Fallback'` status badge (`AUTH REQUIRED` / `UNAVAILABLE` / `LIVE CONNECTED`).
  - `ComposeEmailView` & `EmailActivityView` & `BulkImportView`: Cleared pre-filled default input values, neutralized placeholders, removed hardcoded `smtp.gmail.com:465 / TLS 1.3 Strict` modal badges in Activity detail, and surfaced explicit auth/DB notices.

---

## 5. Verification Results

### Automated Backend Suite (`node backend/tests/run-full-suite.js`, `NODE_ENV=test`)
- **Result:** **195 / 195 tests passed across 8 suites in 25.8s** (`exit code 0`), using isolated in-memory test DB fixtures (`backend/tests/fixtures/inMemoryTestDb.js`):
  1. `run-all-tests.js`: 20 / 20 passed
  2. `template.test.js`: 20 / 20 passed
  3. `import.test.js`: 34 / 34 passed
  4. `queue.test.js`: 40 / 40 passed
  5. `activity-reports.test.js`: 56 / 56 passed
  6. `gmail-rendering.test.js`: 10 / 10 passed
  7. `test-queue-sync-and-preview.js`: 5 / 5 passed
  8. `audit-production-hygiene.test.js`: 10 / 10 passed (empty DB returns `[]`/`0`, `PGRST205` throws `503 DATABASE_SCHEMA_MISSING` without fallbacks, `WorkerLock` returns `{ acquired: false }` when DB is unavailable, production `NODE_ENV` rejects `demo-admin-token` with `401`, `/api/system/status` reflects real DB & worker status)

### Frontend TypeScript & Production Bundle (`npx tsc --noEmit; npm run build`)
- **Result:** Passed with `0` TypeScript errors and `2267` modules transformed into `dist/` (`vite build`, 20.80s) after the final frontend edit.

### Repository Code Scan (`src/`, `backend/src/`, `supabase/`)
- **Result:** Zero matches for removed dummy names, sample campaigns, `Local Fallback`, `Strictly 1 Worker`, `12 emails / minute`, `initialData`, `mockData`, or `fallbackStore`. The only non-test-dir match (`admin@snpsu.edu.in`) is strictly inside the `process.env.NODE_ENV === 'test' && token === 'demo-admin-token'` guard in `backend/src/middleware/auth.js`.

### Live Browser Verification (`http://localhost:5173/`)
- **Observed (`a8045f86-10b3-46ed-99ae-5cca5ad6143a`, screenshot `final_step_4.png`):** Verified live HTTP `200 OK`, zero console errors, zero failed requests, Dashboard displaying `0` metrics / `System Status: Sign In Required` / `Administrator Sign-In Required`, and Compose Email displaying blank inputs, `-- Sign in to load saved templates --`, and `SNPSUNEXUS Sender Identity`.
- **Limitation:** Follow-up full 7-section browser verification (`b4ccf5f3-9e86-4476-bb3a-05d96cc47a07`) was canceled by user action, so post-edit interactive browser inspection of the remaining 5 sections (`Bulk Import`, `Sending Queue`, `Email Activity`, `Email Templates`, `Reports`) was not completed in the live browser pane (though their builds and backend APIs were verified via `tsc && vite build` and the 195-test suite).
