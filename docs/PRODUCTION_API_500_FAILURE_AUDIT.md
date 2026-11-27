# Production API 500 Incident Audit & Remediation Report

**Application:** SNPSUNEXUS Mail Studio  
**Production URL:** `https://emaildraft.vercel.app`  
**Repository:** `Preritrd5/Mail-Studio` (`main`)

---

## 1. Incident Summary

Prior to remediation, browser console diagnostics reported HTTP `500` errors (plus earlier cross-origin/configuration failures) across all core API routes:

- `GET /api/auth/session`
- `GET /api/queue`
- `GET /api/reports/overview?date_range=7d`
- `GET /api/activity?limit=4`
- `GET /api/reports/timeline?days=7`
- `GET /api/system/status`
- `GET /api/reports/campaigns?limit=5`
- `GET /api/templates?status=all`
- `GET /api/health`

Live HTTP probing of `https://emaildraft.vercel.app` returned `500` across all 9 endpoints with:

```json
{
  "success": false,
  "error": {
    "code": "SERVERLESS_BOOTSTRAP_FAILED",
    "message": "require() of ES Module /var/task/node_modules/htmlparser2/dist/index.js from /var/task/node_modules/sanitize-html/index.js not supported."
  }
}
```

---

## 2. Shared Root Causes Identified

### Root Cause 1 — Frontend Origin & Direct Supabase Client Table Queries (Fixed Earlier)
- Earlier frontend builds defaulted to `http://localhost:4000/api` when `VITE_API_BASE_URL` was unset or pointed to localhost, causing CORS failures on Vercel, and queried `public.admin_users` directly from the browser (`404 Not Found` before schema initialization).
- **Fix (`src/services/apiConfig.ts`, `src/services/authService.ts`):** `getApiBaseUrl()` rejects localhost URLs when running on non-localhost browser origins and defaults to same-origin `/api`. Admin status is verified exclusively via backend `GET /api/auth/session`.

### Root Cause 2 — Missing Vercel Serverless Entrypoint & Process Exits in Env Validation (Fixed Earlier)
- No Vercel rewrite (`vercel.json`) or serverless wrapper (`api/index.js`) existed, and `backend/src/config/env.js` called `process.exit(1)` on top-level import if environment variables were absent.
- **Fix (`vercel.json`, `api/index.js`, `backend/src/config/env.js`, `backend/src/config/supabase.js`, `backend/src/server.js`, `backend/src/app.js`):**
  - `vercel.json` routes `/api/(.*)` -> `/api/index.js` and bundles `public/assets/**`.
  - `api/index.js` lazily imports `backend/src/app.js`, captures boot errors into structured `SERVERLESS_BOOTSTRAP_FAILED` JSON, and awaits `res.once('finish'/'close')`.
  - `backend/src/config/env.js` validates HTTP URLs safely (`isValidHttpUrl`) without crashing serverless cold starts; `backend/src/server.js` enforces standalone CLI exit on missing env; `backend/src/app.js` returns explicit HTTP `503 SERVER_CONFIG_MISSING` with `requestId` for non-health routes if `isSupabaseConfigured()` is false.

### Root Cause 3 — Vercel Node Runtime Incompatibility with `sanitize-html` ESM Dependency
- Local development runs Node `v22.21.1`, whereas Vercel defaulted to Node `20.x` because `package.json` lacked `engines`. `sanitize-html@2.18.2` (CommonJS) calls `require('htmlparser2')`, where `htmlparser2@12.0.0` is an ES Module requiring Node `>=22.12.0` (`require(esm)`).
- Every serverless cold start threw `ERR_REQUIRE_ESM`, turning every `/api/*` request into `500 SERVERLESS_BOOTSTRAP_FAILED`.
- **Fix:** Added `"engines": { "node": "22.x" }` in `package.json`, `.nvmrc` (`22.12.0`), `.node-version` (`22.12.0`), restored `sanitize-html@^2.18.2`, and added `nodeVersion: process.version` and `sanitize_html_loaded` telemetry to `GET /api/health`. (See `docs/VERCEL_NODE_SANITIZER_COMPATIBILITY_FIX.md`.)

### Root Cause 4 — Authorization & Error Handling Hardening
- **Strict Admin RBAC (`backend/src/middleware/auth.js`):** Removed insecure fallbacks trusting user-editable `user_metadata` or email substrings. `resolveAdminAuth` validates the Supabase JWT via `supabaseAdmin.auth.getUser`, then verifies `public.admin_users` or server-only `app_metadata.role === 'administrator'`, failing closed with `503 DATABASE_SCHEMA_MISSING` / `DATABASE_UNAVAILABLE` on DB failures and `403 FORBIDDEN` on unauthorized accounts.
- **Explicit Session Contract (`backend/src/routes/authRoutes.js`):** `GET /api/auth/session` returns HTTP `200 { authenticated: false, isAdmin: false, profile: null }` without a Bearer token, `401` on invalid/expired JWT, `403` on non-admin users, `503` if DB/schema is unavailable, and `200` with admin profile when authorized.
- **Structured Error Handling (`backend/src/app.js`, `backend/src/middleware/errorHandler.js`, `backend/src/middleware/rateLimiter.js`):** Every request receives an `X-Request-Id` / `req.requestId` correlation ID included in all error JSON envelopes (`INVALID_JSON_PAYLOAD`, `FILE_UPLOAD_ERROR`, `CORS_ORIGIN_FORBIDDEN`, `ROUTE_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`), and production stack traces are omitted from client responses.
- **Timeline Bounds (`backend/src/repositories/reportsRepository.js`):** `getTimelineMetrics` clamps `days` to `1..365` using UTC midnight boundaries.

### Root Cause 5 — Duplicate API Request Loops & False "Operational" Statuses
- **Request Deduplication (`src/services/apiConfig.ts`):** Added `inFlightGetRequests` concurrent GET deduplication map in `fetchApiEnvelope`.
- **Stable React Dependencies (`src/context/AppContext.tsx`, `src/context/AuthContext.tsx`, `src/views/SendingQueueView.tsx`):**
  - Replaced unstable object dependencies (`[user]`) with primitive `userId` (`user?.id ?? null`) in `AppContext.tsx` and `SendingQueueView.tsx`.
  - Used `selectedCampaignIdRef` in `SendingQueueView.tsx` so selecting a campaign does not re-trigger `/api/queue` fetches, and throttled idle polling (`3000ms` active / `10000ms` idle).
  - Skipped duplicate `INITIAL_SESSION` handling in `AuthContext.tsx` `onAuthStateChange`.
- **Honest Health Reporting (`backend/src/controllers/healthController.js`, `src/services/systemService.ts`, `src/views/DashboardView.tsx`):**
  - `/api/system/status` differentiates `api`, `auth`, `database`, `worker` (`status`, `lock_held`), and `smtp` (`configured_unverified` / `not_configured` rather than claiming unverified SMTP is operational).

---

## 3. Supabase Database & Production Deployment Requirements

During diagnostics against `spbxafucskpsjsapkdnt.supabase.co`, OpenAPI inspection previously reported `Available OpenAPI Paths: [ '/' ]` and `PGRST205` (migrations not yet applied on the remote Supabase project). Code fixes ensure the backend fails closed (`503 DATABASE_SCHEMA_MISSING`) rather than crashing with unhandled `500` or returning dummy data, and require:

1. **Vercel Project Settings (`emaildraft`):**
   - Set **Node.js Version** to **`22.x`** (matching `package.json` `engines.node` and `.nvmrc`).
   - Confirm Environment Variables for Production/Preview: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. **Supabase SQL Schema & Admin Bootstrap (`spbxafucskpsjsapkdnt`):**
   - Execute `supabase/consolidated_schema_migration.sql` (includes Phases 1–9 through `delete_email_template_permanently`) in the Supabase SQL Editor.
   - Bootstrap the initial administrator record in `public.admin_users` via `supabase/seed_admin_bootstrap.sql` or `node scripts/bootstrap-admin.cjs`.

---

## 4. Verification Status

- **Local Typecheck & Build:** `npx tsc --noEmit` and `npm run build` (`tsc && vite build`) passed after all edits (`2268` modules transformed cleanly).
- **Local Automated Test Suite:** `node backend/tests/run-full-suite.js` passed all **220 tests across 9 suites** (`0` failures), including the **14-test** Production API Verification Suite covering `/api/auth/session` (`200`/`401`/`403`/`503`), `user_metadata` forgery rejection, `app_metadata` support, `/api/queue`, `/api/reports/*`, `/api/activity`, `/api/templates`, `/api/health`, `/api/system/status`, malformed JSON `400`, `404`, and CORS `403`.
- **Live Vercel Status Note:** Vercel CLI is currently unauthenticated locally (`vercel whoami` logged out); changes must be pushed to `origin/main` so Vercel builds from GitHub (`22.x` runtime) before re-verifying `https://emaildraft.vercel.app`.
