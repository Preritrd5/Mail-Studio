# Live Email Preview Synchronization, Responsive Toggle & Global Loading System

## 1. Root Cause Summary

Previously, the Compose Email view exhibited two critical UX defects alongside inconsistent asynchronous loading states:

1. **Readymade Template & Live Preview Desynchronization**:
   - The HTML preview state was derived from raw template HTML and separate inputs while template selection/editing diverged from what the administrator edited in Compose Email (`Email Subject Line`, `Email Message Content`, recipient details).
   - Server-side rendering (`backend/src/services/templateRenderer.js`, `backend/src/services/emailService.js`, `backend/src/controllers/templateController.js`) also prioritized database template content over edited draft payloads in preview/dispatch flows when a saved template ID was attached.
2. **Compose Header Toggle Visibility**:
   - The `Editor | Live Preview` mode switcher was rendered on large desktop viewports (`>= 1024px`) where both panels are already displayed simultaneously side-by-side.
3. **HTML Block Parser on Card Templates**:
   - `src/services/templateHtmlParser.ts` queried `.main-container` but saved SNPSUNEXUS card templates (such as `Offical Notification`) use `table.email-container`, causing templates opened for editing in `EmailTemplatesView` to risk falling back to raw HTML source instead of structured Visual Block Builder blocks.

## 2. Implemented Changes

### Authoritative Compose Draft State & Real-Time Synchronization
- **Single Shared Draft State ([ComposeEmailView.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/views/ComposeEmailView.tsx))**:
  - Consolidated Compose state into one authoritative `ComposeDraftState` (`draft`) holding `recipientName`, `recipient`, `designation`, `activationLink`, `subject`, `messageBody`, `selectedTemplateId`, `selectedTemplateVersion`, `selectedTemplateName`, `baseTemplateHtml`, and `bodyEditedAfterTemplateLoad`.
  - Restored and preserved the original two-column Image 1 / Image 2 layout of `ComposeEmailView` (`Message Composition` on the left, `Live Email Preview` with `SMTP Envelope Preview` and branded card preview on the right).
- **Template Body Sync Pipeline ([templateBodySync.ts](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/services/templateBodySync.ts))**:
  - Added `extractEditableMessageFromTemplateHtml` to extract editable copy inside `.email-content-padding` / container cells when a saved template is loaded into Compose.
  - Added `syncMessageBodyIntoTemplateHtml` so edits typed into `Email Message Content` update the HTML preview live—even when a readymade template is active—while preserving the branded header, hero banner (if any), structured info cards, CTA buttons, signature, and dark-navy footer.
- **Zero-Flicker Frame Updates ([EmailPreviewFrame.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/components/common/EmailPreviewFrame.tsx))**:
  - Updates `#preview-email-css` and `#preview-email-root` in-place while preserving scroll position, with `seamless` mode for Compose Email's card container.
- **Server-Side Render Parity ([templateRenderer.js](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/backend/src/services/templateRenderer.js), [emailService.js](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/backend/src/services/emailService.js), [templateController.js](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/backend/src/controllers/templateController.js))**:
  - `renderEmailFromTemplate` honors explicit non-empty `subjectOverride`, `htmlOverride`, and `textOverride` over stored DB template copy while retaining `templateId`, `templateVersion`, and `templateSnapshot` audit traceability.
  - `executeSendIndividualEmail` passes `html_content` and `text_content` overrides from Compose directly to `renderEmailFromTemplate`, verified across the 8 tests in [live-preview-sync.test.js](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/backend/tests/live-preview-sync.test.js).

### Email Template Block Builder Parser Fix
- **[templateHtmlParser.ts](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/services/templateHtmlParser.ts)**:
  - Updated container matching in `parseHtmlToBlocks` to query `table.email-container, .email-container, table.main-container, .main-container` so saved card templates (e.g., `Offical Notification`) parse cleanly into structured Block Builder elements (`Heading`, `Paragraph`, `Signature`, `Footer`) inside `EmailTemplatesView`.

### Responsive Compose Header Toggle (`>= 1024px` Hidden vs `< 1024px` Visible)
- **[ComposeEmailView.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/views/ComposeEmailView.tsx)**:
  - Tracks `window.matchMedia('(min-width: 1024px)')` via `isDesktopViewport`.
  - Above `1024px`, `[data-testid="compose-mobile-panel-toggle"]` (`Editor | Live Preview`) is excluded from the DOM (`count === 0`) with zero layout spacer gap, showing both `[data-testid="compose-editor-panel"]` and `[data-testid="compose-preview-panel"]` side-by-side.
  - Below `1024px`, the `Editor | Live Preview` segmented toggle appears and switches between panels without clearing or resetting `draft`.

### Global Loading System Across All 7 Sections
- **Logo Integrity ([index.css](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/index.css), [Loading.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/components/common/Loading.tsx))**:
  - Official `/assets/snpsunexus-logo.png` images remain strictly static (`animationName: none` verified across sidebar, banners, preview header/footer, and page footer).
- **Reusable Loaders & Timeout/Abort Safety ([Loading.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/components/common/Loading.tsx), [useLoadingState.ts](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/hooks/useLoadingState.ts), [apiConfig.ts](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/services/apiConfig.ts), [Button.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/components/common/Button.tsx), [StateNotice.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/components/common/StateNotice.tsx))**:
  - Added `.snpsu-spinner` and `.snpsu-skeleton` CSS keyframes with `@media (prefers-reduced-motion: reduce)` fallbacks.
  - Provided `LoadingSpinner` (`sm` 18px, `md` 32px, `lg` 48px), `ButtonLoader`, `SyncStatusPill`, `PageLoader`, `CardSkeleton`, `TableSkeleton`, and `ProgressIndicator` (paired with XHR `upload.onprogress` in `BulkImportView`) across Dashboard, Compose Email, Bulk Import, Sending Queue, Email Activity, Email Templates, and Reports.

## 3. Verification Results

- **TypeScript & Vite Production Build**: `npx tsc --noEmit` and `npm run build` completed cleanly with zero errors.
- **Full Backend Regression Suite**: `node backend/tests/run-full-suite.js` passed **229 / 229 tests across 10 suites** (including all 8 tests in `live-preview-sync.test.js`).
- **Live Browser Verification (`http://localhost:5173`) Across 9 Viewports**:
  - **Desktop (`>= 1024px`)** tested at `1920x1080`, `1440x900`, `1366x768`, `1280x800`, and `1024x768`: toggle element count `0 / 0 / 0` in DOM, both Editor & Preview panels visible side-by-side, `Clear` and `Dispatch Email` visible, live typing reflected immediately in SMTP Envelope Preview and preview iframe (`10 words • 93 characters`, `Aarav Sharma`, `Coordinator`, `Urgent Portal Update for Aarav Sharma`). *(Note: inside the `1024x768` split pane at `337.2px` width, the `600px` email card scrolls horizontally inside the preview iframe while the outer viewport has zero horizontal overflow.)*
  - **Tablet & Mobile (`< 1024px`)** tested at `768x900`, `430x844`, `375x812`, and `320x640`: `Editor | Live Preview` toggle visible (`1 / 1 / 1`), single panel displayed cleanly at a time, switching tabs and resizing back to `1280x800` preserved all unsaved draft fields without horizontal page overflow.
  - **Navigation & Reduced Motion**: All 7 sidebar sections settled without stuck loaders, `+ Create New Template` opened cleanly in Block Builder mode matching the original modal layout, and `@media (prefers-reduced-motion: reduce)` CSS rules were confirmed active.
