# SNPSUNEXUS Mail Studio
## Phase 1 — UI Design & Brand Identity Specification
**Document Version:** 1.0.0  
**Status:** Approved for Design Baseline  
**Scope:** Strictly Phase 1 (UI Design, Visual System & Brand Identity)  
**Target Environment:** Administrator Email Management Platform for Sapthagiri NPS University (SNPSUNEXUS)  
**File Location:** `docs/PHASE_1_DESIGN_SPEC.md`

---

## 1. Executive Summary & Brand Identity

### 1.1 Purpose & Mission
**SNPSUNEXUS Mail Studio** is a dedicated, institutional-grade email dispatch and communications platform purpose-built for university administrators at **Sapthagiri NPS University (SNPSU)**. The platform is designed to govern transactional email dispatches, high-volume bulk student campaigns, examination hall ticket distribution, official circulars, fee notifications, and placement notices with enterprise-tier deliverability, rate-limiting oversight, and comprehensive audit transparency.

The user interface follows a modern, commercial B2B SaaS design paradigm, prioritizing clarity, visual hierarchy, restrained aesthetics, and authoritative academic professionalism.

---

### 1.2 Official University Brand Identity
The application strictly incorporates the official **Sapthagiri NPS University (SNPSU)** heraldic identity.

```
       /\
      /  \
     / /\ \
    | |  | |   [ SNPSUNEXUS HERALDIC SHIELD ]
    | |__| |   - Left Half: Radiant Sun of Knowledge & Sapthagiri Mountain Peaks
    |  __  |   - Right Half: Open Codex of Learning & Classical Ionic Pillar
    | |  | |   - Primary Field: Deep Navy (#172E58) & Royal Blue (#1456AD)
     \ \/ /    - Architectural Lines: University Antique Gold (#C69A4C)
      \  /
       \/
```

#### Authentic Brand Asset Registry
| Asset Identifier | File Path | Format | Native Resolution | Usage Description |
|---|---|---|---|---|
| **SNPSU Emblem Mark** | `/assets/snpsu-nexus-emblem.png` | Transparent PNG | 215 × 288 px | Sidebar brand mark, browser favicon, client simulation header |
| **Full Horizontal Lockup** | `/assets/snpsu-nexus-logo-full.png` | Transparent PNG | 1079 × 288 px | Executive reports, printable letterheads, modal headers |
| **High-Res 3D Crest Badge** | `/assets/snpsu-nexus-crest.jpg` | High-Res JPEG | 255 × 312 px | High-density retina displays, about/compliance modals |
| **Square Portal Crest** | `/assets/snpsu-nexus-crest-square.jpeg` | Square JPEG | 225 × 225 px | App launcher, avatar fallback, compact navigation |
| **Gold Heraldic Crest** | `/assets/snpsu-gold-crest.png` | High-Res PNG | 1000 × 1333 px | Watermarks, certificate backgrounds, official credentials |

#### Strict Brand Preservation Rules
1. **Preserve Native Proportions:** The crest shield has a fixed native aspect ratio (~1:1.34). It must never be stretched, squashed, distorted, or horizontally compressed.
2. **Zero Recoloring:** The heraldic gold linework and deep navy/royal blue backing must remain in their authentic state. No monochrome recoloring or arbitrary gradients.
3. **No UrPlaced Branding:** The application is purely **SNPSUNEXUS Mail Studio**. Under no circumstances should legacy branding, monograms, or terminology from external projects (such as UrPlaced) be introduced.
4. **Placement Consistency:** The emblem appears locked at the top-left of the application sidebar with the text lockup `SNPSUNEXUS Mail Studio` and subtitle `Sapthagiri NPS University`.

---

## 2. Locked Color Palette & Tokens

The visual language is bound to an exact, locked color palette. No extraneous shades, tints, or unaligned accents are permitted.

```
+---------------------------------------------------------------------------------------+
|                                 LOCKED COLOR PALETTE                                  |
+---------------------+-------------+-----------------------+---------------------------+
| Palette Name        | Hex Code    | Tailwind Class        | Functional SaaS Role      |
+---------------------+-------------+-----------------------+---------------------------+
| Deep Navy           | #172E58     | bg-[#172E58]          | Left sidebar, nav headers |
| Royal Blue          | #1456AD     | bg-[#1456AD]          | Primary CTAs, active nav  |
| Gold                | #C69A4C     | bg-[#C69A4C]          | Premium accents & badges  |
| Light Grey          | #F4F6FA     | bg-[#F4F6FA]          | Main canvas background    |
| White               | #FFFFFF     | bg-white              | Surface cards, panels     |
| Primary Text        | #1E293B     | text-[#1E293B]        | Primary headers, body     |
| Muted Text          | #64748B     | text-[#64748B]        | Secondary text & metadata |
| Border Grey         | #E2E8F0     | border-[#E2E8F0]      | Dividing rules & borders  |
+---------------------+-------------+-----------------------+---------------------------+
```

### 2.1 Color Semantics & Elevation
- **Navigation Canvas (`#172E58` Deep Navy):** Represents stability, institutional authority, and focus. Used for the persistent sidebar, dark notification cards, and executive summary headers.
- **Interactive Focus (`#1456AD` Royal Blue):** Used exclusively for high-intent user interactions: "Send Immediately", "Browse Files", active navigation items, progress fill meters, and hyperlinks. Hover state is tuned to `#0E448D`.
- **Prestige Accent (`#C69A4C` Antique Gold):** Reserved for institutional badges ("PRO", "Admin Certified"), VIP priority tags, sending countdown highlights, and secondary high-importance buttons.
- **Canvas Neutral (`#F4F6FA` Light Grey):** Calibrated to reduce eye fatigue during extended administrative sessions while providing sharp contrast for pure white (`#FFFFFF`) surface cards.
- **Card Surfaces (`#FFFFFF` Pure White):** All content blocks, tables, and modal dialogs use `#FFFFFF` with a single `#E2E8F0` border and a restrained drop shadow.

---

## 3. Typography & Visual Language

### 3.1 Typeface Selection
The typographic system utilizes **Inter** (fallback: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`), recognized as the industry benchmark for dense, highly legible SaaS dashboard applications.

### 3.2 Typographic Hierarchy Scale
| Hierarchy Level | Font Size | Line Height | Weight | Tracking | Color | Usage |
|---|---|---|---|---|---|---|
| **Display / Welcome** | 24px (1.5rem) | 32px | Bold (700) | -0.025em | `#FFFFFF` | Welcome dashboard hero title |
| **Page Title (H1)** | 20px (1.25rem) | 28px | Bold (700) | -0.02em | `#172E58` | Top header primary page title |
| **Section Heading (H2)** | 16px (1.0rem) | 24px | Semibold (600) | -0.015em | `#172E58` | Card headers, modal titles |
| **Card / Subsection (H3)** | 14px (0.875rem) | 20px | Semibold (600) | -0.01em | `#1E293B` | Table column groups, widget headers |
| **Body Standard** | 13px (0.8125rem) | 19px | Regular (400) | 0.0em | `#1E293B` | Default content, form inputs |
| **Secondary / Labels** | 12px (0.75rem) | 16px | Medium (500) | 0.0em | `#64748B` | Form labels, table cell content |
| **Overlines / Tags** | 10–11px (0.6875rem) | 14px | Semibold (600) | +0.05em | `#64748B` | Metric captions, uppercase headers |
| **Code / MTA Logs** | 11px (0.6875rem) | 16px | Mono (400) | 0.0em | `#1E293B` | SMTP responses, message IDs, JSON |

### 3.3 Radii, Borders, and Elevation Rules
- **Corner Radii:** Strictly bounded to **10–14px**.
  - Surface Cards & Tables: `rounded-[12px]`
  - Modal Containers: `rounded-[14px]`
  - Form Inputs & Buttons: `rounded-[10px]`
  - Status Badges & Chips: `rounded-[6px]` or `rounded-[8px]`
- **Borders:** Subtle `1px solid #E2E8F0`. High-emphasis inputs transition to `focus:border-[#1456AD]` with a 2px offset ring `ring-[#1456AD]/20`.
- **Shadows (Restrained):**
  - Cards: `box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.03)`
  - Hover States: `box-shadow: 0 4px 12px 0 rgba(23, 46, 88, 0.06)`
  - Modals & Drawers: `box-shadow: 0 20px 25px -5px rgba(23, 46, 88, 0.12), 0 8px 10px -6px rgba(23, 46, 88, 0.06)`

---

## 4. Application Layout & Navigation Shell

The application shell provides a consistent layout across all viewports.

```
+----------------------------------------------------------------------------------------------+
| [SNPSU LOGO]  SNPSUNEXUS MAIL STUDIO           [Header] Page Title | Quick Help | Admin (AS) |
+----------------------------------------------------------------------------------------------+
| [NAV ITEMS]                  |                                                               |
| 1. Dashboard                 |  MAIN VIEW CONTENT CONTAINER (Light Grey #F4F6FA)              |
| 2. Compose Email             |                                                               |
| 3. Bulk Import               |  - Surface Cards: #FFFFFF                                     |
| 4. Sending Queue [42] (Gold) |  - Borders: 1px #E2E8F0                                       |
| 5. Email Activity            |  - Corner Radius: 12px                                        |
| 6. Email Templates           |  - Typography: Inter                                          |
| 7. Reports & Analytics       |                                                               |
|                              |                                                               |
| [STATUS FOOTER]              |                                                               |
| SMTP Gateway: Active Ready   |                                                               |
+----------------------------------------------------------------------------------------------+
| [Footer] SNPSUNEXUS Mail Studio • Sapthagiri NPS University • Phase 1 UI Baseline           |
+----------------------------------------------------------------------------------------------+
```

### 4.1 Shell Components
1. **Persistent Left Sidebar (`#172E58` Deep Navy, 256px wide):**
   - Brand block featuring the official shield crest, uppercase name `SNPSUNEXUS`, gold `PRO` pill, `Mail Studio` title, and university accreditation.
   - Seven persistent navigation tabs with active indicator (`bg-[#1456AD]`, text white, subtle gold accent).
   - Real-time queue badge counter (highlighted in gold `#C69A4C`).
   - Bottom system status widget with active green heartbeat ping showing SMTP engine status.
2. **Top Administrative Header (`#FFFFFF` White, sticky top):**
   - Left: Mobile drawer toggle hamburger (on tablet/mobile) + dynamic section title + "Admin Certified" shield badge.
   - Right: Interactive Design Guide modal trigger, notification bell with gold dot indicator, divider rule, and Administrator profile block (`Dr. Ananya Sharma`, Super Admin).
3. **Main Workspace Canvas (`#F4F6FA` Light Grey):**
   - Central container with maximum width constraint (`max-w-7xl`), responsive padding (`px-4 sm:px-6 lg:px-8`), and scrollbar styling.
4. **Institutional App Footer:**
   - University legal notice, Phase 1 UI Design Spec badge, and modal access link.

---

## 5. Detailed Specifications for All Seven Sections

---

### Section 1: Dashboard
- **Welcome & Hero Card:** Deep Navy gradient card (`#172E58` to `#1F3C73`) with university badge, welcome greeting, and dual quick-action buttons ("Compose Email", "Bulk Roster").
- **Four Summary Metric Cards:**
  1. *Total Emails Sent:* 128,450 (+14.2% from last week) with Royal Blue accent border.
  2. *Delivery Rate:* 99.2% (Optimal vs 97.4% industry benchmark) with Emerald accent border.
  3. *Pending in Queue:* 42 emails currently staged for rate-limited dispatch with Gold accent border.
  4. *Failed / Bounced:* 8 emails (0.06% bounce rate) with Rose accent border.
- **Sending Volume & Deliverability Chart:** 7-day CSS/SVG stacked bar visualization showing sent volume vs queued volume per day, complete with hover tooltips and SPF/DKIM verification tags.
- **System Health & Quick Shortcuts Widget:** Server hostname (`smtp.snpsu.edu.in:587`), active worker status, TLS 1.3 confirmation, and one-click rapid workflow navigation.
- **Recent University Campaigns Table:** Multi-column view of recent campus-wide broadcasts (Hall Tickets, Placement Drives, Circulars) with animated progress bars, recipient counts, and status pills.
- **Real-time Dispatch Log Feed:** Micro-feed of the last 4 individual recipient events with live timestamps and delivery badges.

---

### Section 2: Compose Email
- **Split Workspace:** Dual-column 7:5 layout featuring the Dispatch Editor on the left and Live Simulated Client Render on the right.
- **Institutional Template Selector:** One-click prefill dropdown containing standard examination, fees, admissions, and circular templates.
- **Recipient Address Field:** Accommodates single addresses, comma-delimited lists, or institutional group aliases with validation hints.
- **Subject Field & Quick Merge Tokens:** Insertion helper chips for dynamic personalization variables:
  `{{student_name}}`, `{{usn_number}}`, `{{department}}`, `{{exam_center}}`, `{{time_table_url}}`, `{{due_amount}}`, `{{date}}`.
- **Rich Message Editor:** Clean formatted toolbar with Bold, Italic, Bulleted List, Hyperlink, Code Block, and UTF-8 encoding indicator.
- **Attachment Dropzone:** Dedicated upload surface for university circular PDFs, grade cards, and schedules (up to 25MB).
- **Simulated Email Preview:** High-fidelity simulation of an inbox client displaying:
  - Client chrome with window controls and sender/recipient headers.
  - Official university letterhead with the authentic SNPSU crest, university title, and legislative establishment reference.
  - Live interpolated variables replacing merge tags with realistic student data.
  - Institutional footer with authenticated TLS 1.3 and SPF/DKIM validation tags.
- **Action Control Bar:** "Send Immediately" (Royal Blue primary), "Schedule Send" (outline with clock icon), and "Save Draft".

---

### Section 3: Bulk Import
- **Drag & Drop Upload Zone:** Dashed border container supporting `.csv`, `.xlsx`, and `.xls` rosters up to 50,000 rows (20MB) with sample spreadsheet download link.
- **Import Instructions Card:** 3-step numbered guideline detailing required header columns (`email`), supported merge tags (`name`, `usn`, `department`), and automated deduplication rules.
- **Four Validation Status Counters:**
  1. *Total Parsed:* Total number of records discovered.
  2. *Valid & Clean:* Green badge showing verified addresses ready for delivery.
  3. *Duplicates Flagged:* Amber badge indicating duplicate addresses suppressed from dispatch.
  4. *Syntax / Missing:* Red badge showing malformed email strings or missing mandatory fields.
- **Filterable Preview Table:** Tabs to filter between "All Records", "Valid Only", and "Issues Only". Shows recipient full name, email, department, role pill (Student, Faculty, Staff), status indicator, and specific remediation remarks.
- **Campaign Review & Staging Bar:** Deep Navy banner displaying target count, rate limit confirmation (e.g. 3 emails/second), and primary "Push to Sending Queue" action button.

---

### Section 4: Sending Queue
- **Live Dispatch Monitor Banner:** Deep Navy hero container with real-time pulsing status beacon, active worker identifier, campaign metadata, and progress bar with animated gradient.
- **Queue Controls:** "Pause Queue" / "Resume Dispatch" toggle button, and "Abort Campaign" button with safety confirmation modal.
- **In-Flight Recipient Spotlight:** Focused card showcasing the exact recipient currently undergoing transmission:
  - Recipient name and university email address.
  - Next dispatch countdown timer (e.g. `0.8s`).
  - Active protocol pipeline: DNS MX Lookup -> TLS Encryption -> SMTP Handshake.
- **Rate Limiter & Throttle Controls:** Interactive rate slider (1 to 10 emails/sec) with conservative, recommended, and fast preset indicators to safeguard university IP reputation.
- **Sequential In-Queue Table:** High-density queue ledger showing queue ID, recipient, campaign, priority level (`HIGH` with gold badge, `NORMAL` with neutral badge), status, and scheduled ETA countdown.
- **Abort Campaign Safety Modal:** Accessible dialog preventing accidental stoppage, summarizing sent count vs unsent queue items to be purged.

---

### Section 5: Email Activity
- **Comprehensive Audit Ledger:** Searchable and filterable transaction table recording every dispatched communication.
- **Search & Filter Action Bar:**
  - Real-time text search querying across recipient name, email address, and subject lines.
  - Delivery status dropdown (Delivered, Opened, Bounced, Deferred).
  - Department filter dropdown (Computer Science, Information Science, Electronics, Mechanical).
  - Quick "Reset" and "Export CSV" buttons.
- **Audit Table Columns:** Recipient full name, email, department, subject summary, message ID, campaign tag, status badge with live color dot, timestamp, and "Audit" button.
- **Detailed Recipient Audit Modal:**
  - Message identifier (`<msg-9401@snpsu.edu.in>`).
  - Dispatch timestamp and originating campaign.
  - Full raw MTA Server Handshake Transcript (`250 2.0.0 OK 1732600692 - mail-delivery.snpsu.edu.in`).
  - Protocol Security Badges: SPF Check (PASS), DKIM Signature (VALID), DMARC Policy (PASS p=reject).
- **Pagination Controls:** Full pagination bar with page numbers, active state, and record range indicator.

---

### Section 6: Email Templates
- **Template Gallery Header:** Search input and category filter pills: "All", "Examinations", "Fees", "Admissions", "Notifications".
- **"Create New Template" Action:** Prominent Antique Gold button opening the full template builder modal.
- **Template Cards Grid:**
  - Academic category badge in Deep Navy/Royal Blue.
  - Campaign usage counter (e.g. "Used in 65 campaigns").
  - Template title and subject line template.
  - 3-line truncated content preview box.
  - Dynamic token tags (`{{student_name}}`, `{{exam_center}}`, etc.).
  - Card footer with author metadata, last edited timestamp, and quick-action icon buttons: Preview (Eye), Duplicate (Copy), Edit (Pencil), and Delete (Trash).
- **Interactive Modals:**
  - *Template Preview Modal:* Simulates official university letterhead with the authentic crest and standard formatting.
  - *Create / Edit Template Modal:* Form with template title, academic category selector, author/division, subject line, and body textarea.
  - *Delete Confirmation Modal:* Safety dialog warning against unintended removal.

---

### Section 7: Reports
- **Executive Report Filter Bar:** Campaign selector dropdown (Global Institution vs specific campaigns), date range selector pills ("Today", "Last 7 Days", "Last 30 Days", "Fall Semester 2026"), and dual export buttons ("Export PDF Brief", "Download Full CSV").
- **Four Institutional Performance KPIs:** Total Dispatched (128,450), Delivery Success Rate (99.2%), Student/Staff Open Rate (64.8%), and Bounce Rate (0.06%).
- **Deliverability & Engagement Funnel:** Step-by-step progress bars visualizing the drop-off from Initiated Dispatches -> Accepted by MTA -> Opened by Recipient -> Portal Link Clicks.
- **Domain Deliverability Ledger:** Breakdown of volume, delivery rates, and sender reputation scores across university domains (`@snpsu.edu.in`: 99.9% High) and external providers (`@gmail.com`, `@outlook.com`, `@yahoo.com`).
- **Bounce & Failure Root-Cause Analysis Table:** Categorization of delivery errors (550 User Unknown, 552 Quota Exceeded, Connection Timeout) with incident counts, impact severity badges, and specific recommended administrator remediation actions.

---

## 6. Reusable Design Components & Rules

To maintain 100% design consistency across all present and future modules, the following component patterns are codified:

### 6.1 Buttons
| Variant | Background | Text Color | Border | Usage Rule |
|---|---|---|---|---|
| **Primary** | `#1456AD` (Royal Blue) | `#FFFFFF` | None | Primary call to action per view |
| **Secondary** | `#172E58` (Deep Navy) | `#FFFFFF` | None | Dark high-contrast secondary actions |
| **Gold** | `#C69A4C` (Antique Gold) | `#FFFFFF` | None | Premium highlights, Compose, Bulk Launch |
| **Outline** | `#FFFFFF` | `#1E293B` | `1px #E2E8F0` | Secondary cancel, filter, export buttons |
| **Ghost** | Transparent | `#64748B` | None | Subtle inline icon actions, close buttons |
| **Danger** | `#E11D48` (Rose 600) | `#FFFFFF` | None | Abort campaign, delete template |

- **Corner Radius:** `rounded-[10px]`
- **Heights:** Small (32px / `h-8`), Medium (40px / `h-10`), Large (48px / `h-12`)
- **Active State:** `active:translate-y-[0.5px]` with subtle focus rings.

### 6.2 Status Badges & Indicators
| Status Meaning | Background | Text Color | Border | Dot Color |
|---|---|---|---|---|
| **Delivered / Success / Valid** | `#ECFDF5` | `#047857` | `#A7F3D0` | `#10B981` |
| **Queued / Pending / Warning** | `#FFFBEB` | `#B45309` | `#FDE68A` | `#F59E0B` |
| **Failed / Bounced / Syntax Error** | `#FFF1F2` | `#BE123C` | `#FECDD3` | `#F43F5E` |
| **In Flight / Transmitting** | `#EBF3FC` | `#1456AD` | `#BFDBFE` | `#1456AD` |
| **Institutional Tag** | `#172E58`/10 | `#172E58` | `#172E58`/20 | None |
| **Premium / VIP Tag** | `#FDF8EE` | `#C69A4C` | `#C69A4C`/30 | `#C69A4C` |

### 6.3 Cards & Content Surfaces
- Background: `#FFFFFF`
- Border: `1px solid #E2E8F0`
- Radius: `12px` (`rounded-[12px]`)
- Padding: `p-5` or `p-6`
- Shadow: `shadow-[0_1px_3px_rgba(0,0,0,0.03)]`

### 6.4 Input Fields & Dropdowns
- Height: `h-10` (40px)
- Radius: `10px` (`rounded-[10px]`)
- Background: `#FFFFFF`
- Border: `1px solid #E2E8F0` (transitions to `border-[#1456AD]` on focus with `ring-2 ring-[#1456AD]/20`)
- Text: 13px font with `#1E293B`, placeholder `#94A3B8`

### 6.5 Tables
- Header row: `#F8FAFC` background with 11px uppercase semibold `#64748B` labels and `border-b border-[#E2E8F0]`.
- Row hover: Subtle transition to `#F8FAFC`/80.
- Cell padding: `py-3 px-3` (with `px-5` on outer margins).
- Dividers: `divide-y divide-[#E2E8F0]`.

---

## 7. Responsive Design Guidelines

| Breakpoint Range | Device Category | Layout Adaptation Strategy |
|---|---|---|
| **Desktop (> 1024px)** | Laptops, Desktop Displays | Fixed 256px Deep Navy sidebar, expansive multi-column grids (7:5 split in Compose, 3-column in Dashboard), sticky header with full user profile info. |
| **Tablet (768px – 1024px)** | iPads, Surface Tablets | Collapsible sidebar drawer with top-bar hamburger toggle. Dual-column metric grids. Horizontal table scrolling with preserved cell padding. |
| **Mobile (< 768px)** | Smartphones | Full off-canvas drawer with backdrop blur. Single-column stacked layout for all cards and metrics. Touch-friendly button heights (minimum 40px). Condensed header with icon-only notifications. |

---

## 8. Strict Development Boundaries Audit

In strict compliance with Phase 1 instructions, the following operational boundaries were rigorously upheld:

- [x] **Zero Backend APIs:** No Express, Nest, Fastify, or Python backend routes implemented.
- [x] **Zero Supabase Integration:** No database connections, queries, schema mutations, or client SDK instances initialized.
- [x] **Zero Gmail / SMTP Dispatch:** No nodemailer, SendGrid, or live SMTP sockets opened.
- [x] **Zero Authentication Logic:** No user session management, JWT tokens, or auth middleware created.
- [x] **Zero Persistent Queue:** No Redis, BullMQ, or background worker processes spawned.
- [x] **Zero `.env` Modification:** The existing workspace `.env` file was preserved intact with zero modifications, zero additions, and zero credential printing.
- [x] **Zero Phase 2 Work:** No backend scaffolding or phase 2 execution started.

---

## 9. Phase 2 Transition Roadmap

Upon receiving explicit administrator approval to proceed to **Phase 2 (Backend & Database Architecture)**, the implementation roadmap will address:
1. Supabase database schema modeling (Tables: `campaigns`, `recipients`, `email_logs`, `templates`, `queue_items`).
2. Gmail SMTP & Custom Institutional SMTP transport engine configuration.
3. Persistent FIFO queue worker with Redis/BullMQ or PostgreSQL row-level locks.
4. Token interpolation engine for dynamic merge tags (`{{student_name}}`).
5. Live webhook ingestion for delivery receipts, open tracking, and bounce reporting.
6. Role-Based Access Control (RBAC) authentication for university administrators.

---
*End of Phase 1 Design Specification Document*
