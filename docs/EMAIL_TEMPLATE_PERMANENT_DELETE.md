# Email Template Permanent Deletion Feature

**Feature:** Real Permanent Deletion of Email Templates (`DELETE /api/templates/:id`) alongside Soft Archive / Restore  
**Scope:** PostgreSQL Migration & Atomic RPC, Backend API, Frontend UI, Draft Safeguards, and Automated Tests

---

## 1. Archive vs Permanent Delete Design

SNPSUNEXUS Mail Studio previously aliased `deleteTemplate = archiveTemplate`, meaning administrators could only soft-archive templates (`PATCH /api/templates/:id/archive`). The application now separates both workflows cleanly:

- **Archive / Restore (`PATCH /api/templates/:id/archive`, `PATCH /api/templates/:id/restore`):** Reversible soft-delete moving templates between the **Active** and **Archived** tabs while keeping them restorable.
- **Permanent Delete (`DELETE /api/templates/:id`):** Permanently removes the `public.email_templates` row and cascades owned `public.template_versions` rows inside an atomic transaction while strictly protecting historical campaigns, recipients, delivery attempts, and audit trails.

---

## 2. Database & Snapshot Integrity Architecture

### Migration (`supabase/migrations/20261127000009_template_permanent_delete.sql` & `supabase/consolidated_schema_migration.sql`)
- Added stored procedure `public.delete_email_template_permanently(p_template_id UUID, p_admin_id UUID DEFAULT NULL)`:
  1. Validates `p_template_id` (`400 INVALID_TEMPLATE_ID` if null).
  2. Locks target `public.email_templates` row `FOR UPDATE` (`404 TEMPLATE_NOT_FOUND` if missing or already deleted).
  3. Locks all referencing `public.campaigns` rows (`WHERE template_id = p_template_id FOR UPDATE`) and checks snapshot completeness.
  4. Blocks deletion (`409 TEMPLATE_IN_USE_WITHOUT_SNAPSHOT`) if any referencing campaign lacks a complete immutable `template_snapshot` (`subject` + `html_content` or `text_content`), preventing breakage of un-snapshotted/legacy dispatches without ever cascade-deleting campaigns.
  5. For safe snapshotted campaigns, explicitly sets `campaigns.template_id = NULL` (`ON DELETE SET NULL` semantics preserved, keeping `template_version`, `template_snapshot`, `campaign_recipients`, and `email_attempts` completely intact).
  6. Deletes the row from `public.email_templates` (cascading owned `public.template_versions` via foreign key `ON DELETE CASCADE`).
  7. Inserts a non-PII `template_permanently_deleted` audit record into `public.queue_events` containing `template_id`, `template_name`, `template_version`, `detached_campaigns`, `deleted_versions`, and `actor_id` (storing neither raw template HTML nor recipient PII).
  8. Restricts RPC execution via `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO service_role;`.

### Individual Send Snapshot Continuity
- Updated `renderEmailFromTemplate` (`backend/src/services/templateRenderer.js`), `executeSendIndividualEmail` (`backend/src/services/emailService.js`), and `initializeIndividualEmailRecords` (`backend/src/repositories/emailRepository.js`) so individual template-backed sends also persist `template_id`, `template_version`, and `template_snapshot` on `public.campaigns`. Thus both bulk and individual dispatches retain self-contained historical snapshots when a template is later deleted.

---

## 3. Backend API (`DELETE /api/templates/:id`)

- **Route (`backend/src/routes/templateRoutes.js`):** `DELETE /templates/:id` guarded by `requireAdminAuth`.
- **Controller (`backend/src/controllers/templateController.js`):** `deleteTemplate` explicitly rejects forged client-supplied `admin_id` in request bodies (`400 FORBIDDEN_ACTOR_OVERRIDE`) and derives actor identity strictly from verified `req.user?.id`.
- **Repository (`backend/src/repositories/templateRepository.js`):** `permanentDeleteTemplate(id, userId)` validates UUID format (`400 INVALID_TEMPLATE_ID`), invokes `delete_email_template_permanently` RPC, falls back safely to equivalent checked multi-step deletion only on `PGRST202` (RPC not yet applied), and maps missing templates (`404`) and unsafe dependencies (`409`).

---

## 4. Frontend Workflow & Draft Safeguards

- **API Client (`src/services/templateService.ts`):** Added `TemplateService.deleteTemplatePermanently(id)` (`DELETE /templates/${id}`).
- **App State (`src/context/AppContext.tsx`):** Separated `deleteTemplate` (`TemplateService.deleteTemplatePermanently`) from `archiveTemplate`. On success, removes the template immediately from `templates` state, displays confirmation toast, and synchronizes with backend (`refreshTemplates()`). On `409` or failure, keeps the template intact and surfaces the backend safety explanation; on `404`, reconciles local state cleanly.
- **Templates UI (`src/views/EmailTemplatesView.tsx`):**
  - Added Delete button (`Trash2` icon) on both active and archived template cards.
  - Added **Permanently Delete Template?** `<Modal>` displaying template name, current version, irreversible warning, historical snapshot safety explanation, typed template-name confirmation requirement when `usageCount > 0`, inline error box on blocked deletion (`409`), loading state, and disabled controls preventing duplicate submissions.
- **Compose Email Safeguard (`src/views/ComposeEmailView.tsx`) & Bulk Import (`src/views/BulkImportView.tsx`):**
  - If an attached template in **Compose Email** is permanently deleted from **Email Templates** (once `templateLoadState.status === 'loaded'`), clears `selectedTemplateId` / `selectedTemplateVersion` / `selectedTemplateName` while preserving `subject`, `messageBody`, and `customHtmlTemplate` as custom draft content, displaying an inline amber notice and warning toast.
  - Updated `BulkImportView` to re-synchronize `selectedTemplateId` cleanly when the currently selected template is deleted.

---

## 5. Automated Verification Coverage

Added 12 new tests (`backend/tests/template.test.js` Tests 21–31 and `backend/tests/production-api-verification.test.js` Test 14), verified cleanly inside `node backend/tests/run-full-suite.js` (**220/220 tests passing across 9 suites**):

- Rejects unauthenticated `DELETE /api/templates/:id` (`401 UNAUTHORIZED`).
- Rejects non-admin forged `user_metadata.role = 'administrator'` token (`403 FORBIDDEN`).
- Rejects invalid UUID format cleanly (`400 INVALID_TEMPLATE_ID`).
- Returns `404 TEMPLATE_NOT_FOUND` on unknown valid UUID and repeated `DELETE` / `GET`.
- Rejects client-supplied `admin_id` override in request body (`400 FORBIDDEN_ACTOR_OVERRIDE`).
- Deletes active and archived templates, cascades owned `template_versions`, preserves unrelated templates, and records non-PII `template_permanently_deleted` audit event in `queue_events`.
- Preserves historical `campaigns` (detaching `template_id` to `null` while keeping `template_snapshot`), `campaign_recipients`, and `email_attempts` intact.
- Blocks deletion (`409 TEMPLATE_IN_USE_WITHOUT_SNAPSHOT`) when a linked campaign lacks a complete immutable `template_snapshot`.
- Verifies safe repository fallback path (`PGRST202` when RPC is not yet created).
