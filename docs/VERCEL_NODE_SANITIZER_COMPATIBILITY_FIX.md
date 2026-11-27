# Vercel Node.js & `sanitize-html` / `htmlparser2` Compatibility Fix

**Issue:** `SERVERLESS_BOOTSTRAP_FAILED` on Vercel Serverless Functions  
**Exact Production Error:**
`require() of ES Module /var/task/node_modules/htmlparser2/dist/index.js from /var/task/node_modules/sanitize-html/index.js not supported.`

---

## 1. Root Cause & Dependency Inspection

Commands run cleanly in the repository root (`v22.21.1` locally):

```text
$ node -v
v22.21.1

$ npm ls sanitize-html htmlparser2
snpsunexus-mail-studio@1.0.0 C:\Users\Ananya\SNPSUNEXUS-Mail-Studio
+-- @types/sanitize-html@2.16.2
| `-- htmlparser2@12.0.0
`-- sanitize-html@2.18.2
  `-- htmlparser2@12.0.0 deduped

$ npm explain htmlparser2
htmlparser2@12.0.0
node_modules/htmlparser2
  htmlparser2@"^12.0" from @types/sanitize-html@2.16.2
    dev @types/sanitize-html@"^2.16.2" from the root project
  htmlparser2@"^12.0.0" from sanitize-html@2.18.2
    sanitize-html@"^2.18.2" from the root project
```

### Why Local Worked While Vercel Failed
- `sanitize-html@2.18.2` uses CommonJS (`main: index.js`) and calls `require('htmlparser2')`.
- `htmlparser2@12.0.0` is pure ESM (`"type": "module"`), so `sanitize-html@2.18.2` declares Node `>=22.12.0` where Node enables synchronous `require(esm)` by default.
- Local development runs Node `v22.21.1`, where `require('htmlparser2')` succeeds seamlessly.
- Because `package.json` originally omitted `engines.node` and `.nvmrc`, Vercel executed `api/index.js` on Node `20.x`, throwing `ERR_REQUIRE_ESM` before Express could initialize.

---

## 2. Why Downgrading `sanitize-html` Was Rejected

Downgrading to `sanitize-html@2.17.3` was rejected on security grounds: `sanitize-html@2.18.0+` introduces upstream parser updates and security fixes for `<noscript>` XSS, `<meta http-equiv="refresh">` bypass, SVG animation XSS, and `iframe` recursion/DoS advisories present in `2.17.3`. Preserving `sanitize-html@^2.18.2` maintains full XSS protection without regressing security posture.

---

## 3. Changes Implemented

1. **Dependency & Lockfile Alignment (`package.json`, `package-lock.json`):**
   - Maintained `"sanitize-html": "^2.18.2"` resolving to a single deduped `htmlparser2@12.0.0`.
   - Set `"engines": { "node": "22.x" }` in root `package.json` (Vercel's supported major runtime selector).
2. **Version Pinning Files (`.nvmrc`, `.node-version`):**
   - Added `22.12.0` to `.nvmrc` and `.node-version` matching the minimum Node version required by `sanitize-html@2.18.2` `require(esm)`.
3. **Inline CSS & HTML Sanitization Hardening (`backend/src/utils/emailHtmlSanitizer.js`):**
   - Preserved `EMAIL_SANITIZE_OPTIONS` allowlisted tags, attributes, `https`/`http`/`mailto`/`cid` URI schemes, and `<style>` CSS filtering (`sanitizeEmailCssBlock`).
   - Added `sanitizeInlineStyleAttribute` via `transformTags['*']` so inline `style=""` declarations containing `url(...)`, `expression(...)`, `javascript:`, `vbscript:`, `behavior:`, `@import`, or angle brackets are stripped without breaking safe branded email table layout CSS.
4. **Runtime & Sanitizer Health Verification (`backend/src/controllers/healthController.js`):**
   - `GET /api/health` now exposes `nodeVersion: process.version` and `sanitize_html_loaded: sanitizerReady` (verifying `sanitizeEmailHtml('<p>ok</p>') === '<p>ok</p>'`) cleanly without exposing secrets.

---

## 4. Verification Summary

- Clean reinstall & lockfile integrity: `npm ci` completed cleanly (`297` packages audited; zero duplicate `htmlparser2` trees).
- Direct ESM / Vercel entrypoint verification on Node `v22.21.1`: importing `./api/index.js` and executing `sanitizeEmailHtml` succeeded (`VERCEL_ENTRYPOINT_OK nodeVersion=v22.21.1`).
- Automated test checks: `npx tsc --noEmit`, `npm run build` (`24.99s`), and `node backend/tests/run-full-suite.js` passed all **220 tests across 9 suites**, including:
  - Test 30 (`backend/tests/template.test.js`): confirms inline `style="...;background:url(javascript:alert(1));..."`, `expression(...)`, `<noscript>`, `<meta http-equiv="refresh">`, `<svg><animate onbegin>`, `onclick`, and `javascript:` `href` are stripped while table layout and safe CSS properties (`color:#172E58`) remain intact.
  - Test 12 (`backend/tests/production-api-verification.test.js`): confirms `GET /api/health` returns `nodeVersion === process.version` and `sanitize_html_loaded === true`.
- **Deployment Checklist Note:** Ensure Vercel Project Settings -> Build & Deployment -> **Node.js Version** is set to **`22.x`** if previously pinned manually in the dashboard.
