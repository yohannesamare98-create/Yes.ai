# CHANGELOG — Test AI Frontend-to-Railway Connection Fix

**File changed:** `client-dashboard/test-ai.html` only. No other file touched.

## Root cause

The client dashboard is deployed on Vercel (`yesai-clinte.vercel.app`); the
backend is a separate Railway deployment. `sendMessage()` called a
**relative** path — `fetch('/api/clients/:id/test-ai')` — which resolves
against the current page's own origin. On Vercel, that resolved to
`https://yesai-clinte.vercel.app/api/clients/:id/test-ai`, which doesn't
exist (no serverless function, no rewrite for `/api/*` in `vercel.json` —
confirmed by inspection, that file only rewrites `/admin` and `/client`
page routes). Vercel returned its own `404`, which the frontend correctly
reported as "Backend unavailable — the Test AI endpoint could not be
reached" — that error message was accurate, not a bug in the error
handling itself; the request was never reaching Railway at all.

## Exact lines changed

**1. New constant added** (right after `const cfg = window.YESAI_CONFIG || {};`):
```js
const RAILWAY_API_BASE_URL = 'https://yesai-production.up.railway.app';
```

**2. Fetch call updated to use it:**
```diff
- const res = await fetch(`/api/clients/${currentClientId}/test-ai`, {
+ const res = await fetch(`${RAILWAY_API_BASE_URL}/api/clients/${currentClientId}/test-ai`, {
```

The request now targets `https://yesai-production.up.railway.app/api/clients/{client_id}/test-ai` exactly as required. The `Authorization: Bearer <Supabase access token>` header was already correctly present from the previous fix — confirmed unchanged and untouched.

## What was NOT touched (confirmed by diff)

`config.js`, `vercel.json`, backend, Supabase, WhatsApp, billing, Setup Wizard, `client-dashboard/index.html`, `admin-dashboard/index.html` — none of these appear anywhere in the diff between this version and the previous delivery.

## Verified before delivery

- `node --check` on the extracted script: pass
- `<div>` balance: correct
- Diffed against my previously-delivered file — confirms exactly these two changes and nothing else

## What I still cannot verify from this sandbox

I have no browser access to `https://yesai-clinte.vercel.app` and no
Railway log access, so I cannot confirm from here whether Railway's CORS
configuration (`ALLOWED_ORIGINS`) already permits requests from that exact
Vercel domain, or what HTTP status the live endpoint actually returns once
the request reaches it. If you deploy this and get a *different* error
than before (e.g. a CORS error in the browser console, or "Unauthorized"
instead of "Backend unavailable"), that's real progress — it means the
request is now reaching Railway, and the new error message will point
directly at the next thing to check (see test steps below).

## Live test steps

1. Deploy this file to `client-dashboard/test-ai.html` on Vercel.
2. Open browser DevTools → Network tab, then open Test AI and send "Hello".
3. Find the request to `yesai-production.up.railway.app/api/clients/.../test-ai` in the Network tab.
4. **If you see a CORS error in the console** (not in the error message on-screen, but a red error in DevTools console mentioning "CORS policy") — Railway's `ALLOWED_ORIGINS` environment variable needs `https://yesai-clinte.vercel.app` added to it. That's a Railway dashboard config change, not a code change.
5. **If the request shows status `401`** — the Supabase session token isn't being accepted; check that you're actually logged in and the token hasn't expired.
6. **If the request shows status `200`** with a real AI reply appearing in the chat — the fix worked end-to-end.
7. Send a follow-up message to confirm conversation memory still works, and check the inspector panel updates with lead score/intent.
