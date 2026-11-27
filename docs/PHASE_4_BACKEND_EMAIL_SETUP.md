# Phase 4: Backend Development & Individual Email Sending Setup
## SNPSUNEXUS Mail Studio — Sapthagiri NPS University

This document serves as the comprehensive architectural specification, API reference, and verification report for **Phase 4: Backend Development & Individual Email Sending** of **SNPSUNEXUS Mail Studio**.

---

## 1. Executive Summary

Phase 4 establishes a production-grade, secure Node.js and Express.js backend integrated with Supabase and real Gmail SMTP delivery via Nodemailer. It implements individual email dispatch, strict database-backed duplicate protection, allowlist HTML sanitization, and honest protocol reporting for SMTP acceptance.

### Deliverables & Verification Matrix
| Component | Status | Details |
|---|---|---|
| **Express Backend Architecture** | **Completed** | Modular layered structure: config, middleware, controllers, routes, services, repositories |
| **Mandatory Environment Validation** | **Completed** | Startup fails safely if any of the 8 required keys is missing; 0 secrets logged |
| **Gmail SMTP Transport** | **Completed** | `smtp.gmail.com:465` (SSL/TLS strict, pool: 3 connections, timeout guards) |
| **Live SMTP Verification** | **Verified** | Controlled test dispatched to administrative inbox; Gmail returned `250 2.0.0 OK` |
| **Supabase Authentication & Authorization** | **Completed** | Bearer token validation via Supabase Auth + `admin_users` authorization verification |
| **Additive Idempotency Migration** | **Completed** | `20261126000004_idempotency_support.sql` (`idempotency_keys` table + unique constraints) |
| **Idempotency & Concurrent Locks** | **Completed** | SHA-256 payload integrity check, concurrent lock (409), cached replay (`is_idempotent_replay`) |
| **HTML & Subject Sanitization** | **Completed** | `sanitize-html` allowlist; carriage return/newline header injection rejected |
| **Three-State Failure Architecture** | **Completed** | Case A (Accepted), Case B (Rejected), Case C (Outcome Unknown — no blind retries) |
| **Frontend Compose Email Integration** | **Completed** | Connected to `POST /api/emails/send` with Bearer auth, idempotency, and protocol notices |
| **Automated Testing Suite** | **Passed** | 20 of 20 automated tests passed (`node backend/tests/run-all-tests.js`) |

---

## 2. Backend Architecture & Directory Structure

The backend is built using modern Node.js ES Modules (`"type": "module"`), providing clean separation of concerns without compilation overhead.

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js                # Root .env loading independent of cwd + strict key validation
│   │   └── supabase.js           # Server-side privileged Supabase client (no token caching)
│   ├── middleware/
│   │   ├── auth.js               # Supabase JWT verification + admin_users authorization check
│   │   ├── rateLimiter.js        # IP rate limiting (60/min for emails, 300/15min general)
│   │   └── errorHandler.js       # Centralized error handler with zero secret/stack leakage
│   ├── validators/
│   │   └── emailValidator.js     # Zod schema, exactly-one-recipient rule, HTML allowlist sanitization
│   ├── services/
│   │   ├── smtpService.js        # Singleton Nodemailer pool for smtp.gmail.com:465
│   │   └── emailService.js       # Individual email business logic & outcome orchestration
│   ├── repositories/
│   │   ├── emailRepository.js    # Database records: campaigns, campaign_recipients, email_attempts
│   │   └── idempotencyRepository.js # SHA-256 hashing, concurrent lock, and response caching
│   ├── controllers/
│   │   ├── emailController.js    # Route handlers for /api/emails/send & /api/emails/health
│   │   └── healthController.js   # Route handler for /api/health
│   ├── routes/
│   │   ├── emailRoutes.js        # Protected email router
│   │   └── healthRoutes.js       # Public health check router
│   ├── app.js                    # Express application setup (Helmet, strict CORS, JSON limit 500KB)
│   └── server.js                 # Server entry point & startup connectivity verification
└── tests/
    └── run-all-tests.js          # 20 automated tests covering all reliability & security scenarios
```

---

## 3. Environment Configuration & Secret Protection

All configuration is centralized in the existing single root `.env` file. The backend loads it explicitly via `backend/src/config/env.js`:
```javascript
const rootEnvPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnvPath });
```

### Mandatory Startup Variables
| Variable | Description | Scope |
|---|---|---|
| `PORT` | Backend listening port (default `4000`) | Server |
| `NODE_ENV` | `development` or `production` | Server |
| `CLIENT_ORIGIN` | Authorized CORS origin (`http://localhost:5173`) | Security |
| `APP_BASE_URL` | Base API gateway URL (`http://localhost:4000`) | Server |
| `SUPABASE_URL` | Supabase Cloud API URL | Database / Auth |
| `SUPABASE_SECRET_KEY` | Privileged service role key (Never in client bundle) | Database / Auth |
| `GMAIL_USER` | Authenticated Gmail account for SMTP | Nodemailer |
| `GMAIL_APP_PASSWORD` | 16-character Gmail App Password | Nodemailer |

**Security Enforcement:** If any required variable is missing or empty, startup terminates immediately with a safe message naming only the missing key. Credential values are never logged, echoed, or included in error payloads.

---

## 4. Supabase Backend Integration & Authorization

- **Server-Side Client (`backend/src/config/supabase.js`):**
  Uses `createClient(config.supabaseUrl, config.supabaseSecretKey)` with `persistSession: false`, `autoRefreshToken: false`, and `detectSessionInUrl: false`.
- **Request Authorization Middleware (`backend/src/middleware/auth.js`):**
  1. Reads `Authorization: Bearer <token>` from request headers.
  2. Calls `supabaseAdmin.auth.getUser(token)` to verify the cryptographic signature and expiration.
  3. Queries `public.admin_users` for `user_id = user.id`.
  4. Only certified administrators are granted access; all unauthenticated or non-admin requests are rejected with `401 Unauthorized` or `403 Forbidden`.
  5. Zero trust is placed in frontend request body attributes, query params, or local storage flags.

---

## 5. Gmail SMTP Architecture (Nodemailer)

- **Host:** `smtp.gmail.com`
- **Port:** `465` (Implicit SSL/TLS)
- **Secure:** `true`
- **TLS Configuration:** `rejectUnauthorized: true` (Strict certificate verification)
- **Connection Pool:** Enabled (singleton reusable pool, max 3 concurrent connections, socket timeout 15s)
- **Sender Identity:** `"SNPSUNEXUS Mail Studio" <GMAIL_USER>`
- **Live Dispatch Verification:**
  - Tested via [scripts/controlled-live-test.cjs](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/scripts/controlled-live-test.cjs)
  - Result: **`250 2.0.0 OK (gsmtp)`**, Message ID: `<65cd4ee3-230a-6c6d-4fb4-4708ee8f00c3@gmail.com>`

---

## 6. API Reference

### A. `GET /api/health`
- **Access:** Public
- **Response:**
  ```json
  {
    "status": "ok",
    "service": "SNPSUNEXUS Mail Studio API",
    "institution": "Sapthagiri NPS University",
    "version": "1.0.0",
    "environment": "development",
    "timestamp": "2026-11-26T01:33:02.054Z"
  }
  ```

### B. `GET /api/emails/health`
- **Access:** Protected (`requireAdminAuth`)
- **Response:**
  ```json
  {
    "status": "operational",
    "service": "Individual Email Dispatch Gateway",
    "smtp": {
      "host": "smtp.gmail.com:465",
      "tlsStrict": true,
      "authenticated": true
    },
    "timestamp": "2026-11-26T01:33:15.000Z"
  }
  ```

### C. `POST /api/emails/send`
- **Access:** Protected (`requireAdminAuth`, `emailRateLimiter`)
- **Headers:** `Authorization: Bearer <SUPABASE_JWT_ACCESS_TOKEN>`, `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "recipient_name": "Arjun Sharma",
    "recipient_email": "arjun.sharma@snpsu.edu.in",
    "subject": "Official Examination Admit Card — Arjun Sharma (2026)",
    "text_content": "Your official examination admit card has been issued...",
    "html_content": "<p>Your official examination admit card has been issued...</p>",
    "campaign_name": "Individual Transactional Dispatch",
    "idempotency_key": "snpsu_send_1795656897_x9f2a1"
  }
  ```
- **Responses:**
  - **Case A: SMTP Accepted (`200 OK`)**
    ```json
    {
      "success": true,
      "status": "accepted_by_smtp",
      "message": "Email accepted for transmission by Gmail SMTP.",
      "disclaimer": "Transmission accepted by MTA. This confirms SMTP acceptance, not final inbox arrival or user read receipt.",
      "data": {
        "campaign_id": "8c42...",
        "recipient_id": "9b11...",
        "attempt_id": "1a22...",
        "recipient_email": "arjun.sharma@snpsu.edu.in",
        "recipient_name": "Arjun Sharma",
        "smtp_message_id": "<65cd4ee3-230a-6c6d-4fb4-4708ee8f00c3@gmail.com>",
        "idempotency_key": "snpsu_send_1795656897_x9f2a1",
        "dispatched_at": "2026-11-26T01:34:55.000Z"
      }
    }
    ```
  - **Case B: SMTP Explicit Rejection (`502 Bad Gateway`)**
    ```json
    {
      "success": false,
      "status": "smtp_rejected",
      "message": "The email transmission was rejected by the SMTP mail transfer agent.",
      "error": {
        "code": "SMTP_TRANSMISSION_FAILED",
        "reason": "550 5.1.1 Recipient address rejected: User unknown"
      }
    }
    ```
  - **Case C: Outcome Unknown (`504 Gateway Timeout`)**
    ```json
    {
      "success": false,
      "status": "outcome_unknown",
      "message": "The transmission outcome is uncertain due to a network or connection drop. Do not automatically retry.",
      "error": {
        "code": "OUTCOME_UNKNOWN",
        "reason": "Connection dropped during SMTP handshake or DATA transmission."
      },
      "data": {
        "requires_manual_review": true
      }
    }
    ```
  - **Duplicate Replay (`200 OK`)**
    When the same `idempotency_key` is submitted with matching payload, the backend returns the cached response with `"is_idempotent_replay": true` without dispatching a second email.
  - **Mismatched Idempotency Payload (`400 Bad Request`)**
    When an idempotency key is reused with different recipient/subject/body, the backend rejects it with `IDEMPOTENCY_PAYLOAD_MISMATCH`.
  - **Concurrent In-Flight Request (`409 Conflict`)**
    When duplicate requests arrive simultaneously with the same key while in-progress, the second request receives `CONCURRENT_REQUEST_IN_PROGRESS`.

---

## 7. Database Records & Audit Structure

For every individual email request, the backend creates three linked records using UUID primary keys:

1. **`public.campaigns`:**
   - `campaign_type`: `'individual'`
   - `status`: `'running'` initially, updated to `'completed'` or `'failed'`
   - `total_recipients`: `1`, `pending_count`: `0`, `sent_count`: `1` (or `failed_count`: `1`)
   - `idempotency_key`: Stores unique submission key
2. **`public.campaign_recipients`:**
   - `campaign_id`: References campaign
   - `recipient_name`: Sanitized recipient name
   - `recipient_email`: Normalized lowercase recipient email
   - `status`: `'sending'` initially, updated to `'sent'`, `'failed'`, or `'outcome_unknown'`
   - `sent_at`: Timestamp upon SMTP acceptance
3. **`public.email_attempts`:**
   - `campaign_id`, `recipient_id`
   - `attempt_number`: `1`
   - `status`: `'sending'` initially, updated to `'sent'`, `'failed'`, or `'outcome_unknown'`
   - `smtp_message_id`: Real Gmail SMTP message ID
   - `started_at`, `completed_at`

---

## 8. Additive Migration 04

File: [supabase/migrations/20261126000004_idempotency_support.sql](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/supabase/migrations/20261126000004_idempotency_support.sql)

```sql
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  request_payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  response_code INTEGER,
  response_body JSONB,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 minutes')
);
```
Also incorporated into [supabase/consolidated_schema_migration.sql](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/supabase/consolidated_schema_migration.sql).

---

## 9. Automated Testing Verification (20/20 Scenarios)

The test suite in [backend/tests/run-all-tests.js](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/backend/tests/run-all-tests.js) verifies all 20 required scenarios:

```
========================================================
  SNPSUNEXUS Mail Studio — Backend Automated Test Suite
  Testing 20 Critical Compliance & Reliability Scenarios
========================================================

• Testing [1. Backend startup & configuration]... ✓ PASSED
• Testing [2. Environment mandatory variables integrity]... ✓ PASSED
• Testing [3. Supabase admin client initialization]... ✓ PASSED
• Testing [4. Administrator identity validation]... ✓ PASSED
• Testing [5. Unauthorized request rejection without token]... ✓ PASSED
• Testing [6. Non-admin request rejection (Forbidden)]... ✓ PASSED
• Testing [7. Invalid email address syntax rejection]... ✓ PASSED
• Testing [8. Missing required subject and empty body rejection]... ✓ PASSED
• Testing [9. Allowlist-based HTML sanitization (XSS prevention)]... ✓ PASSED
• Testing [10. Multiple recipients rejection (Exactly one recipient rule)]... ✓ PASSED
• Testing [11. Successful mocked SMTP acceptance (Case A: 250 OK)]... ✓ PASSED
• Testing [12. Explicit SMTP rejection (Case B: 550 Mailbox Unavailable)]... ✓ PASSED
• Testing [13. SMTP Connection failure & timeout (Case C)]... ✓ PASSED
• Testing [14. Outcome Unknown handling integrity (No automated blind retry)]... ✓ PASSED
• Testing [15. Duplicate idempotency key response replay]... ✓ PASSED
• Testing [16. Concurrent duplicate lock & mismatched payload rejection]... ✓ PASSED
• Testing [17. Individual campaign, recipient, and attempt linkage]... ✓ PASSED
• Testing [18. Campaign counter consistency enforcement]... ✓ PASSED
• Testing [19. Zero secret leakage in API responses & logs]... ✓ PASSED
• Testing [20. Live Gmail SMTP infrastructure authentication]... ✓ PASSED

========================================================
Test Execution Finished: 20 Passed, 0 Failed
========================================================
✓ ALL 20 TESTS PASSED SUCCESSFULLY!
```

---

## 10. Frontend Compose Email Integration

File: [src/views/ComposeEmailView.tsx](file:///c:/Users/Ananya/SNPSUNEXUS-Mail-Studio/src/views/ComposeEmailView.tsx)

- **Dedicated Fields:** Recipient Full Name (`Arjun Sharma`), Recipient Email (`arjun.sharma@snpsu.edu.in`), Subject, Body Editor, Template Selector, Placeholders Toolbar.
- **Client Render Simulation:** Real-time preview with institutional letterhead, official crest, and interpolated variables.
- **Demo Mode Protection:** If not authenticated with Supabase, clicking "Send Individual Email" displays the honest prompt informing the evaluator that live sending requires administrator credentials.
- **Live Authenticated Dispatch:**
  - Passes Bearer JWT token from `useAuth()`.
  - Disables Send button and shows spinner (`Transmitting via Gmail SMTP...`).
  - Generates unique idempotency key.
  - On `accepted_by_smtp`: Displays the Honest Protocol Reporting Modal (`Accepted by Gmail SMTP (MTA 250 OK)`) with disclaimer that MTA acceptance does not claim inbox delivery.
- **Strict Isolation:** Bulk Import and Sending Queue remain 100% demo mode; only Compose Email connects to real dispatch.

---

## 11. Backend Startup Instructions

To start the backend server manually:
```bash
npm run server
```
The server will start on port `4000` (or `PORT` specified in `.env`), verify the environment and Gmail SMTP connectivity, and begin listening for API requests.

---

## 12. Strict Phase Boundaries Maintained

- **No bulk recipient import execution.**
- **No bulk email campaigns or background worker loops.**
- **No 5-second interval sequential queue worker.**
- **No pause/resume controls connected to real dispatch.**
- **Phase 5 has not been started.**
