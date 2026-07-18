# YES.AI — Changelog

## Milestone 5A — Dashboard Merge, Security Audit & Hardening
_This session_

### Removed
- `YESAI_CLIENT_DASHBOARD_V2.zip` — its contents are now merged directly
  into `client-dashboard/index.html`, so keeping the zip around would have
  been a stale, confusing duplicate of the live file.

### Merged
- Replaced `client-dashboard/index.html` with the fixed "V2" version
  (previously only shipped as `YESAI_CLIENT_DASHBOARD_V2.zip` in the repo,
  never merged into the live file). This resolves the login/dashboard
  race condition, adds the dedicated session-loading state, the
  Google/magic-link/forgot-password auth flows, the premium status hero,
  and the mobile Setup Wizard fixes described in
  `CHANGELOG_CLIENT_DASHBOARD_V2.md`.
- Confirmed `client-dashboard/config.js` and `client-dashboard/signup.html`
  were already identical between the zip and the live repo — no changes
  needed there.

### Fixed — Security
- **Stored XSS in both dashboards (High).** `customer_name`,
  `customer_whatsapp`, `message_summary`, appointment `service`, and
  `status` values — all of which originate from untrusted WhatsApp
  customer input — were inserted into the DOM via `innerHTML` without
  escaping. A customer could message something like `<img src=x
  onerror=...>` as their name and have it execute in the business
  owner's or your own admin dashboard. Added a shared `escapeHtml()`
  helper and applied it at every render site for lead/appointment data
  in `client-dashboard/index.html` and `admin-dashboard/index.html`.
- **CSV formula/injection risk (Medium).** Lead exports (`Export CSV`)
  wrote WhatsApp-sourced fields directly into CSV cells. A cell starting
  with `=`, `+`, `-`, or `@` can execute as a formula when the file is
  opened in Excel/Google Sheets. Both dashboards' `exportCSV()` now
  prefix such cells with a leading `'` so spreadsheet apps treat them as
  plain text.
- **Unauthenticated WhatsApp webhook (High).** `POST /webhook` accepted
  and processed any request with no verification that it actually came
  from Meta — anyone who found the URL could forge leads, trigger hot-lead
  alerts, and spend your OpenAI budget. Added `verifyMetaSignature()`
  middleware that recomputes the HMAC-SHA256 of the raw request body using
  a new `WHATSAPP_APP_SECRET` env var and compares it to Meta's
  `X-Hub-Signature-256` header with a timing-safe comparison. Requests with
  a missing or invalid signature are rejected with `401`. Matches the
  codebase's existing demo-mode pattern: if `WHATSAPP_APP_SECRET` isn't set
  yet, it logs a warning and allows the request through instead of hard
  failing, so nothing breaks before you've gone live.
- **No security headers.** Added `helmet()` globally (HSTS, X-Content-Type-Options,
  and friends) with no behavior change to any existing route.
- **No rate limiting.** Added `express-rate-limit`: 120 req/min on `/api`,
  60 req/min on `/webhook` — generous for real usage, enough to stop a
  leaked URL or scraper from running up your database/AI costs.
- **Unrestricted CORS.** Added `cors()` with a new `ALLOWED_ORIGINS` env
  var. Leaving it unset preserves current (open) behavior for demo mode;
  set it to your real dashboard domain(s) before going to production.
- **No request size limit.** `express.json()` now caps body size at `1mb`.

### Added
- `WHATSAPP_APP_SECRET` and `ALLOWED_ORIGINS` documented in
  `docs/ENV_VARS.md`.
- `helmet`, `cors`, `express-rate-limit` added to `backend/package.json`.

### Preserved
- No visual redesign of either dashboard. No existing tabs, wizard steps,
  integrations, billing logic, or demo-mode fallbacks were removed or
  changed in behavior — only untrusted-data rendering was made safe.
- Backend demo-mode-safe pattern (log-and-continue when an integration key
  is missing) preserved for the new webhook signature check.

### Known gaps for future milestones (not in this pass)
- Multilingual support (English, Arabic RTL, French, Spanish, Portuguese,
  Amharic, Chinese, Hindi) — scoped as its own milestone (5B), since it
  touches every UI string in both dashboards, the landing page, and the
  bot's system prompt — too large to bundle safely into this security pass.
- `admin-dashboard/index.html` does not yet have the same session-loading
  state (`app-loading`) that the client dashboard now has — worth a small
  follow-up for consistency.
- In-memory conversation cache in `whatsappWebhook.js` is explicitly
  flagged in the code as fine for launch but not multi-instance safe —
  worth moving to Redis before scaling past one backend instance.
- No automated test suite exists yet; `TEST_GUIDE.md` in this release is a
  manual test script.
