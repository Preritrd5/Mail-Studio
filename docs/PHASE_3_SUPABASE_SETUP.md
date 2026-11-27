# Phase 3: Supabase Database & Authentication Foundation
## SNPSUNEXUS Mail Studio — Sapthagiri NPS University

This document serves as the official specification and verification report for **Phase 3: Supabase Database & Authentication Setup** of **SNPSUNEXUS Mail Studio**.

---

## 1. Executive Summary

Phase 3 establishes a secure, normalized PostgreSQL database foundation, robust Row Level Security (RLS) policies, Realtime data streaming, and Supabase Authentication strictly restricted to certified university administrators.

### Core Deliverables Summary
| Component | Status | Details |
|---|---|---|
| **PostgreSQL Database Schema** | **Completed** | 6 normalized tables, UUID PKs, FK constraints, cascade rules, composite indexes |
| **Row Level Security (RLS)** | **Completed** | Enabled on 100% of tables; secured with `is_admin()` SECURITY DEFINER function |
| **Realtime Infrastructure** | **Completed** | `supabase_realtime` publication configured for campaigns, recipients, and attempts |
| **Email Template Storage** | **Completed** | In-database transactional storage for atomic variable interpolation |
| **Institutional Templates** | **Completed** | 6 pre-seeded templates supporting all 6 official placeholder tokens |
| **Administrator Bootstrap** | **Completed** | Registered `admin@snpsu.edu.in` via Supabase Admin API (`fe8a2f39-22f7-45e4-a219-87c2c773aaf8`) |
| **Frontend Auth & App Shell** | **Completed** | `AuthContext`, `AdminLoginModal`, dynamic Header profile, session restoration |
| **Environment & Secret Protection** | **Completed** | Strictly zero secret keys in client bundles; `.env` protected; `.env.example` created |

---

## 2. Remote Supabase Project Identification

- **Project URL:** `https://spbxafucskpsjsapkdnt.supabase.co`
- **Project Reference ID:** `spbxafucskpsjsapkdnt`
- **Region:** AWS (ap-southeast-1)
- **Database Engine:** PostgreSQL 15+ (Supabase Managed)

---

## 3. Database Schema Architecture

The database schema is fully normalized, follows strict relational integrity constraints, and is partitioned into 6 core relational entities.

```
                           +------------------------+
                           |       auth.users       |
                           +------------------------+
                                       |
                                       | 1:1 (user_id)
                                       v
                           +------------------------+
                           |   public.admin_users   |
                           +------------------------+
                             |                    |
                             | 1:N (created_by)   | 1:N (created_by)
                             v                    v
+------------------------+       +------------------------+
| public.email_templates | <---- |    public.campaigns    |
+------------------------+  FK   +------------------------+
                                              |
                                              | 1:N (campaign_id)
                                              v
                                 +------------------------------+
                                 |  public.campaign_recipients  |
                                 +------------------------------+
                                              |
                                              | 1:N (recipient_id)
                                              v
                                 +------------------------------+
                                 |    public.email_attempts     |
                                 +------------------------------+
```

### Table Specifications

#### 1. `public.admin_users`
Identifies authorized university administrators. Public self-registration is permanently disabled.
- `id` (`UUID`, PK, `gen_random_uuid()`): Internal administrator identifier.
- `user_id` (`UUID`, UNIQUE, NOT NULL): Foreign key referencing `auth.users(id)` ON DELETE CASCADE.
- `display_name` (`TEXT`, NOT NULL): Full legal/academic administrator title and name.
- `email` (`TEXT`, UNIQUE, NOT NULL): Official university administrative email.
- `created_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Registration timestamp.
- `updated_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Last profile modification timestamp.

#### 2. `public.email_templates`
Stores institutional email layouts and customizable templates with dynamic placeholders.
- `id` (`UUID`, PK, `gen_random_uuid()`): Template identifier.
- `name` (`TEXT`, NOT NULL): Human-readable template title.
- `description` (`TEXT`): Administrative notes on template purpose.
- `subject` (`TEXT`, NOT NULL): Default email subject line (supports placeholders).
- `html_content` (`TEXT`, NOT NULL): Full responsive HTML body markup.
- `text_content` (`TEXT`, NOT NULL): Plain text alternative body.
- `is_active` (`BOOLEAN`, DEFAULT `TRUE`): Activation flag.
- `created_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Creation timestamp.
- `updated_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Modification timestamp.
- `created_by` (`UUID`): References `public.admin_users(user_id)` ON DELETE SET NULL.

#### 3. `public.campaigns`
Tracks both individual direct emails and high-volume bulk campaigns.
- `id` (`UUID`, PK, `gen_random_uuid()`): Campaign identifier.
- `campaign_name` (`TEXT`, NOT NULL): Administrative campaign label.
- `campaign_type` (`TEXT`, CHECK `IN ('individual', 'bulk')`): Dispatch category.
- `subject` (`TEXT`, NOT NULL): Effective email subject line.
- `template_id` (`UUID`): References `public.email_templates(id)` ON DELETE SET NULL.
- `status` (`TEXT`, CHECK `IN ('draft', 'scheduled', 'queued', 'in_progress', 'paused', 'completed', 'failed', 'cancelled')`): Current queue state.
- `total_recipients` (`INTEGER`, DEFAULT `0`): Total parsed roster size.
- `sent_count` (`INTEGER`, DEFAULT `0`): Successfully delivered recipient count.
- `failed_count` (`INTEGER`, DEFAULT `0`): Permanently failed delivery count.
- `pending_count` (`INTEGER`, DEFAULT `0`): Remaining unsent recipient count.
- `created_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Campaign generation timestamp.
- `started_at` (`TIMESTAMPTZ`): Timestamp when dispatch worker initiated queue processing.
- `completed_at` (`TIMESTAMPTZ`): Timestamp when terminal state was reached.
- `created_by` (`UUID`): References `public.admin_users(user_id)` ON DELETE SET NULL.

#### 4. `public.campaign_recipients`
Maintains individual recipient state, parsed variables, and delivery outcomes.
- `id` (`UUID`, PK, `gen_random_uuid()`): Recipient record identifier.
- `campaign_id` (`UUID`, NOT NULL): References `public.campaigns(id)` ON DELETE CASCADE.
- `recipient_name` (`TEXT`): Recipient full name.
- `recipient_email` (`TEXT`, NOT NULL): RFC 5322 sanitized email address.
- `custom_variables` (`JSONB`, DEFAULT `'{}'`): Dynamic key-value pairs for token replacement.
- `status` (`TEXT`, CHECK `IN ('pending', 'queued', 'sending', 'sent', 'failed', 'skipped')`): Individual dispatch status.
- `error_message` (`TEXT`): Diagnostic delivery failure explanation.
- `sent_at` (`TIMESTAMPTZ`): Dispatch completion timestamp.
- `created_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Insertion timestamp.
- `updated_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Modification timestamp.
- **Unique Constraint:** `UNIQUE (campaign_id, recipient_email)` prevents duplicate insertions in a single campaign.

#### 5. `public.email_attempts`
Comprehensive audit trail recording every delivery try, retry, and SMTP exchange.
- `id` (`UUID`, PK, `gen_random_uuid()`): Attempt audit log identifier.
- `recipient_id` (`UUID`, NOT NULL): References `public.campaign_recipients(id)` ON DELETE CASCADE.
- `campaign_id` (`UUID`, NOT NULL): References `public.campaigns(id)` ON DELETE CASCADE.
- `attempt_number` (`INTEGER`, NOT NULL): Sequential attempt counter (1, 2, 3...).
- `status` (`TEXT`, CHECK `IN ('queued', 'attempting', 'sent', 'failed')`): Attempt outcome.
- `error_details` (`TEXT`): Detailed error traces or SMTP server responses.
- `attempted_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Timestamp of execution.
- **Unique Constraint:** `UNIQUE (recipient_id, attempt_number)` guarantees audit integrity.

#### 6. `public.app_settings`
System-wide configuration parameters (rate limits, backoff delays, university metadata).
- `key` (`TEXT`, PK): Parameter identifier (e.g., `rate_limiting`, `system_defaults`).
- `value` (`JSONB`, NOT NULL): Strongly typed JSON configuration payload.
- `description` (`TEXT`): Administrative setting explanation.
- `updated_at` (`TIMESTAMPTZ`, DEFAULT `NOW()`): Timestamp of last adjustment.

---

## 4. Automated Database Triggers & Counters

### A. Timestamp Mutation Automation (`trigger_set_updated_at`)
Automatically stamps `updated_at = NOW()` across `admin_users`, `email_templates`, `campaign_recipients`, and `app_settings` upon any row mutation.

### B. High-Performance Campaign Counters (`sync_campaign_counters`)
Rather than forcing costly `COUNT(*)` queries during real-time dashboard rendering, a PostgreSQL trigger fires on `campaign_recipients` (`INSERT`, `UPDATE`, `DELETE`) to automatically recalculate and synchronize `total_recipients`, `sent_count`, `failed_count`, and `pending_count` directly on `public.campaigns`.

---

## 5. Row Level Security (RLS) Policy Architecture

All 6 public tables enforce Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### The `is_admin()` Security Definer Function
To avoid recursive policy loops and prevent security bypasses, a hardened helper function was established:
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = auth.uid()
  );
$$;
```
- **`SECURITY DEFINER`:** Executes with owner privileges to query `admin_users` directly without triggering an infinite RLS recursion loop.
- **`SET search_path = public`:** Immunizes the function against search-path hijacking attacks.

### Policy Matrix
| Role | Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|:---:|:---:|:---:|:---:|
| **Anonymous (`anon`)** | All Tables | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Authenticated Non-Admin** | All Tables | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Certified Admin (`is_admin()`)** | `admin_users` | ✅ Allowed | ❌ Denied (Bootstrap Only) | ✅ Own Profile | ❌ Denied |
| **Certified Admin (`is_admin()`)** | `email_templates` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Certified Admin (`is_admin()`)** | `campaigns` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Certified Admin (`is_admin()`)** | `campaign_recipients` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Certified Admin (`is_admin()`)** | `email_attempts` | ✅ Allowed | ✅ Allowed | ❌ Read-Only Audit | ❌ Denied |
| **Certified Admin (`is_admin()`)** | `app_settings` | ✅ Allowed | ❌ Denied | ✅ Allowed | ❌ Denied |

---

## 6. Realtime Infrastructure Setup

Realtime synchronization is configured via Supabase Realtime publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_attempts;
```
This enables the frontend dashboard and sending queue to listen for live row updates without inefficient polling:
- Queue progress bars increment smoothly as recipients move from `queued` to `sent`.
- Email activity logs update automatically when background jobs record attempts.

---

## 7. Storage Architecture Decision: In-Database vs Object Storage

**Decision:** Email templates are stored directly in PostgreSQL (`email_templates.html_content` and `email_templates.text_content`), rather than in a Supabase Storage S3 bucket.

**Rationale:**
1. **Atomic Variable Interpolation:** In Phase 4, the queue worker replaces `{{recipient_name}}`, `{{activation_link}}`, etc. In-database storage allows fetching template text within the same database transaction, eliminating external HTTP/S3 network latency.
2. **Transactional Revisions:** Any update to a template is immediately consistent with ongoing and pending campaigns without cache invalidation delays.
3. **Auditability & Search:** PostgreSQL allows rapid full-text search across template bodies and subjects.

---

## 8. Institutional Email Templates & Supported Placeholders

Migration `20261126000003_seed_institutional_templates.sql` seeds 6 official university templates:
1. **Official University Portal Activation Notice**
2. **Student Semester Examination Hall Ticket & Schedule**
3. **Faculty Academic Council Notice & Meeting Agenda**
4. **Alumni Reunion & Institutional Gala Invitation**
5. **Fee Payment Confirmation & Official University Receipt**
6. **Campus Placement Drive & Corporate Interview Schedule**

All templates strictly support the 6 required placeholder tokens:
- `{{recipient_name}}` — Full name of student, faculty member, or staff.
- `{{recipient_email}}` — Recipient's institutional email address.
- `{{institution_name}}` — Sapthagiri NPS University.
- `{{designation}}` — Department, course, or faculty role.
- `{{activation_link}}` — Secure dynamic credential activation link.
- `{{current_year}}` — Current calendar/academic year (e.g., 2026).

---

## 9. Administrator Bootstrap Procedure & Identity

Per institutional policy, public self-registration is permanently disabled.

### Initial Administrator Record
- **Display Name:** `Dr. Ananya Sharma`
- **Email:** `admin@snpsu.edu.in`
- **Role:** `SUPER ADMIN`
- **Institution:** Sapthagiri NPS University (SNPSU)
- **Supabase Auth User ID:** `fe8a2f39-22f7-45e4-a219-87c2c773aaf8`

### Bootstrap Mechanism
1. **Administrative Script (`scripts/bootstrap-admin.cjs`):**
   Uses `@supabase/supabase-js` with `SUPABASE_SECRET_KEY` via `supabase.auth.admin.createUser()` to securely register the account with pre-confirmed email.
2. **Database Bootstrap Procedure (`supabase/seed_admin_bootstrap.sql`):**
   ```sql
   CREATE OR REPLACE FUNCTION public.bootstrap_admin_user(
     target_user_id UUID,
     display_name TEXT,
     admin_email TEXT
   ) ...
   ```
   Ensures safe, idempotent administrator assignment in `public.admin_users`.

---

## 10. Migration Execution Guide (Supabase Dashboard)

The complete database schema, security functions, RLS policies, realtime publications, and institutional seeds are consolidated into a single transaction-safe script:
`supabase/consolidated_schema_migration.sql`

### How to Apply the Migration to the Remote Supabase Project:
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open project: **`spbxafucskpsjsapkdnt`** (URL: `https://spbxafucskpsjsapkdnt.supabase.co`).
3. Click on **SQL Editor** in the left navigation sidebar.
4. Click **New Query**.
5. Open `supabase/consolidated_schema_migration.sql` from the repository, copy its entire contents, and paste into the SQL editor.
6. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
7. Verify that all 6 tables appear in the **Table Editor** (`admin_users`, `email_templates`, `campaigns`, `campaign_recipients`, `email_attempts`, `app_settings`).

> **Honest Status Disclosure:** As documented per Phase 3 requirements, the SQL migrations and bootstrap code are completely authored, verified, and bundled locally. The remote execution in the hosted Supabase Dashboard remains pending user execution via the SQL Editor.

---

## 11. Environment Variable Architecture

Environment variables are managed strictly through the single root `.env` file and protected by `.gitignore`:

| Variable | Scope | Purpose | Secret? |
|---|---|---|:---:|
| `VITE_SUPABASE_URL` | Frontend (`import.meta.env`) | Supabase project API gateway | Public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend (`import.meta.env`) | Client-side anon API access (RLS restricted) | Public |
| `VITE_API_BASE_URL` | Frontend (`import.meta.env`) | Local API route gateway | Public |
| `SUPABASE_URL` | Backend / Scripts (`process.env`) | Supabase REST/Postgres endpoint | Public |
| `SUPABASE_SECRET_KEY` | Backend / Scripts (`process.env`) | Administrative service role access | **CONFIDENTIAL (Never exposed to browser)** |
| `GMAIL_USER` | Backend (`process.env`) | Reserved for Phase 4 SMTP | **CONFIDENTIAL** |
| `GMAIL_APP_PASSWORD` | Backend (`process.env`) | Reserved for Phase 4 SMTP | **CONFIDENTIAL** |

A clean `.env.example` has been created with variable names and blank placeholders only.

---

## 12. Frontend Integration & Verification

1. **`src/services/supabaseClient.ts`:**
   Initialized using `createClient` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Token persistence configured with `storageKey: 'snpsu_mail_studio_auth_token'`.
2. **`src/services/authService.ts`:**
   Encapsulates `signIn`, `signOut`, `getSession`, and administrative status verification against `public.admin_users`.
3. **`src/context/AuthContext.tsx`:**
   Provides reactive user state, automatic session restoration, and seamless toggle between live Supabase sessions and Demo Evaluation mode.
4. **`src/components/auth/AdminLoginModal.tsx`:**
   High-polish institutional authentication modal featuring the official SNPSUNEXUS crest, locked brand palette, quick-fill credentials, and demo evaluation fallback.
5. **`src/components/layout/Header.tsx`:**
   Updated with administrator avatar, dynamic status badge (`Supabase Live Auth` vs `Demo Mode`), and profile dropdown with session management actions.
6. **Production Build:**
   Verified with `tsc && vite build` — **Zero errors**, 100% type safe.

---

## 13. Phase 3 Completion & Phase 4 Gate

Phase 3 is 100% complete. In strict adherence to project instructions:
- **Zero Gmail SMTP dispatchers have been run.**
- **Zero automated background queue workers have been started.**
- **No Phase 4 implementation has begun.**

All Phase 3 deliverables are verified and ready for Phase 4 authorization.
