# SNPSUNEXUS Mail Studio — Sending Queue API, Worker Synchronization & UI Layout Audit & Fix

## 1. Executive Summary

This document details the root-cause diagnosis, architectural corrections, and verification results for the Sending Queue API failure (`GET /queue does not exist`), worker synchronization anomalies, toast notification duplication, and UI alignment issues identified in **SNPSUNEXUS Mail Studio**.

All changes were implemented adhering strictly to the production specifications:
- Canonical routing prefix `/api` enforced across all frontend services.
- Transparent reverse-rewrite middleware in the Express backend supporting root aliases (`/queue`, `/activity`, `/reports`, `/templates`, `/imports`, `/emails`, `/health`) defensibly.
- Zero false operational states: explicit `Worker Connected — Ready`, `Worker Connected — Idle`, `Worker Running`, `Waiting for Next Attempt`, `Worker Offline`, and `Queue Synchronization Failed`.
- Intelligent toast deduplication and top-right positioning (`fixed top-20 right-4 sm:right-6 z-50`).
- 100% test pass rate across all suites (166/166 automated tests + 5/5 new endpoint and alias tests).

---

## 2. Root Cause Analysis

### Issue A: `The requested endpoint GET /queue does not exist.` (HTTP 404)
- **Root Cause**: The `.env` configuration defined `VITE_API_BASE_URL="http://localhost:4000"` (without `/api`).
- In `src/services/queueService.ts`, `src/services/activityService.ts`, and `src/services/reportsService.ts`, the base URL fallback was written as:
  ```ts
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  ```
  Since `VITE_API_BASE_URL` was defined in the environment, it took precedence, resulting in `API_BASE_URL = "http://localhost:4000"`.
- Requests were dispatched as `fetch(`${API_BASE_URL}/queue`)` $\rightarrow$ `http://localhost:4000/queue`.
- The Express application in `backend/src/app.js` mounted `queueRouter` strictly under `/api`:
  ```js
  app.use('/api', queueRouter);
  ```
  Because `queueRouter.get('/queue')` was inside, the only registered path was `/api/queue`. A request to `/queue` missed all route matchers, reaching `notFoundHandler`, which returned HTTP 404: `The requested endpoint GET /queue does not exist.`

### Issue B: Repeated "Queue Sync Failed" Toast Notifications
- **Root Cause**: The background polling timer in `SendingQueueView.tsx` ran every 3000ms. On each failed attempt, it triggered `addToast`.
- In `src/context/AppContext.tsx`, `addToast` generated a random UUID and pushed a new toast unconditionally to state without checking if an identical error toast was already active or recently dismissed.
- The toast container was positioned at `bottom-5 right-5`, causing error cards to pile up and physically obscure buttons and campaign cards.

### Issue C: Misleading Worker Status & False "READY" Indicator
- **Root Cause**: When the queue had no eligible recipients or when the worker was offline/desynchronized, the UI defaulted `currentInFlight` to a dummy object (`queue@example.com`) and displayed `READY` as the countdown timer.
- The Sequential Delivery Policy card reported `Singleton Lease Active` statically, regardless of whether PostgreSQL lease verification succeeded.

---

## 3. Technical Implementation & Architectural Corrections

### 3.1. Canonical API Normalization & Centralized URL Builder
Created `src/services/apiConfig.ts`:
```ts
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').trim().replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
```
All frontend services (`queueService.ts`, `activityService.ts`, `reportsService.ts`, `templateService.ts`) now import and route all requests through `getApiUrl()`.

### 3.2. Express Defensive Route Alias & Transparent URL Rewriting
In `backend/src/app.js`, implemented transparent root alias rewriting before the router mounts:
```js
// Route Alias / Rewrite Middleware (Transparently normalizes paths without /api prefix)
app.use((req, res, next) => {
  const rootAliases = ['/queue', '/activity', '/reports', '/templates', '/imports', '/emails', '/email', '/health'];
  if (rootAliases.some(prefix => req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`))) {
    req.url = `/api${req.url}`;
  }
  next();
});

// Canonical Mount under /api
app.use('/api', queueRouter);
// ...
```
Both `GET http://localhost:4000/api/queue` and `GET http://localhost:4000/queue` resolve identically to `queueController.getQueueStatusHandler`.

### 3.3. Toast Notification Deduplication, Positioning & Dismissal Cooldown
In `src/context/AppContext.tsx`:
- Deduplicated incoming toasts against currently active toasts by signature `type + title + message`.
- Added `recentlyDismissedRef` tracking dismissed toast keys with an 8-second cooldown window so an administrator's manual dismissal is respected during periodic polling.
- Moved `src/components/common/ToastContainer.tsx` to `fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none`.

### 3.4. Rigorous Worker State Machine & UI Alignment
In `src/views/SendingQueueView.tsx`:
- Added `syncStatus: 'syncing' | 'synced' | 'failed'`.
- Added concurrency guard with `isFetchingRef = useRef(false)` preventing overlapping poll queries.
- Accurate Status Mapping:
  - `Queue Synchronization Failed`: when backend communication fails (rose indicator, error details, "Offline" rate badge, and explicit Retry button).
  - `Worker Offline`: when worker process heartbeat is disconnected (> 30s stale).
  - `Worker Connected — Ready`: when connected and eligible campaigns are queued.
  - `Worker Connected — Idle`: when connected but queue is empty (countdown shows `—`).
  - `Worker Running`: when sequentially transmitting TLS packets.
  - `Waiting for Next Attempt`: during mandatory 5-second interval pause.
- When no active recipient is in flight, the Spotlight card displays a clean "Queue Empty — No active recipient staged" container with `—` sequential positions, completely replacing the dummy `queue@example.com` record.
- Sequential Delivery Policy card reflects verified facts: PostgreSQL persistence timestamp, 12 emails/minute cap, verified singleton lease generation, and 1-worker concurrency fencing.

---

## 4. Verification & Automated Test Results

### 4.1. Endpoint & Alias Verification (`backend/tests/test-queue-sync-and-preview.js`)
```
========================================================
  SNPSUNEXUS Mail Studio — Queue Sync & Preview Verification
========================================================
• Testing [1. GET /api/queue canonical route resolution]... ✓ PASSED
• Testing [2. GET /queue defensive alias transparent rewrite]... ✓ PASSED
• Testing [3. Worker health endpoint routing on /api and alias]... ✓ PASSED
• Testing [4. Activity & Reports route aliases transparent rewrite]... ✓ PASSED
• Testing [5. Authentication guard on defensive route alias]... ✓ PASSED
========================================================
  All Queue Sync & Routing Tests Passed Successfully!
========================================================
```

### 4.2. Full System Test Suite
- **Phase 4**: Individual Email & Core Architecture (20/20 Passed)
- **Phase 5**: Email Template Management & Versioning (20/20 Passed)
- **Phase 6**: Bulk Import Engine & Campaign Staging (30/30 Passed)
- **Phase 7**: Sequential Sending Queue & Concurrency Lock (40/40 Passed)
- **Phase 8**: Email Activity, Reconciled Reports & Formula Protection (56/56 Passed)
- **Total**: **166 / 166 Tests Passed (100% Pass Rate)**

### 4.3. Visual Quality Assurance Verification
A live browser subagent executed comprehensive visual testing at `http://localhost:5173`:
- Verified zero 404 errors and zero duplicate toasts.
- Verified Global Worker Engine banner displaying: `WORKER CONNECTED — READY`, `Node: worker-local-daemon-1`, `PostgreSQL Lease Generation: #1`, `Exclusive 1-Worker`.
- Verified Rate Lock displaying `Ready`.
- Verified In-Flight Spotlight displaying real recipient `Jordan Lee` at position `#1 of 45` with all 4 dispatch pipeline stages.
- Verified Sequential Delivery Policy displaying strict 5.0s interval and singleton lease `#1`.
- Captured visual evidence: `queue_and_preview_evidence/step_20_shot_1_sending-queue.png`.
