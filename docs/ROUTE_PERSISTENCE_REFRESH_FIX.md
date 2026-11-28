# Route Persistence, Authentication Initialization & Email Greeting Formatting Fix

**Application:** SNPSUNEXUS Mail Studio  
**Branch / Commit:** `main` (`1fedaf8` for implementation; this document follows)  
**Deployed URL:** `https://emaildraft.vercel.app`

---

## 1. Root Cause Analysis

1. **Client-Side State Only (No URL Routing):**
   - `src/context/AppContext.tsx` previously initialized `const [activeSection, setActiveSection] = useState<NavigationSection>('dashboard')` and changed views strictly in React memory (`setActiveSection`).
   - Navigating between Compose Email, Bulk Import, Sending Queue, Email Activity, Email Templates, and Reports left the browser address bar stuck at `/`.
   - Any browser refresh or direct route visit re-initialized React state to `'dashboard'`, returning the administrator to the Dashboard.
2. **Missing Centralized Auth Initialization / Route Guard Boundary:**
   - Views mounted directly before Supabase session restoration and `/api/auth/session` administrator verification settled, while login/logout mutations shared the same `isLoading` boolean used by session restoration.
   - There was no `/login?redirect=...` guard returning administrators to their originally requested page or isolating expired/unauthorized states cleanly without route flickering.
3. **Inconsistent Greeting Formatting:**
   - `getBlankTemplateBlocks()` in `src/services/templateHtmlGenerator.ts` combined `Hello {{recipient_name}},\n\nWrite your message here...` inside one `<p>` block (collapsing newlines in HTML).
   - `syncMessageBodyIntoTemplateHtml()` (`src/services/templateBodySync.ts`) wrote plain `TextNode` lines, stripping `<strong>` from `{{recipient_name}}` and keeping inline `"Hello <Name>, <Body>"` text on the same line.
   - `ComposeEmailView.tsx` free-form HTML builder used `<br>` instead of separate `<p>` blocks, and backend `templateRenderer.js` did not split inline `"Hello <Name>, <Body>"` strings into separate paragraphs/lines.

---

## 2. Authentication Restoration Changes

- **`src/context/AuthContext.tsx` & `src/services/authService.ts`:**
  - Separated startup session restoration (`isInitializing`) from interactive login/logout mutations (`isMutatingAuth`, exposed together cleanly as `isLoading` for callers).
  - Kept `isInitializing = true` until both `supabase.auth.getSession()` and backend `/api/auth/session` administrator verification complete.
  - Added `statusCode` classification in `AuthService.verifyAdminStatus()`: HTTP `401` marks `sessionExpired = true` and clears the invalid session cleanly; authenticated non-admin accounts retain `isAdmin = false` and surface `authError` without granting access to protected sections.
  - Preserved current URL state during `TOKEN_REFRESHED` / `USER_UPDATED` events without resetting `isInitializing` or triggering redirects.
- **`src/components/auth/ProtectedRoute.tsx` & `src/views/LoginView.tsx`:**
  - Centralized `<ProtectedRoute />` blocks protected content while `isInitializing === true` with `<AuthRestorationScreen />` (using `LoadingSpinner` and static SNPSUNEXUS logo — no Dashboard or Login flash).
  - Unauthenticated or expired sessions redirect to `/login?redirect=<encoded pathname + search + hash>`, preventing open redirects via `getSafeRedirectTarget()`.
  - After administrator authentication on `/login`, the user is navigated directly back to the decoded `redirect` target (`replace: true`).

---

## 3. Router & State Persistence Changes

- **`react-router-dom` (`^6.28.0`)** added in `package.json` and wrapped around `App.tsx` via `<BrowserRouter>`.
- **`src/routes/routeConfig.ts`** maps canonical routes and aliases:
  - `/dashboard` (plus `/` redirect preserving query params and hash)
  - `/compose`
  - `/bulk-import`
  - `/queue` (alias `/sending-queue`)
  - `/activity` (alias `/email-activity`)
  - `/templates` (alias `/email-templates`)
  - `/reports`
  - `/login`
  - Supports nested routes (`/*`) and Back/Forward history without defaulting back to Dashboard on reload.
- **Per-Route State & Draft Preservation:**
  - **`src/hooks/useUrlQueryState.ts`:** Preserves query parameters and `location.hash` across filter/pagination updates.
  - **`EmailActivityView.tsx`:** Syncs `search`, `status`, `type`, `date`, `sort`, `order`, and `page` in URL search parameters.
  - **`EmailTemplatesView.tsx`:** Syncs `status`, `category`, and `search` in URL search parameters.
  - **`ReportsView.tsx` & `AppContext.tsx`:** Syncs `campaign`, `status`, and `range` (`DateRange`, also stored in `sessionStorage` as non-secret preference).
  - **`SendingQueueView.tsx`:** Syncs selected `campaign` ID in URL search parameters and restores backend queue state without auto-restarting paused/idle dispatches.
  - **`ComposeEmailView.tsx`:** Saves non-secret editor draft fields in `sessionStorage` (`snpsunexus_compose_draft_v1`), cleared on explicit reset, never storing auth tokens and never auto-sending on refresh.

---

## 4. Vercel SPA Routing Configuration

- Inspected `vercel.json` (`rewrites`):
  - `/api/(.*)` -> `/api/index.js` preserved untouched.
  - `/((?!api/|assets/|favicon\\.ico|.*\\..*).*)` -> `/index.html` already routes direct SPA paths (`/compose`, `/bulk-import`, `/queue`, `/activity`, `/templates`, `/reports`, `/login`, and nested subpaths) to the React entrypoint without redirect loops or breaking `/api/*` and `/assets/*`. No conflicting Vercel rewrite modification was required.

---

## 5. Email Greeting Formatting Fixes

- **`src/services/greetingFormatter.ts`, `src/services/templateHtmlGenerator.ts`, `src/services/templateBodySync.ts`, `src/views/ComposeEmailView.tsx`:**
  - Separated greeting and body paragraphs across block templates, block-to-HTML rendering, template body sync, and free-form composition (`<p>Hello <strong>{{recipient_name}}</strong>,</p>` followed by a separate message `<p>`).
  - Kept `"Hello"` and `,` in normal font weight with only the recipient name bolded, handled missing recipient names gracefully (`Hello,`), avoided duplicating greetings if a template already has one, and separated plain-text greeting and body across lines.
- **`backend/src/services/templateRenderer.js`:**
  - Added `normalizeLeadingGreetingHtml()` and `normalizeGreetingPlainText()` plus `\n\n` paragraph breaks between `</p><p>` in `htmlToPlainTextFallback()`, ensuring Preview API, Individual Dispatch, and Bulk Queue share identical HTML and plain-text formatting.

---

## 6. Files Modified

- `package.json`, `package-lock.json`
- `src/App.tsx`
- `src/routes/routeConfig.ts` *(new)*
- `src/context/AuthContext.tsx`
- `src/services/authService.ts`
- `src/components/auth/ProtectedRoute.tsx` *(new)*
- `src/views/LoginView.tsx` *(new)*
- `src/context/AppContext.tsx`
- `src/hooks/useUrlQueryState.ts` *(new)*
- `src/views/ComposeEmailView.tsx`
- `src/views/EmailActivityView.tsx`
- `src/views/EmailTemplatesView.tsx`
- `src/views/ReportsView.tsx`
- `src/views/SendingQueueView.tsx`
- `src/services/greetingFormatter.ts` *(new)*
- `src/services/templateBodySync.ts`
- `src/services/templateHtmlGenerator.ts`
- `backend/src/services/templateRenderer.js`
- `backend/tests/live-preview-sync.test.js`

---

## 7. Local Test Results

- **`npm run build` (`tsc && vite build`):** Passed (`✓ built in 24.08s`, `2282` modules).
- **`node backend/tests/run-full-suite.js`:** Passed all 10 suites (`0` failures; includes 10/10 tests in Live Email Preview Synchronization & Shared Render Parity covering greeting separation and missing-name handling).
- **Local Chromium Verification (`http://localhost:5173`, `1280x800`):**
  - Confirmed HTTP `200` on `/api/health` and `/compose`.
  - Verified `/compose?tab=preview#draft`, `/bulk-import`, `/queue?campaign=batch-1`, `/activity?status=failed&page=2`, `/templates?category=Notifications`, `/reports?range=30d`, and `/dashboard` preserve exact URLs in `/login?redirect=...` before and after browser reload, with Back/Forward navigation working cleanly, `0` console errors, and `0` failed network requests.

---

## 8. Production Test Results (`https://emaildraft.vercel.app`)

- Verified live commit `1fedaf8` (`assets/index-CHFDUnV5.js`, HTTP `200` on `/compose` and `/api/health`).
- **Chromium Verification on `https://emaildraft.vercel.app` (`1280x800`):**
  - Tested `/compose?tab=preview#draft`, `/compose`, `/bulk-import`, `/queue`, `/activity?status=failed&page=2`, `/templates`, `/templates/sample-id`, `/reports?range=30d`, and `/dashboard`.
  - Every route loaded with HTTP `200`, never flashed Dashboard, redirected cleanly to `/login?redirect=...` preserving pathname, query params, hash, and nested paths, maintained identical URLs after browser reload, and navigated cleanly with browser Back/Forward buttons.
  - `0` console errors and `0` failed network requests (`HTTP >= 400`).

---

## 9. Remaining Issues & Verification Scope Note

- Automated Chromium verification ran unauthenticated (no administrator credentials stored in automation scripts), verifying auth initialization, `/login?redirect=...` preservation, SPA rewrites, Back/Forward history, and zero Dashboard flash across both localhost and Vercel production. Interactive post-login reload while holding an active Supabase admin session and live Gmail delivery inspection in an inbox should be confirmed once signed in as your administrator account.
