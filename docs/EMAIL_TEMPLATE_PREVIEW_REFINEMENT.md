# SNPSUNEXUS Mail Studio — Complete UI & Email Preview Refinement

## 1. Executive Summary

This document specifies the design system corrections, email layout architecture, and modal preview enhancements implemented in **SNPSUNEXUS Mail Studio** for the Email Template Preview system.

The deliverable resolves all visual defects identified in the target inspection:
1. **Official Brand Asset Delivery**: Full integration of the official 3D blue shield emblem (`/assets/snpsunexus-logo.png`).
2. **Target Email Card Layout**: Exact pixel-perfect alignment with the design approved in user reference media:
   - Contained gold accents that never push, overflow, or clip.
   - Deep Navy hero banner (`#172E58`) with `EMAIL NOTIFICATION` gold badge.
   - 2-column "Your Details" information card on desktop, automatically collapsing into a 100% width vertical stack on mobile via `@media only screen and (max-width: 520px)`.
   - Action CTA button (`View Admit Card & Schedule ->`) and fallback link card.
   - Sign-off and Deep Navy footer with copyright statement.
3. **True Mobile (375px) Isolated Iframe Preview**:
   - Replaced container `div` / `dangerouslySetInnerHTML` with an isolated `<iframe srcDoc={...} sandbox="allow-same-origin">`.
   - Real mobile viewport dimensions trigger CSS media queries natively, eliminating horizontal scrollbars, layout warping, and clipped gold ribbons.
4. **Clean Modal Layout**:
   - Fixed header with version, category, author, and close button.
   - Scrollable preview canvas.
   - Fixed footer with "Close" and "Use in Compose Email".
   - Completely removed fabricated string `"Simulated with verified test profile"`.

---

## 2. Brand Identity & Visual Specifications

| Token | Value | Applied Elements |
|---|---|---|
| **Deep Navy** | `#172E58` | Brand header text, Hero banner background, Button background, Footer background |
| **Royal Blue** | `#1456AD` | Primary links, Secondary accents, Pipeline highlights |
| **Warm Gold** | `#C69A4C` | Hero badge text, Header/footer skewed decorative accents, Top footer border |
| **Gold Highlight** | `#E7C27B` | Header gradient corner accent (`linear-gradient(135deg, #C69A4C, #E7C27B)`) |
| **Background Fill** | `#F4F6FA` | Outer canvas table background |
| **Card Container** | `#FFFFFF` | Main 600px email container, 16px radius, subtle `#CBD5E1` border |
| **Info Box Fill** | `#EEF4FF` | "Your Details" card, Fallback link container |
| **Subtle Border** | `#CBD5E1` | Card outline, Dividers, Modal frame, Table row separators |

---

## 3. Structural Design & Responsive Implementation

### 3.1. Email Card Component Architecture
The email template is compiled table-by-table for bulletproof cross-client compatibility:
1. **Outer Table**: 100% width, background `#F4F6FA`, 32px vertical padding.
2. **Card Container**: Max 600px width, centered, background `#FFFFFF`, border `1px solid #CBD5E1`, border-radius `16px`, overflow `hidden`, soft shadow.
3. **Brand Header**:
   - Left: Official shield logo (`height: 42px`, `width: 36px`), vertical divider `2px solid #172E58`, bold `SNPSUNEXUS` wordmark (`font-size: 19px`, `font-weight: 800`).
   - Right: Tagline `"Smarter Communication. Greater Impact."` (`font-size: 11px`, italic, `#64748B`).
   - Top-Right: Contained gold accent wedge (`width: 14px`, `height: 14px`, `transform: skewX(-20deg)`).
4. **Hero Banner Section**:
   - Background `#172E58`, padding `24px 28px`.
   - Badge: `EMAIL NOTIFICATION` in `#C69A4C` bold uppercase.
   - Title: `Official Semester Examination Admit Card & Schedule (v1)` in white bold.
   - Right: Contained gold ribbon (`width: 22px`, `height: 8px`, `transform: skewX(-25deg)`).
5. **Message Body**:
   - Salutation: `Dear {{recipient_name}},`
   - Introduction: Authenticated notice text with dynamic `{{current_year}}`.
6. **"Your Details" Information Card**:
   - Container: Background `#EEF4FF`, border `1px solid #D0E0FC`, border-radius `12px`, padding `18px 20px`.
   - Header Pill: `[📄] Your Details` with Deep Navy background and white bold typography.
   - Grid: Desktop renders two 50% columns separated by a `1px` vertical divider (`class="two-col-divider"`). Each column cell carries `class="two-col-cell"`.
   - Responsive Media Query:
     ```css
     @media only screen and (max-width: 520px) {
       .two-col-cell {
         display: block !important;
         width: 100% !important;
         max-width: 100% !important;
         box-sizing: border-box !important;
         padding-bottom: 12px !important;
         padding-right: 0 !important;
         padding-left: 0 !important;
       }
       .two-col-divider {
         display: none !important;
       }
       .header-tagline {
         display: none !important;
       }
     }
     ```
7. **Action CTA Button**:
   - Dark Navy `#172E58` button with white bold text: `[📥] View Admit Card & Schedule ->`.
8. **Fallback Link Notice**:
   - Soft blue `#EEF4FF` container with `(i)` notice and copyable link with `word-break: break-all`.
9. **Sign-off**:
   - `Best regards,` / `SNPSUNEXUS` / `Your Trusted Education Partner`.
10. **Footer Banner**:
    - Deep navy `#172E58` background, `3px` gold top border (`#C69A4C`).
    - Shield logo emblem + divider + `SNPSUNEXUS`.
    - Right: `© {{current_year}} SNPSUNEXUS. All rights reserved.`
    - Right corner: Contained gold accent polygon (`width: 14px`, `height: 10px`, `transform: skewX(-25deg)`).

### 3.2. Isolated Iframe Modal Preview
Previously, the modal placed the generated HTML into a React `<div>` with `dangerouslySetInnerHTML`. Because CSS media queries depend on the document or iframe window width (not the parent div width), testing in mobile mode failed to collapse table cells, resulting in clipped elements.

**Solution Implemented**:
In `src/views/EmailTemplatesView.tsx`:
```tsx
<iframe
  title="Email Template Preview"
  srcDoc={getInterpolatedHtml(previewTemplate.html_content)}
  className="w-full border-0"
  style={{
    width: previewDevice === 'mobile' ? '375px' : '650px',
    maxWidth: '100%',
    height: previewDevice === 'mobile' ? '650px' : '620px',
    display: 'block',
    background: '#FFFFFF',
  }}
  sandbox="allow-same-origin"
/>
```
- In **Desktop mode (650px)**: The iframe is rendered at `650px`, showing the full two-column information grid and right-aligned tagline.
- In **Mobile mode (375px)**: The iframe is rendered at `375px`. The internal document window has a width of 375px, naturally triggering `@media only screen and (max-width: 520px)`. The columns stack vertically, the tagline is hidden cleanly, and the gold accent ribbons remain fully inside the card boundaries.
- Fabricated indicator `"Simulated with verified test profile"` in the modal footer has been purged completely.

---

## 4. Verification & Browser Evidence

Visual inspection performed by the Visual QA Verifier subagent at `http://localhost:5173`:

| Test Inspection | Viewport | Verified Result | Evidence Path |
|---|---|---|---|
| **Modal Header & Hero Banner** | Desktop 650px | Official emblem, bold title, gold badge, correct author & version | `queue_and_preview_evidence/step_24_shot_1_desktop-preview-modal.png` |
| **Two-Column Info Card** | Desktop 650px | Clean 2-column layout with vertical divider, candidate name, role, email | `queue_and_preview_evidence/step_26_shot_1_desktop-preview-modal-scrolled.png` |
| **CTA, Fallback & Footer** | Desktop 650px | Action button, copyable URL, sign-off, dark footer, no fake profile text | `queue_and_preview_evidence/step_28_shot_1_desktop-preview-modal-bottom.png` |
| **Vertical Stack Info Card** | Mobile 375px | Clean 1-column vertical stacking, no horizontal overflow, zero clipping | `queue_and_preview_evidence/step_30_shot_1_mobile-preview-modal-top.png` |
| **Contained Gold Accent** | Mobile 375px | Header and hero gold ribbons fully contained within card boundary | `queue_and_preview_evidence/step_32_shot_1_mobile-preview-modal-header.png` |
