# SNPSUNEXUS Mail Studio — Gmail HTML Email Rendering, Template Pipeline & Live Preview Fix

## 1. Executive Summary

This report documents the root-cause audit, architectural fix, automated regression verification, and live Gmail inbox MIME inspection resolving the defect where Gmail received plain-text / minimal emails instead of the selected SNPSUNEXUS branded HTML card, showed unresolved `{{recipient_name}}` placeholders in the subject line, failed to display the official logo, and displayed `From: SNPSUNEXUS Mail Studio` instead of `From: SNPSUNEXUS`.

In addition, the frontend Live Email Preview in **Compose Email**, dashboard/footer logo placements, edge-to-edge template compilation, and logo transparency on dark navy surfaces were corrected.

---

## 2. Root Cause Analysis: Why Preview and Gmail Differed

Tracing the complete email path (`Email Templates -> Compose Email -> API -> Validator/Sanitizer -> Service -> Nodemailer -> Gmail SMTP -> Gmail INBOX`) exposed **six compounding defects**:

1. **Compose Email Discarded the Selected HTML Template (`src/views/ComposeEmailView.tsx`)**:
   - Even when `selectedComposeTemplateId` / `handleTemplateChange` populated `customHtmlTemplate`, `performLiveSend()` ignored `customHtmlTemplate` and `selectedTemplateId` completely.
   - Instead, `performLiveSend()` constructed a hardcoded 12-line HTML wrapper containing `${renderedMessage}` (the `text_content` plain text) under a basic `#172E58` header block reading `"SNPSUNEXUS / Mail Studio"`.
   - Furthermore, the Live Letterhead Preview on the right side of Compose Email rendered that plain text alongside `<BrandWordmark size="sm" />`, whose white text (`text-white`) became invisible on the white card background.
2. **Subject Line Passed Un-interpolated (`src/views/ComposeEmailView.tsx`)**:
   - `performLiveSend()` sent `subject: subject.trim()` directly without running placeholder substitution, causing literal `{{recipient_name}}` to appear in Gmail subject lines.
3. **Sender Identity Configured as `"SNPSUNEXUS Mail Studio"` (`backend/src/config/env.js`)**:
   - `config.senderName` was set to `'SNPSUNEXUS Mail Studio'`, causing Nodemailer to send `From: "SNPSUNEXUS Mail Studio" <snpsunexus@gmail.com>`. Similarly, Compose Email's envelope preview hardcoded `"From: SNPSUNEXUS Mail Studio"`.
4. **HTML Sanitizer Stripped Email Table Attributes & Leaked `<title>` Text (`backend/src/validators/emailValidator.js`)**:
   - `sanitize-html` lacked layout attributes (`width`, `cellpadding`, `cellspacing`, `border`, `valign`, `bgcolor`, `role`) on `table`, `td`, `th`, and `tr`.
   - `<title>SNPSUNEXUS Premium Notification Card</title>` was discarded as a tag without omitting its inner text node (`nonTextTags`), causing the title string to leak above the email table. It also stripped `<style>` responsive `@media` queries.
5. **Root-Relative Logo Broken in Email Clients & White Box on Dark Backgrounds (`public/assets/snpsunexus-logo.png`)**:
   - Saved HTML referenced `<img src="/assets/snpsunexus-logo.png">`. Root-relative URLs fail in Gmail (`mail.google.com`), so no logo appeared in received messages.
   - The PNG asset itself had opaque outer white corner pixels `(255, 255, 255, 255)`, producing a white box behind the shield logo inside dark navy `#172E58` footers and sidebars.
   - Secondary templates in `backend/src/repositories/templateRepository.js` and `DEFAULT_BRANDED_TEMPLATE` omitted the official logo completely.
6. **Edge Padding Mismatch & Missing Activity Sync**:
   - `renderBlocksToHtml()` placed the Hero Banner and Footer inside a `28px`-padded body cell rather than edge-to-edge full-width `<tr>` rows on the 600px card table.
   - In local fallback mode (when Supabase tables are absent), `emailRepository.js` recorded individual sends in private memory maps that were not merged into `activityRepository.js`.

---

## 3. Architectural & Code Corrections Implemented

### 3.1. Centralized Shared Rendering Engine (`backend/src/services/templateRenderer.js` + `backend/src/utils/emailHtmlSanitizer.js`)
- Created `backend/src/utils/emailHtmlSanitizer.js` exporting `sanitizeEmailHtml(html)`:
  - Enforces XSS safety (`<script>`, `<iframe>`, event handlers, `javascript:` URLs stripped; allows only `http`, `https`, `mailto`, `cid`).
  - Preserves email table attributes (`table`, `tr`, `td`, `th`), inline CSS, responsive `@media` styles (strictly sanitized against `@import`, `expression()`, `url()`), and sets `nonTextTags` including `'title'` so no `<head>`/`<title>` text ever leaks into email bodies.
  - Reconstructs clean `<!DOCTYPE html>` + `<head>` + `<body>` wrappers for structured email templates.
- Upgraded `backend/src/services/templateRenderer.js` with `renderEmailFromTemplate(...)`:
  - Resolves exact `templateId` + `templateVersion` via `getTemplateByIdAndVersion()` in `backend/src/repositories/templateRepository.js`.
  - Prevents silent fallback: if a requested template ID or version is missing, or if required HTML is missing/unusable after sanitization, throws explicit 404/422 errors (`TEMPLATE_NOT_FOUND`, `TEMPLATE_VERSION_NOT_FOUND`, `MISSING_HTML_CONTENT`).
  - Interpolates Subject (`sanitizeSubjectHeader`, CRLF-safe), HTML (`escapeHtml` / validated URLs), and Plain-Text fallback (`text_content` or clean `htmlToPlainTextFallback` with zero `====` divider strings).
  - Strictly rejects any unresolved `{{...}}` placeholders before dispatch (`UNRESOLVED_PLACEHOLDERS`).
- Shared across Previews (`templateController.js`), Individual Sends (`emailService.js`), and Bulk Queue (`queueService.js`).

### 3.2. Nodemailer Multipart/Alternative + Inline CID Logo Strategy (`backend/src/config/env.js`, `smtpService.js`, `emailService.js`)
- Changed `config.senderName` in `backend/src/config/env.js` to `'SNPSUNEXUS'`.
- Implemented `prepareOutgoingHtmlAndAssets(html)` in `backend/src/services/smtpService.js`:
  - Rewrites `/assets/snpsunexus-logo.png` references to `cid:snpsunexus-logo@snpsunexus`.
  - Attaches `public/assets/snpsunexus-logo.png` with `cid: 'snpsunexus-logo@snpsunexus'`, `contentType: 'image/png'`, `contentDisposition: 'inline'`.
  - Dispatches multipart MIME containing both `text` (`text/plain`) and `html` (`text/html`) + inline PNG logo (`multipart/related`).
- Added correlation ID and safe non-PII `mime_diagnostics` (`template_id`, `template_version`, `html_bytes`, `text_bytes`, `has_inline_logo`, `rendering_outcome`) in `emailService.js`.

### 3.3. Template Selection, Exact Version Flow & Live Preview (`src/views/ComposeEmailView.tsx`, `src/context/AppContext.tsx`, `src/views/EmailTemplatesView.tsx`)
- Tracked both `selectedComposeTemplateId` and `selectedComposeTemplateVersion` through `AppContext.tsx`.
- Clicking **Use in Compose Email** loads the exact saved template version (`TemplateService.getTemplateById`), displays the active HTML template safeguard notice, and populates **Designation / Role** and **Action / Portal Link** fields.
- **Compose Email Live View (`Live Email Preview`)**:
  - Updated `From:` envelope preview strictly to **`SNPSUNEXUS`**.
  - Displays live interpolated **Subject** header.
  - Renders the actual interpolated HTML card inside an isolated `<iframe srcDoc={renderedLiveHtml} sandbox="allow-same-origin" />`.
- **Activity Reconciliation (`backend/src/repositories/emailRepository.js`, `activityRepository.js`)**:
  - Exported `getInMemoryEmailRecords()` and merged into `activityRepository.js` so individual dispatches appear immediately in Email Activity and Dashboard Recent Activity in local mode.

### 3.4. Official Brand Logo Coverage & Edge-to-Edge Design Fidelity
- Removed opaque outer white corner pixels on `public/assets/snpsunexus-logo.png` (preserving the shield emblem interior pixels cleanly) so dark navy backgrounds render the shield seamlessly without a white box.
- Added `theme?: 'dark' | 'light'` to `src/components/common/BrandWordmark.tsx` (fixing white-on-white invisible wordmark text on light cards).
- Integrated the official SNPSUNEXUS logo in:
  - `src/views/DashboardView.tsx` (Welcome Banner)
  - `src/components/layout/Header.tsx` (Mobile breadcrumb)
  - `src/App.tsx` (Application Footer)
  - `index.html` (Favicon)
  - `DEFAULT_BRANDED_TEMPLATE` (`backend/src/services/brandedTemplate.js`) & all starter templates (`backend/src/repositories/templateRepository.js`)
  - Updated `src/services/templateHtmlGenerator.ts` (`compileBlocksToTableRows`) so Hero Banner and Footer blocks render full-width edge-to-edge on the 600px card table cleanly.

---

## 4. Verification: Mocked Tests vs. Live Gmail Verification

### 4.1. Automated Mocked & Integration Test Results
- **TypeScript & Vite Production Build** (`npm run build`): Passed cleanly (2,266 modules, 0 errors).
- **New Gmail HTML Rendering & MIME Suite** (`node backend/tests/gmail-rendering.test.js`): **10 / 10 Passed**.
  - Verified `"SNPSUNEXUS"` sender identity, exact version loading, subject interpolation, XSS & unsafe URL filtering while retaining table attributes/CSS, `cid:snpsunexus-logo@snpsunexus` rewriting & PNG attachment, raw Nodemailer `streamTransport` MIME parts, strict rejection of missing versions/HTML/unresolved placeholders, idempotency replay, and Activity synchronization.
- **Full Existing Automated Suite** (`node backend/tests/run-full-suite.js`): **166 / 166 Passed** across Phases 4, 5, 6, 7, and 8.

### 4.2. Controlled Real Gmail Delivery & IMAP Inbox Verification
- Dispatched **one controlled live test email** via `POST http://localhost:4000/api/emails/send` using template `e5f6a7b8-c9d0-41e2-f3a4-b5c6d7e8f9a0` (`SNPSUNEXUS Premium Notification Card`, v1) to the authorized test inbox `snpsunexus@gmail.com` (`Arjun Sharma`).
- **API Result**: HTTP `200`, `status: "accepted_by_smtp"`, `Message-ID: <71452561-b9c7-f5f9-5659-655199e745cd@gmail.com>`.
- **Direct Gmail INBOX IMAP Inspection (`imap.gmail.com:993`)**:
  - `From`: `SNPSUNEXUS <snpsunexus@gmail.com>`
  - `To`: `Arjun Sharma <snpsunexus@gmail.com>`
  - `Subject`: `Official Semester Examination Admit Card & Schedule (v1) — Arjun Sharma` (zero literal `{{recipient_name}}`)
  - `Content-Type`: `multipart/alternative` containing:
    - `text/plain` (728 bytes, readable fallback without `====` lines)
    - `multipart/related` containing:
      - `text/html` (11,880 bytes starting with `<!DOCTYPE html>`, containing `#172E58` Hero Banner, `"Your Details"` info card, `https://snpsunexus.in/exam/admit-card` CTA button, dark navy footer, `2` references to `cid:snpsunexus-logo@snpsunexus`, and zero unresolved `{{` tokens)
      - `image/png` (`Content-Disposition: inline; filename=snpsunexus-logo.png`, `Content-ID: <snpsunexus-logo@snpsunexus>`)
- **Email Activity UI Verification**: Verified `<71452561-b9c7-f5f9-5659-655199e745cd@gmail.com>` rendered in Dashboard Recent Activity and Email Dispatch Ledger (`Accepted by SMTP`).

### 4.3. Visual Browser QA Evidence (`http://localhost:5173`)
Captured during end-to-end visual inspection:
- `gmail_fix_evidence/step_2_shot_1.png`: Dashboard Welcome Banner, Sidebar seamless shield logo, and metrics.
- `gmail_fix_evidence/step_4_shot_1.png`: Application Footer logo and live Recent Activity record for `Arjun Sharma`.
- `gmail_fix_evidence/step_8_shot_1.png` & `step_14_shot_1.png`: Email Templates Preview Desktop (edge-to-edge Hero Banner and seamless dark Footer shield logo).
- `gmail_fix_evidence/step_18_shot_1.png` & `step_16_shot_1.png`: Email Templates Preview Mobile 375px stacking.
- `gmail_fix_evidence/step_20_shot_1.png`, `step_22_shot_1.png`, `step_22_shot_2.png`: Compose Email Live View showing `From: SNPSUNEXUS`, resolved subject, active HTML template banner, and full interactive SNPSUNEXUS Premium Card inside the live iframe.
- `gmail_fix_evidence/step_24_shot_1.png`: Email Activity ledger displaying the live Gmail dispatch.

---

## 5. Files Changed

| Area | File Path | Summary |
|---|---|---|
| Asset & Brand UI | `public/assets/snpsunexus-logo.png`, `index.html`, `src/components/common/BrandWordmark.tsx`, `src/views/DashboardView.tsx`, `src/components/layout/Header.tsx`, `src/App.tsx` | Removed opaque outer corners on shield logo; added theme prop to BrandWordmark; added official logo to Dashboard banner, mobile Header, Footer, Favicon |
| Backend Sanitizer & Renderer | `backend/src/utils/emailHtmlSanitizer.js`, `backend/src/services/templateRenderer.js`, `backend/src/validators/emailValidator.js`, `backend/src/validators/templateValidator.js` | Unified XSS-safe HTML sanitization keeping table layouts & responsive CSS, prevented `<title>` text leakage, enforced strict placeholder & no-silent-fallback validation |
| Sender & SMTP Assets | `backend/src/config/env.js`, `backend/src/services/smtpService.js`, `backend/src/services/emailService.js` | Set `senderName = 'SNPSUNEXUS'`; rewrote logo src to inline `cid:snpsunexus-logo@snpsunexus` PNG attachment; wired `executeSendIndividualEmail` through shared `renderEmailFromTemplate` |
| Templates & Queue | `backend/src/services/brandedTemplate.js`, `backend/src/repositories/templateRepository.js`, `backend/src/repositories/importRepository.js`, `backend/src/controllers/templateController.js`, `backend/src/queue/queueService.js`, `backend/src/queue/queueRepository.js` | Upgraded all starter templates with official logo & SNPSUNEXUS branding; exact version lookup helper; unified bulk queue renderer; removed `====` text separators |
| Compose & Activity | `src/views/ComposeEmailView.tsx`, `src/views/EmailTemplatesView.tsx`, `src/views/BulkImportView.tsx`, `src/context/AppContext.tsx`, `src/services/templateService.ts`, `src/services/templateHtmlGenerator.ts`, `backend/src/repositories/emailRepository.js`, `backend/src/repositories/activityRepository.js` | Passed `template_id` & `template_version` end-to-end; fixed `From: SNPSUNEXUS`; replaced hardcoded plain box with live iframe HTML preview & full template dispatch; edge-to-edge HTML block compiler; synced live sends into Activity |
| Tests | `backend/tests/gmail-rendering.test.js`, `backend/tests/run-all-tests.js` | Added 10 Gmail MIME/HTML rendering tests; updated `senderName` expectation to `'SNPSUNEXUS'` |

---

## 6. Known Environment Notes
- In this development workspace, Supabase PostgREST schema returns `PGRST205` for unmigrated tables (`email_templates`, `campaigns`, `queue_worker_state`), so repositories cleanly operate on their dual-mode in-memory stores. Applying the Supabase SQL schema migrations in production will switch persistence seamlessly to PostgreSQL without code changes.
