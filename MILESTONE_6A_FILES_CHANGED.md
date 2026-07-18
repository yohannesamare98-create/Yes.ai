# Milestone 6A — Exact files changed

## New files
- `backend/routes/testAiRoutes.js` — Test AI endpoint
- `client-dashboard/test-ai.html` — Test AI page
- `database/migrations/20260718_intelligence_engine.sql` — schema migration

## Modified files
- `backend/lib/botEngine.js` — full rewrite: structured JSON output,
  Supabase-backed conversation memory, lead-profile merging,
  human-handoff safety net, test-mode entry point
- `backend/server.js` — mounts the new `testAiRoutes`
- `backend/routes/clientRoutes.js` — allows the 3 new `bot_config` fields
  (`policies`, `fallback_message`, `human_handoff_keywords`) through the
  existing update endpoint
- `client-dashboard/index.html` — one additive nav link to Test AI (no
  other change)
- `docs/ENV_VARS.md` — documents optional `OPENAI_MODEL`

## Untouched (verified, not just assumed)
- `backend/routes/whatsappWebhook.js` — zero changes needed; the
  intelligence engine's return shape was kept backward-compatible
- `admin-dashboard/index.html` — no changes
- `landing/` — no changes
- All Milestone 5A security fixes — unmodified

## Required Supabase migration
Run once, in order, in the Supabase SQL Editor (safe to re-run):
```
database/migrations/20260718_intelligence_engine.sql
```
(Assumes Milestones 3/4/5A migrations have already been run, per the
existing files in `database/migrations/`.)

## Required Railway environment variables

No new required variables — Milestone 6A reuses `OPENAI_API_KEY` exactly
as already configured; it does not need to be reconnected or reissued.

| Variable | Required? | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Already required (unchanged) | Same key as before — the intelligence engine reuses the existing OpenAI client |
| `OPENAI_MODEL` | Optional, new | Defaults to `gpt-4o-mini` if unset |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Already required (unchanged) | Needed for conversation memory + lead persistence to work; without them the engine still runs in demo mode |

No changes to `WHATSAPP_*`, `STRIPE_*`, or `GOOGLE_*` variables.
