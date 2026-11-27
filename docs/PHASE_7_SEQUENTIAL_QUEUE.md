# PHASE 7 — PERSISTENT SEQUENTIAL SENDING QUEUE
## SNPSUNEXUS MAIL STUDIO
**Institutional Email Suite for Sapthagiri NPS University (`SNPSUNEXUS`)**

---

## 1. Executive Summary

Phase 7 transitions **SNPSUNEXUS Mail Studio** from campaign preparation into a robust, database-backed, sequentially executed bulk email transmission engine. 

To protect university domain deliverability, prevent IP blacklisting, comply strictly with institutional Gmail SMTP relay constraints, and guarantee that not a single email is duplicated or skipped, the system enforces:
1. **Single Global Worker Architecture**: Exactly one active worker executes outbound transmission at any given instant.
2. **PostgreSQL Distributed Lease & Fencing Tokens**: Worker leadership is managed via `queue_worker_state` with monotonically increasing lock generation tokens and a 30-second stale heartbeat takeover window.
3. **Mandatory 5-Second Interval**: A strict minimum 5-second interval between the completion of one delivery attempt and the start of the next (`next_send_allowed_at = attempt_completed_at + 5 seconds`). This timestamp is persisted in PostgreSQL; neither frontend restarts nor worker crashes can bypass or compress this interval.
4. **Global SMTP Dispatch Coordination**: Shared concurrency protection prevents Phase 4 individual emails (`POST /api/emails/send`) from colliding with active bulk queue dispatches (returning retryable `409 Conflict` / `DISPATCH_BUSY`).
5. **Idempotent Queue Lifecycle Controls**: Administrative capabilities to Start, Pause, Resume, and Cancel campaigns transactionally.
6. **Outcome Unknown Resolution**: Unambiguous safety mechanism halting automated retries for socket timeouts / dropped connections, preserving unconfirmed recipients for administrative verification (`sent` or `failed`).

---

## 2. Architecture & Concurrency Model

```
                    ┌─────────────────────────────────────────┐
                    │       Admin Web Interface (React)       │
                    │   - Live 5s Interval Countdown Timer    │
                    │   - Start / Pause / Resume / Cancel     │
                    │   - Outcome Unknown Audit & Resolution  │
                    └────────────────────┬────────────────────┘
                                         │ HTTP REST (JWT / Demo Bearer)
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │      Express Backend API Server         │
                    │   - /api/queue Routes & Controller      │
                    │   - requireAdminAuth Middleware         │
                    └────────┬───────────────────────┬────────┘
                             │                       │
      Individual Email       │                       │  Queue Operations
      POST /api/emails/send  │                       │  (Start/Pause/Resume)
                             ▼                       ▼
              ┌─────────────────────────────────────────────┐
              │          smtpDispatchCoordinator            │
              │  - Channel: 'individual' | 'bulk_worker'    │
              │  - Prevents Transport Collisions            │
              │  - Returns 409 DISPATCH_BUSY if busy        │
              └──────────────────────┬──────────────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    Nodemailer Transport     │
                      │  smtp.gmail.com:465 TLS 1.3 │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │      Gmail SMTP Relay       │
                      └─────────────────────────────┘
                                     ▲
                                     │ Dispatch via processClaimedRecipient()
                                     │ Enforces next_send_allowed_at = now() + 5s
┌────────────────────────────────────┴────────────────────────────────────┐
│                    Standalone Queue Worker Engine                       │
│  - Acquires Singleton Lease in queue_worker_state                       │
│  - 5-second Periodic Heartbeat & Fencing Token Check                    │
│  - Recovers Abandoned Sending States on Boot                            │
│  - Claims Recipient via claim_next_queue_recipient() (FOR UPDATE SKIP)  │
│  - Renders Template Snapshot with Placeholders                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Supabase PostgreSQL Engine                        │
│  - queue_worker_state (Singleton Lease, Heartbeat, next_send_allowed_at)│
│  - queue_events (Immutable Audit Trail)                                 │
│  - campaigns (Lifecycle State Machine: queued, running, paused, etc.)   │
│  - campaign_recipients (pending, sending, sent, failed, outcome_unknown) │
│  - email_attempts (Attempt Tracking with Worker Identity)               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema & RPC Functions

The database migration is cataloged in `supabase/migrations/20261126000007_persistent_sequential_sending_queue.sql` and appended to `supabase/consolidated_schema_migration.sql`.

### 3.1. Singleton Table: `queue_worker_state`
Enforces that exactly one row (`id = '00000000-0000-0000-0000-000000000001'::uuid`) exists to track the authoritative active worker and rate limits.
```sql
CREATE TABLE IF NOT EXISTS public.queue_worker_state (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  worker_id TEXT NOT NULL DEFAULT 'unassigned',
  lock_generation BIGINT NOT NULL DEFAULT 1,
  worker_status VARCHAR(30) NOT NULL DEFAULT 'idle' CHECK (
    worker_status IN ('idle', 'active', 'waiting_interval', 'paused', 'stopping', 'stopped', 'failed')
  ),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_started_at TIMESTAMPTZ,
  last_stopped_at TIMESTAMPTZ,
  current_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  current_recipient_id UUID REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
  current_attempt_id UUID REFERENCES public.email_attempts(id) ON DELETE SET NULL,
  next_send_allowed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_attempt_completed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT single_queue_worker_row CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);
```

### 3.2. Audit Table: `queue_events`
Immutable record of all lifecycle events (`campaign_queued`, `campaign_started`, `recipient_claimed`, `email_accepted_smtp`, `email_rejected_smtp`, `email_outcome_unknown`, `campaign_paused`, `campaign_resumed`, `campaign_cancelled`, `campaign_completed`, `worker_recovered`, `outcome_resolved`).

### 3.3. Extensions to Existing Tables
- **`campaigns`**: Status check constraint extended to include `needs_review`; added `paused_at`, `cancelled_at`, and `outcome_unknown_count`.
- **`campaign_recipients`**: Added `attempt_count`, `claimed_at`, `claimed_by_worker`, `resolved_at`, `resolved_by`, and `resolution_notes`.
- **`email_attempts`**: Added `worker_id`.

### 3.4. Stored Procedures (RPCs)
1. **`claim_next_queue_recipient(p_worker_id TEXT)`**:
   - Finds oldest eligible bulk campaign (FIFO: `running` before `queued`, ordered by `created_at ASC`).
   - Locks exactly ONE pending recipient using `FOR UPDATE SKIP LOCKED`.
   - Transitions recipient status to `sending` and creates an `email_attempts` record.
   - Returns campaign template snapshot and recipient details.
2. **`finalize_queue_attempt(p_attempt_id, p_outcome, p_smtp_message_id, p_failure_reason, p_worker_id)`**:
   - Updates attempt and recipient status.
   - Recalculates campaign counters (`sent_count`, `failed_count`, `pending_count`, `outcome_unknown_count`).
   - If `p_outcome = 'outcome_unknown'`, sets campaign status to `needs_review`.
   - **Enforces 5-second interval**: Updates `queue_worker_state.next_send_allowed_at = now() + INTERVAL '5 seconds'`.
3. **`recover_abandoned_queue_attempts(p_worker_id TEXT)`**:
   - Identifies any recipient records stranded in `sending` state (> 2 minutes or from a disconnected worker).
   - Marks them `outcome_unknown` and transitions the parent campaign to `needs_review` for administrator audit.

---

## 4. Backend Implementation

### 4.1. Worker Lock Manager (`backend/src/queue/workerLock.js`)
- Generates a unique worker ID per process (`worker-<hostname>-<pid>-<hash>`).
- Atomically claims the database lease in `queue_worker_state` with fencing token generation (`lock_generation = lock_generation + 1`).
- Runs a 5-second heartbeat ping. If another worker supersedes the generation token, the local worker immediately ceases transmission.
- Automatically takes over dead leases when the heartbeat exceeds 30 seconds (`staleThresholdMs = 30000`).

### 4.2. Shared SMTP Dispatch Coordinator (`backend/src/services/smtpDispatchCoordinator.js`)
- Coordinates exclusive transmission access on the shared Gmail SMTP transport.
- When an individual email (`POST /api/emails/send`) arrives while the bulk worker is transmitting, it returns HTTP `409 Conflict` with:
  ```json
  {
    "success": false,
    "error": {
      "code": "DISPATCH_BUSY",
      "message": "SMTP transport is currently transmitting a queued bulk campaign email. Sequential rate limiting is active.",
      "retry_after_seconds": 5
    }
  }
  ```

### 4.3. Queue Repository & Service (`backend/src/queue/queueRepository.js` & `queueService.js`)
- Provides dual-mode execution: executes atomic PostgreSQL RPCs against Supabase when available, with an automatic in-memory fallback store to facilitate offline development, testing, and continuous operation before SQL migrations are applied.
- Renders template snapshot variables:
  - `{{recipient_name}}`: Recipient's full name (defaults to "Valued Recipient")
  - `{{recipient_email}}`: Recipient's verified email address
  - `{{campaign_name}}`: Institutional campaign name
  - `{{university_name}}`: "Sapthagiri NPS University"
  - `{{system_date}}`: Formatted current date (e.g. "November 26, 2026")
  - `{{unsubscribe_link}}`: Safe institutional unsubscribe reference

### 4.4. Standalone Queue Worker (`backend/src/queue/worker.js`)
- Can be started via `npm run worker`.
- Recovers abandoned states on startup.
- Loops through eligible items, respecting `next_send_allowed_at` down to the millisecond.
- Handles `SIGINT` and `SIGTERM` gracefully, allowing in-flight SMTP dispatches to complete before releasing the database lease.

---

## 5. API Endpoints

All endpoints are mounted at `/api/queue` and require administrator authorization (`requireAdminAuth`):

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/queue` | Complete queue overview (worker health, campaigns, server timestamp) |
| `GET` | `/api/queue/worker/health` | Worker heartbeat latency, lock generation, and dispatch state |
| `GET` | `/api/queue/campaigns` | Paginated list of bulk campaigns with counters |
| `GET` | `/api/queue/campaigns/:id` | Campaign details, recipient ledger, and recent audit events |
| `POST` | `/api/queue/campaigns/:id/start` | Queues a ready/draft campaign for delivery |
| `POST` | `/api/queue/campaigns/:id/pause` | Pauses an active or queued campaign |
| `POST` | `/api/queue/campaigns/:id/resume` | Resumes a paused campaign back to queued |
| `POST` | `/api/queue/campaigns/:id/cancel` | Cancels campaign and marks pending recipients as failed |
| `POST` | `/api/queue/recipients/:id/resolve-outcome` | Resolves an uncertain recipient to `sent` or `failed` |
| `POST` | `/api/queue/step` | Administratively triggers a single sequential dispatch step |

---

## 6. Frontend Sending Queue View

The Sending Queue interface (`src/views/SendingQueueView.tsx`) has been completely upgraded:

1. **Global Worker Status Banner**:
   - Displays live engine status, worker node identity, lock generation number, and heartbeat latency.
   - **Live 5-Second Interval Countdown**: Computes remaining delay derived directly from `next_send_allowed_at`, displaying `Ready to Send` or `4s Pausing` with visual color changes.
2. **Needs Review / Outcome Unknown Alert**:
   - Prominently warns administrators when socket timeouts or network drops occur.
   - One-click "Review & Resolve Outcome" button opening an audit modal to mark recipients as "Sent (Delivered)" or "Failed (Bounced)" with audit notes.
3. **Campaign Selector Tabs**:
   - Quickly switch between active bulk campaigns to view progress, staged recipients, and audit logs.
4. **Active Campaign Dispatch Monitor**:
   - Live progress bar with percentage, Sent, Pending, Failed, and Outcome Unknown counts.
   - Control buttons: Start Sequential Send, Pause, Resume, Send Next (manual step trigger), and Cancel Campaign.
5. **Sequential In-Flight Spotlight & Protocol Pipeline**:
   - Shows current recipient in flight with sequential position (`#X of Y`) and attempt count.
   - 4-stage pipeline visualization: Template Snapshots → TLS Strict (Port 465) → SMTP Handshake → 5s Rate Pause.
6. **Sequential Queue Buffer Table**:
   - Complete FIFO recipient ledger displaying sequence number, recipient name, email address, attempt count, and status badge (`Accepted by SMTP`, `Transmitting`, `Pending`, `Failed / 550`, `Outcome Unknown`).
7. **Persistent Queue Audit Trail**:
   - Live stream of immutable audit records from `queue_events`.

---

## 7. Verification & Test Suite

A comprehensive test suite of **40 automated tests** was developed in `backend/tests/queue.test.js`:

```
========================================================
  SNPSUNEXUS Mail Studio — Phase 7 Sending Queue Tests
  Testing 40 Strict Sequential Queue & Lock Scenarios
========================================================

• Testing [1. WorkerLock unique ID initialization]... ✓ PASSED
• Testing [2. WorkerLock acquire singleton lease]... ✓ PASSED
• Testing [3. WorkerLock heartbeat loop maintenance]... ✓ PASSED
• Testing [4. Monotonic increment of lock generation (fencing token)]... ✓ PASSED
• Testing [5. WorkerLock rejection when active worker holds valid lease]... ✓ PASSED
• Testing [6. Stale worker lease takeover threshold logic]... ✓ PASSED
• Testing [7. WorkerLock graceful release on shutdown]... ✓ PASSED
• Testing [8. Stop heartbeat timer leaves clean state]... ✓ PASSED
• Testing [9. QueueRepository getWorkerState fetches singleton record]... ✓ PASSED
• Testing [10. QueueRepository updateWorkerState updates state fields]... ✓ PASSED
• Testing [11. Claim next recipient respects FIFO campaign and recipient order]... ✓ PASSED
• Testing [12. Claim recipient claims exactly 1 recipient at a time]... ✓ PASSED
• Testing [13. Queued campaign transitions to running upon first claim]... ✓ PASSED
• Testing [14. Claimed recipient status transitions to sending]... ✓ PASSED
• Testing [15. Attempt record created with worker identity]... ✓ PASSED
• Testing [16. Finalize attempt with outcome sent (SMTP accepted)]... ✓ PASSED
• Testing [17. Finalize attempt strictly enforces 5-second interval (now + 5s)]... ✓ PASSED
• Testing [18. Finalize attempt updates worker status to waiting_interval]... ✓ PASSED
• Testing [19. Finalize attempt updates campaign sent_count and pending_count]... ✓ PASSED
• Testing [20. Finalize attempt with outcome failed (SMTP 550 Explicit Rejection)]... ✓ PASSED
• Testing [21. Finalize failed attempt updates campaign failed_count counter]... ✓ PASSED
• Testing [22. Finalize attempt with outcome outcome_unknown (socket drop)]... ✓ PASSED
• Testing [23. Outcome unknown transitions campaign status to needs_review]... ✓ PASSED
• Testing [24. Campaign outcome_unknown_count incremented]... ✓ PASSED
• Testing [25. Crash recovery identifies abandoned sending states safely]... ✓ PASSED
• Testing [26. Start campaign transitions ready/draft to queued]... ✓ PASSED
• Testing [27. Pause campaign transitions running/queued to paused]... ✓ PASSED
• Testing [28. Resume campaign transitions paused back to queued]... ✓ PASSED
• Testing [29. Cancel campaign marks cancelled and pending recipients failed]... ✓ PASSED
• Testing [30. Resolve outcome unknown to sent marks delivered & updates campaign]... ✓ PASSED
• Testing [31. Resolve outcome unknown to failed marks failed & updates campaign]... ✓ PASSED
• Testing [32. Resolve outcome unknown rejects invalid resolution value]... ✓ PASSED
• Testing [33. Substitute standard institutional placeholders in template snapshot]... ✓ PASSED
• Testing [34. Substitute system_date and unsubscribe_link placeholders]... ✓ PASSED
• Testing [35. SmtpDispatchCoordinator acquires exclusive bulk_worker right]... ✓ PASSED
• Testing [36. Individual send returns 409 DISPATCH_BUSY when bulk worker is transmitting]... ✓ PASSED
• Testing [37. Release dispatch reservation restores transport availability]... ✓ PASSED
• Testing [38. GET /api/queue returns worker health, campaigns, and server timestamp]... ✓ PASSED
• Testing [39. POST /api/queue/campaigns/:id/pause and resume endpoint behavior]... ✓ PASSED
• Testing [40. Zero secret leakage across queue status and events responses]... ✓ PASSED

========================================================
Test Execution Finished: 40 Passed, 0 Failed
========================================================
✓ ALL 40 QUEUE TESTS PASSED SUCCESSFULLY!
```

### Cumulative Test Results Across All Phases:
- **Phase 4**: Individual Email & Core Architecture — **20/20 PASSED**
- **Phase 5**: Email Template Management & Versioning — **20/20 PASSED**
- **Phase 6**: High-Fidelity Bulk Import & Validation Engine — **30/30 PASSED**
- **Phase 7**: Persistent Sequential Sending Queue — **40/40 PASSED**
- **Total**: **110/110 Automated Tests Passing (100% Pass Rate)**

### Frontend Production Build:
- Executed `tsc && vite build`:
  - Transformed 2,261 modules.
  - Generated clean production bundle in `dist/`.
  - **0 TypeScript errors, 0 compilation warnings.**

---

## 8. Phase Boundary & Next Steps

Phase 7 is fully completed, tested, and verified.

> [!IMPORTANT]
> **Phase Boundary Notification:** In accordance with the project instructions, Phase 8 (Reports, Analytics Export & Audit Log) has **NOT** been initiated. Work is paused awaiting explicit user authorization.
