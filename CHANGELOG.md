# YES.AI — Changelog

## Milestone 6A — OpenAI Intelligence Engine
_This session_

### Added
- **Structured JSON intelligence layer.** `backend/lib/botEngine.js` was
  rewritten so every AI turn returns strict, schema-enforced JSON (via
  OpenAI's `json_schema` structured output mode) containing: `reply`,
  `intent`, `service_or_product`, `lead_temperature`, `qualification_score`,
  `collected_customer_data` (service_needed, budget, urgency, location,
  preferred_date, buying_readiness), `appointment_requested`,
  `human_handoff`, and `conversation_summary`. Nothing was reconnected —
  this reuses the existing `OPENAI_API_KEY` and the existing OpenAI SDK
  client exactly as before.
- **Supabase-backed conversation memory.** The bot now loads a lead's
  prior profile (`collected_customer_data`, `conversation_summary`,
  `lead_temperature`, `qualification_score`) and recent message history
  from Supabase before calling OpenAI, so it remembers previous messages
  and doesn't re-ask questions it already has answers to — and survives
  server restarts, unlike the old in-memory-only cache (which is kept as
  a fallback for demo mode / when Supabase isn't reachable).
- **Turn-over-turn lead profile merging.** `collected_customer_data` only
  gets overwritten for fields the AI actually extracted new information
  for this turn — earlier answers are never silently dropped.
- **Client isolation, unchanged in spirit, extended in scope.** Live
  WhatsApp traffic is still scoped by `whatsapp_number` (`
  getClientByWhatsappNumber`); the new Test AI path is scoped by
  `client_id` after the existing `requireAuth` + `requireClientAccess`
  middleware confirms the caller owns that client. Every Supabase read/
  write anywhere in the engine is filtered by `client_id` — one client's
  business data, leads, and conversation history are never visible to
  another's prompt or response.
- **Fallback & human-handoff rules.**
  - If the OpenAI call itself fails, the engine returns a safe fallback
    reply (`bot_config.fallback_message`, or a sane built-in default) and
    forces `human_handoff = true` rather than leaving the customer
    without a response.
  - The system prompt explicitly instructs the model to never invent
    information and to set `human_handoff = true` instead of guessing
    whenever it lacks verified information or the topic is sensitive
    (legal, medical, complaints, refund disputes).
  - A rule-based safety net (`bot_config.human_handoff_keywords`) forces
    `human_handoff = true` if the customer's message contains any
    configured keyword, regardless of what the model itself decided —
    defense in depth on top of the model's own judgment.
  - The existing `hot_lead_rules.keywords` mechanism is preserved and now
    combined with the model's own `lead_temperature` call: a keyword hit
    can only push a lead's temperature up to `hot`, never override the
    model down.
- **Test AI endpoint + page**, so a client can test their bot's business
  knowledge before connecting live WhatsApp:
  - `POST /api/clients/:id/test-ai` (new `backend/routes/testAiRoutes.js`)
    — authenticated via the existing `requireAuth`/`resolveYesAiRole`/
    `requireClientAccess` middleware (no new auth system). Runs the exact
    same intelligence engine as real WhatsApp messages
    (`runTestMessage()` calls the same prompt-building and OpenAI-calling
    code as `handleIncomingMessage()`). Deliberately writes nothing to
    Supabase — the caller sends the full conversation history each
    request, so repeated testing never creates fake leads or messages in
    the real dashboards.
  - `client-dashboard/test-ai.html` — a new page (not a redesign of the
    existing dashboard) with a chat interface plus a live "what the AI
    understood" inspector panel showing intent, service/product,
    lead temperature, qualification score, collected data, appointment
    flag, human-handoff flag, and the rolling conversation summary for
    every reply. Reachable via a small new "🧪 Test AI" link added to the
    dashboard's top nav — no existing tab, wizard step, or feature was
    touched to add it.
- New `bot_config` fields so the AI has real business knowledge to draw
  on, exposed through the existing client-update API
  (`clientRoutes.js`'s `BOT_CONFIG_UPDATE_FIELDS`, no new endpoint
  needed): `policies`, `fallback_message`, `human_handoff_keywords`.
- `database/migrations/20260718_intelligence_engine.sql` — adds the above
  `bot_config` fields plus `leads.intent`, `leads.service_or_product`,
  `leads.lead_temperature`, `leads.qualification_score`,
  `leads.collected_customer_data`, `leads.appointment_requested`,
  `leads.human_handoff`, `leads.conversation_summary`, and
  `messages.metadata` (stores the full structured JSON per AI turn for
  debugging/audit). Safe to re-run — every change is `IF NOT EXISTS`.

### Tested
- `backend/lib/botEngine.js`'s pure helper functions
  (`keywordForcesHandoff`, `keywordSuggestsHot`, `mergeCollectedData`) are
  now exported and covered by a real unit test importing the actual
  module (see `TEST_GUIDE.md`) — all passing.
- Full backend boot-and-route smoke test performed this session (health
  check, auth-required 401 on the new test-ai route). A live end-to-end
  OpenAI call could not be executed from this environment (no network
  path to api.openai.com here) — see `TEST_GUIDE.md` for exactly how to
  verify a real call once this is deployed with a real `OPENAI_API_KEY`.

### Preserved
- `handleIncomingMessage()`'s return shape (`reply`, `client`, `lead`,
  `isHot`, `skipped`) is unchanged, so `whatsappWebhook.js` required
  **zero edits** — the entire WhatsApp send/receive flow, duplicate-
  message handling, Google Sheets append, and hot-lead alert logic all
  keep working exactly as before.
- No visual redesign of `client-dashboard/index.html` or
  `admin-dashboard/index.html` — the only dashboard change is one small
  additive nav link to the new Test AI page.
- All Milestone 5A security fixes (XSS escaping, CSV injection guard,
  webhook signature verification, rate limiting, helmet, CORS) untouched.

### Known gaps for future milestones
- No dashboard UI yet for editing the new `policies`,
  `fallback_message`, or `human_handoff_keywords` fields — they can be
  set via the API/Supabase directly today; a Bot Settings tab addition
  would be a natural, small follow-up (not bundled here to avoid
  touching the existing dashboard's layout in this pass).
- The in-memory `conversationCache` in `whatsappWebhook.js` is now
  mostly a fallback (Supabase is the primary memory source for any lead
  that already exists) but is still used for a brand-new lead's very
  first message before a `leads` row exists yet — still worth moving to
  Redis before scaling past one backend instance, as flagged in
  Milestone 5A.
- Multilingual dashboard UI (5B) is still not part of this release.

## Milestone 5A — Dashboard Merge, Security Audit & Hardening
_Previous session_


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
