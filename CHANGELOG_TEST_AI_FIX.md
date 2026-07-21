# CHANGELOG — Test AI Infinite Loading Fix

**File changed:** `client-dashboard/test-ai.html` (only file — confirmed by diff against the fetched repo)

## Exact root cause

`boot()` (controls the full-page loading spinner) and `sendMessage()`
(controls the Send button) both awaited network calls —
`sb.auth.getSession()`, `sb.from('client_users')...`, and
`fetch('/api/clients/:id/test-ai')` — with **no timeout, no
AbortController, no maximum wait**. If any one of those calls stalled
instead of failing outright (slow/unreachable Supabase, a Railway cold
start, a slow OpenAI response, a network hiccup), the page had no
mechanism to ever leave the loading state — it just waited forever.

This is completely unrelated to Meta/WhatsApp configuration status. I
traced the backend route (`testAiRoutes.js`), the AI engine's test path
(`botEngine.js`'s `runTestMessage`/`getClientById`), and the auth
middleware (`auth.js`) — all three were already correctly built,
WhatsApp-independent, and properly resolve `client_id` server-side from
the verified Supabase JWT (never trusting a value from the browser). None
of them needed to change.

## What was fixed (frontend only)

1. **`withTimeout()` helper** — wraps the Supabase session/client-lookup calls in `boot()` with a 12s cap.
2. **Specific, distinct error messages** matching every case requested: *Session expired*, *Client account not found*, *Backend unavailable*, *Unauthorized*, *AI request failed*.
3. **Retry button** — appears whenever the failure is transient/recoverable (timeout, backend unavailable), reruns `boot()` in place. Not shown for "please log in" or "account not linked," since those need a real action, not a retry.
4. **`sendMessage()` now uses `AbortController`** with a 30s cap on the AI request specifically, and distinguishes `401` / `403` / `404` / timeout / network failure into the specific messages above.
5. **Hard failsafe watchdog** — a top-level 15s timer that forces the page out of the loading state no matter what, even if something inside `boot()` misbehaves in a way the primary timeout wrapper doesn't catch.
6. **Conversation is preserved on every recoverable error** — `history` is never cleared in any catch/error branch, so hitting an error and retrying continues the same conversation instead of losing it.

## What was deliberately NOT changed, and why

- **No backend changes.** The route, auth middleware, and AI engine's test invocation were already correct — confirmed by reading the code and by testing the live server (see Test Results below), not just by inspection.
- **No server-side OpenAI timeout added.** `callIntelligenceEngine()` in `botEngine.js` is shared by both Test AI and real WhatsApp messages. Adding a timeout there would touch WhatsApp production logic, which was explicitly off-limits. The frontend's `AbortController` achieves the same "never hang forever" goal for Test AI without touching that shared code.
- **No CORS change.** `server.js` already falls back to a permissive CORS policy when `ALLOWED_ORIGINS` isn't set, and to an explicit allowlist when it is — neither path was contributing to the hang. Worth double-checking `ALLOWED_ORIGINS` in Railway includes your actual dashboard domain if you've set it, but nothing needed to change in code.
- **No Supabase schema change.** The existing schema (`client_users`, `clients`, `bot_config`) already fully supports resolving an authenticated user to their client and loading their business profile — the bug was never a data-model gap, it was a missing timeout on the frontend. There is no schema reason for this bug, so none was touched.
- **No environment variable changes.** Nothing about this fix depends on new configuration.

## Test results

| Check | Result |
|---|---|
| Backend starts with zero env vars | ✅ Verified live — starts, stays up, `/health` unchanged |
| `POST /api/clients/:id/test-ai` requires auth | ✅ Verified live — `401` with no token |
| WhatsApp webhook unaffected | ✅ Verified live — `403` on bad verify token, identical to before |
| `test-ai.html` syntax (extracted script) | ✅ `node --check` passes |
| `test-ai.html` HTML structure | ✅ `<div>` balance 32/32 |
| Diff against original repo | ✅ Confirms `test-ai.html` is the *only* file that changed |
| **Full live flow: real login → real message → real OpenAI reply → lead scoring** | ❌ **Not verified** — this sandbox has no real Supabase project or OpenAI key. This requires your actual Railway/Supabase deployment; manual steps below. |

I am not claiming the full end-to-end flow works from a live user's
perspective — only that the specific bug (infinite loading) is fixed, and
that everything I *could* verify without real credentials, I did verify by
actually running it, not just reading the code.

## Manual test steps (for you, against the real deployment)

1. Open Test AI while logged out → should show "Please log in..." within ~1s (not stuck loading).
2. Log in, open Test AI → page should reach the chat screen within a couple of seconds.
3. To confirm the timeout actually works: temporarily block `*.supabase.co` in your browser's dev tools (Network conditions → block request domain), reload Test AI → within 12–15s you should see "Session check timed out..." with a working Retry button, never a stuck spinner. Unblock and click Retry → page should load normally.
4. Send a real test message → reply should appear; if it takes unusually long, confirm it fails at 30s with "AI request failed — the request timed out" rather than hanging, and that the Send button re-enables.
5. Send a follow-up message → confirm the AI still has context from the first message (conversation memory).
6. Check the inspector panel updates with lead score/intent/temperature after a qualifying message.
7. Log in as a second client account, open Test AI → confirm you only ever see that client's own business data, never the first client's.
