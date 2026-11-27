# PHASE 5 — EMAIL TEMPLATE MANAGEMENT SPECIFICATION
## SNPSUNEXUS MAIL STUDIO
### Administrator Email Management Platform for Sapthagiri NPS University

---

## 1. Executive Summary

Phase 5 establishes a complete, secure, reusable **Email Template Management System** for **SNPSUNEXUS Mail Studio**. The system connects the React frontend, Express.js backend API, and Supabase PostgreSQL database into a unified workflow supporting visual template design, HTML source editing, immutable version snapshotting, dynamic merge placeholder interpolation, realistic responsive previewing (desktop & mobile), and soft-delete archival for audit compliance.

### Key Milestones Delivered
1. **Database Schema & Versioning Migration**: Additive migration adding `category`, `version`, `updated_by`, and `archived_at` to `email_templates`, plus a dedicated `template_versions` table with unique constraint `(template_id, version)` and Row Level Security (RLS).
2. **Centralized Placeholder Registry**: Formal registry supporting 6 standard merge tokens (`{{recipient_name}}`, `{{recipient_email}}`, `{{institution_name}}`, `{{designation}}`, `{{activation_link}}`, `{{current_year}}`) with token metadata, sample values, and strict HTTPS URL validation.
3. **Safe Rendering & XSS Protection**: HTML entity escaping of dynamic user data, allowlist-based HTML sanitization (`sanitize-html`), detection and flagging of unsupported placeholder tokens, and plain-text fallback generation.
4. **Institutional Pre-Seeded Template**: Official institutional circular envelope utilizing the locked SNPSUNEXUS brand palette (Deep Navy `#172E58`, Royal Blue `#1456AD`, Gold `#C69A4C`, Light Grey `#F4F6FA`, White `#FFFFFF`, Text `#1E293B`, Muted `#64748B`).
5. **Express RESTful API**: Protected CRUD routes mounted at `/api/templates` with administrator authorization middleware (`requireAdminAuth`), duplicate, archive, restore, and safe preview endpoints.
6. **Frontend Template Gallery & Editor (`EmailTemplatesView.tsx`)**:
   - Status tabs: **Active Templates** vs **Archived Templates** with live counter badges.
   - Category filter pills: All, Examinations, Fees, Admissions, Notifications, Faculty.
   - Real-time search across titles, descriptions, and subject lines.
   - Dual-mode editor: Visual formatted layout controls + HTML source code textarea.
   - One-click placeholder quick-insert toolbar.
   - Responsive realistic preview drawer (Desktop 650px vs Mobile 375px; HTML vs Plain Text).
   - Version history and immutable snapshot inspection drawer.
7. **Compose Email Integration (`ComposeEmailView.tsx`)**: Dynamic active template selection with auto-population of subject, plain text body, and HTML template envelope.
8. **100% Automated Test Pass Rate**: All 20 Phase 5 template tests passed, all 20 Phase 4 regression tests passed, and Vite + TypeScript production build succeeded with 0 errors.

---

## 2. Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                            REACT FRONTEND (Vite / TS)                             |
|                                                                                   |
|  [EmailTemplatesView]           [ComposeEmailView]           [AppContext]        |
|  - Gallery (Active/Archived)    - Dynamic Dropdown           - State Management   |
|  - Visual / HTML Editor         - Token Interpolation        - Template CRUD Sync |
|  - Responsive Preview           - SMTP Dispatch Trigger      - Optimistic Updates |
+------------------------------------------+----------------------------------------+
                                           | HTTP Authorization: Bearer <JWT>
                                           v
+-----------------------------------------------------------------------------------+
|                             EXPRESS.JS BACKEND (Node.js)                          |
|                                                                                   |
|  [requireAdminAuth] ----------> [templateController] --------> [templateValidator]|
|  - Supabase JWT Verification    - listTemplates               - Zod Schema Check  |
|  - Certified Admin Check        - getTemplateById             - XSS Sanitization  |
|                                 - createTemplate              - URL Validation    |
|                                 - updateTemplate (v+1)        - Token Detection   |
|                                 - duplicateTemplate                               |
|                                 - archiveTemplate / restore                       |
|                                 - previewTemplate                                 |
+------------------------------------------+----------------------------------------+
                                           | Supabase Service Role Client
                                           v
+-----------------------------------------------------------------------------------+
|                            SUPABASE POSTGRESQL DATABASE                           |
|                                                                                   |
|  [public.email_templates]                   [public.template_versions]            |
|  - id (UUID primary key)                    - id (UUID primary key)               |
|  - name, category, subject                  - template_id (FK -> email_templates) |
|  - html_content, text_content               - version (INT)                       |
|  - version (INT, increments on edit)        - html_content, text_content          |
|  - is_active (BOOLEAN)                      - change_summary (TEXT)               |
|  - archived_at (TIMESTAMPTZ)                - created_at, created_by              |
|  - created_at, updated_at                   - UNIQUE(template_id, version)        |
+-----------------------------------------------------------------------------------+
```

---

## 3. Database Schema & Migration Details

### Migration File: `supabase/migrations/20261126000005_template_management_and_versioning.sql`

```sql
-- 1. Extend public.email_templates with category, versioning, and archival columns
ALTER TABLE public.email_templates 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Examinations',
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create public.template_versions for immutable snapshot history
CREATE TABLE IF NOT EXISTS public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'Examinations',
  subject VARCHAR(255) NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  change_summary TEXT DEFAULT 'Template revision',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unique_template_version UNIQUE (template_id, version)
);

-- 3. Row Level Security on template_versions
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Certified admins can read template versions"
  ON public.template_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Certified admins can insert template versions"
  ON public.template_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );
```

### Audit Preservation: Archival vs Deletion
Destructive `DELETE FROM email_templates` operations are strictly avoided. Because historical campaigns, activity records, and audit logs reference template foreign keys, deleting a template would violate referential integrity or leave orphan records. Instead:
- Archiving sets `is_active = false` and records `archived_at = timezone('utc'::text, now())`.
- Archived templates are excluded from active dropdowns and gallery views by default.
- Administrators can review all historical templates under the **Archived Templates** tab and restore them at any time.

---

## 4. Centralized Placeholder Registry

Located in `backend/src/services/placeholderRegistry.js` and `src/services/templateService.ts`.

| Placeholder Token | Field Key | Description | Sample Preview Value | Security Constraints |
|---|---|---|---|---|
| `{{recipient_name}}` | `recipient_name` | Full candidate / recipient display name | `Arjun Sharma` | HTML entity escaped |
| `{{recipient_email}}` | `recipient_email` | Verified recipient institutional email | `arjun.sharma@snpsu.edu.in` | Valid email syntax; entity escaped |
| `{{institution_name}}` | `institution_name` | Full university entity name | `Sapthagiri NPS University` | Entity escaped |
| `{{designation}}` | `designation` | Academic program or official designation | `Undergraduate Scholar (B.Tech CSE)` | Entity escaped |
| `{{activation_link}}` | `activation_link` | Cryptographically signed portal URL | `https://nexus.snpsu.edu.in/portal/auth-token/2026` | Strictly HTTPS (or localhost in dev); rejects `javascript:` |
| `{{current_year}}` | `current_year` | Active university academic year | `2026` | Alphanumeric (e.g. `2026` or `2025-26`) |

### Token Inspection & Unresolved Warnings
The backend utility `inspectPlaceholders(text)` extracts all `{{token}}` occurrences and categorizes them into `supported` and `unsupported`. If an administrator drafts a template containing unrecognized tokens (e.g. `{{student_cgpa}}`), the system highlights the token with a warning banner, preventing silent sending errors.

---

## 5. Security & Sanitization Specification

1. **HTML Entity Escaping**:
   Dynamic values inserted via placeholders are sanitized through `escapeHtml()`:
   ```javascript
   function escapeHtml(str) {
     return String(str)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#039;');
   }
   ```
2. **Strict URL Protocol Validation**:
   `{{activation_link}}` is validated with `URL`:
   - Rejects `javascript:`, `data:`, `vbscript:`, and insecure protocols.
   - Requires protocol to be `https:` (permitting `http:` only for `localhost` in local development).
3. **Allowlist HTML Sanitization (`sanitize-html`)**:
   - Allowed Tags: `div`, `span`, `p`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `b`, `i`, `strong`, `em`, `u`, `strike`, `br`, `hr`, `ul`, `ol`, `li`, `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`, `img`, `font`.
   - Disallowed & Stripped Tags: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, `<link>`, `<style>`.
   - Allowed Attributes: Inline `style`, table layout attributes (`cellpadding`, `cellspacing`, `border`, `width`), anchor `href` (strictly `http:`, `https:`, `mailto:`).
4. **Subject Line Injection Protection**:
   Subject lines are validated by Zod to reject newline characters (`\r` or `\n`), completely blocking SMTP header injection attacks.

---

## 6. Backend API Specification

All template management endpoints are mounted at `/api/templates` and require HTTP header `Authorization: Bearer <token>`.

### 1. `GET /api/templates`
Retrieves a paginated list of email templates with optional filters.
- **Query Parameters**:
  - `status`: `'active'` (default), `'archived'`, or `'all'`
  - `category`: `'All'`, `'Examinations'`, `'Fees'`, `'Admissions'`, `'Notifications'`, `'Faculty'`
  - `search`: Case-insensitive search string matching `name`, `subject`, or `description`
  - `page`: Page index (default: 1)
  - `limit`: Items per page (default: 20)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "templates": [...],
      "pagination": { "page": 1, "limit": 20, "total": 4, "pages": 1 }
    }
  }
  ```

### 2. `GET /api/templates/:id`
Retrieves a template by UUID including its historical version snapshots from `template_versions`.

### 3. `POST /api/templates`
Creates a new template.
- **Payload**:
  ```json
  {
    "name": "End Semester Exam Schedule Notice",
    "description": "Notice for exam registration and schedule",
    "category": "Examinations",
    "subject": "Examination Schedule: {{recipient_name}}",
    "html_content": "<div style=\"...\">...</div>",
    "text_content": "Dear {{recipient_name}}, ..."
  }
  ```
- **Behavior**: Initializes at `version = 1`, creates baseline snapshot in `template_versions`.

### 4. `PUT /api/templates/:id`
Updates an existing template.
- **Payload**:
  ```json
  {
    "name": "Updated Exam Schedule Notice",
    "subject": "Revised Examination Schedule: {{recipient_name}}",
    "html_content": "<div style=\"...\">...</div>",
    "change_summary": "Updated venue timings and download link"
  }
  ```
- **Behavior**: Auto-increments template version (`version = v + 1`), persists immutable snapshot of the new state in `template_versions`.

### 5. `POST /api/templates/:id/duplicate`
Duplicates an existing template.
- **Behavior**: Clones content, appends `(Copy)` to name, assigns a new UUID, and resets version to 1.

### 6. `PATCH /api/templates/:id/archive`
Soft-deletes a template. Sets `is_active = false` and `archived_at = now()`.

### 7. `PATCH /api/templates/:id/restore`
Restores an archived template. Sets `is_active = true` and `archived_at = null`.

### 8. `POST /api/templates/preview`
Performs server-side safe preview rendering.
- **Payload**:
  ```json
  {
    "subject": "Schedule for {{recipient_name}} ({{current_year}})",
    "html_content": "<div>Hello {{recipient_name}}, portal: {{activation_link}}</div>",
    "variables": { "recipient_name": "Arjun Sharma" }
  }
  ```
- **Response**: Returns rendered subject, sanitized rendered HTML, rendered plain text, and any unsupported placeholder tokens detected.

### 9. `GET /api/templates/placeholders`
Returns the centralized registry schema of all 6 standard placeholders.

---

## 7. Frontend User Experience (`EmailTemplatesView.tsx`)

### 1. Gallery Filter Bar
- **Status Tabs**:
  - `Active Templates` pill with active badge counter.
  - `Archived Templates` pill with archive badge counter.
- **Category Filter Pills**: Quick category switching with active Royal Blue styling.
- **Search Bar**: Instant debounced search querying template names and subjects.
- **Sync Button**: Forces dynamic re-synchronization with Supabase backend.
- **Create New Template Button**: Prominent Gold `#C69A4C` action button.

### 2. Template Cards
- Top accent border indicating status: Royal Blue `#1456AD` for active; Slate `#94A3B8` for archived.
- Badges: Category badge, Version pill (`v1`, `v2`), and Active/Archived pill.
- Code-formatted subject line preview.
- Body content preview block.
- Placeholders tags list with hover descriptions.
- Action Buttons:
  - **Preview (Eye)**: Opens realistic responsive letterhead preview modal.
  - **Edit (Edit3)**: Opens dual-mode editor modal.
  - **Duplicate (Copy)**: Clones template instantly.
  - **Archive / Restore (Archive / RotateCcw)**: Soft-deletes or restores template.
  - **Version History (History)**: Opens revision inspection drawer.
  - **Use in Compose (Send)**: Preloads template directly into `ComposeEmailView`.

### 3. Dual-Mode Template Editor
- **Visual Preview Mode**: Displays formatted email container with live placeholder sample interpolation.
- **HTML Source Code Mode**: Monospaced code textarea with formatting tags.
- **Plain-Text Fallback Mode**: Separate plain text textarea for text-only clients.
- **Quick Formatting Shortcuts**: Buttons for H1, H2, Bold, Italic, Royal Blue CTA Button, Gold CTA Button, Notice Callout, and Horizontal Rule.
- **One-Click Placeholder Quick-Insert Bar**: Clickable chips for all 6 tokens that insert into the active cursor position.
- **Revision Change Summary**: Field prompting for change notes upon updating existing templates.

### 4. Realistic Responsive Preview Simulation
- **Device Toggle**: Desktop View (`650px` responsive container) vs Mobile View (`375px` smartphone container).
- **Format Toggle**: HTML Email View vs Plain-Text View.
- **Institutional Letterhead**: Official SNPSUNEXUS emblem, Deep Navy header `#172E58`, Gold accent `#C69A4C`, official letterhead footer, and TLS 1.3 Strict security indicators.
- **Unsupported Placeholder Warning Detection**: Alert banner warning the admin if any unrecognized tokens are present.
- **Direct Send Action**: "Use in Compose Email" button in modal footer.

### 5. Version History & Snapshot Modal
- Chronological list of all immutable version snapshots (`v1`, `v2`, etc.).
- Displays creation timestamp, author, and change summary notes.
- Body preview of older snapshots for audit comparison.

---

## 8. Verification & Test Outcomes

### Automated Backend Test Suite (`backend/tests/template.test.js`)
All 20 template CRUD, versioning, and security scenarios executed and passed with 100% compliance:

```
========================================================
  SNPSUNEXUS Mail Studio — Template Management Test Suite
  Testing 20 Template CRUD, Versioning & Security Scenarios
========================================================

• Testing [1. Centralized placeholder registry contract (all 6 tokens)]... ✓ PASSED
• Testing [2. Detection of supported and unsupported placeholder tokens]... ✓ PASSED
• Testing [3. Dynamic text rendering with HTML entity escaping]... ✓ PASSED
• Testing [4. URL validation for activation links (reject javascript: and unsafe schemes)]... ✓ PASSED
• Testing [5. Allowlist HTML sanitization (strips <script> & <iframe> from templates)]... ✓ PASSED
• Testing [6. Template creation validation (rejects empty name and subject)]... ✓ PASSED
• Testing [7. Create template and initialize version 1 baseline snapshot]... ✓ PASSED
• Testing [8. Retrieve template by ID including historical version list]... ✓ PASSED
• Testing [9. Update template, auto-increment version to v2, and preserve v1 snapshot]... ✓ PASSED
• Testing [10. Duplicate template (copies content, assigns new ID, version 1)]... ✓ PASSED
• Testing [11. Safe template archival (is_active = false, archived_at recorded)]... ✓ PASSED
• Testing [12. Active gallery list filter excludes archived templates]... ✓ PASSED
• Testing [13. Archived filter retrieves archived templates for historical audit]... ✓ PASSED
• Testing [14. Restore archived template back to active gallery]... ✓ PASSED
• Testing [15. Search and category filtering in template list]... ✓ PASSED
• Testing [16. Safe template preview generation with sample context]... ✓ PASSED
• Testing [17. Unresolved placeholder detection and safe highlighting]... ✓ PASSED
• Testing [18. Plain text email rendering integrity]... ✓ PASSED
• Testing [19. Unauthorized API access rejection without token (HTTP 401)]... ✓ PASSED
• Testing [20. Zero secret leakage across template responses]... ✓ PASSED

========================================================
Test Execution Finished: 20 Passed, 0 Failed
========================================================
✓ ALL 20 TEMPLATE TESTS PASSED SUCCESSFULLY!
```

### Regression Verification (`backend/tests/run-all-tests.js`)
All 20 backend reliability, individual email sending, and SMTP security tests from Phase 4 were executed alongside Phase 5:
- **Result**: **20/20 PASSED**. Individual email sending through Gmail SMTP, idempotency protection, and administrative authorization remain completely uncompromised.

### Frontend Compilation & Bundling
- `npm run build` (`tsc && vite build`):
  - Modules transformed: 2,262
  - Compilation errors: 0
  - Type errors: 0

---

## 9. Phase Boundary Compliance

In strict adherence to project instructions:
- **NO bulk recipient CSV/Excel import operations** were implemented or triggered.
- **NO bulk email sending engine, queue dispatching worker, or 5-second interval loop** was executed.
- **NO Phase 6 bulk email distribution** was started.
- Work is strictly paused at Phase 5 completion awaiting explicit user authorization.
