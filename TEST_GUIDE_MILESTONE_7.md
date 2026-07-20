# TEST_GUIDE — Milestone 7A: Billing System

## What I already ran, and the real result (not claims)

```
cd backend
npm install                    # 127 packages, clean
node server.js                 # starts with zero env vars, stays up
curl localhost:3000/health     # {"status":"ok", ...} — identical shape to before
```

Every endpoint below was hit with `curl` against the running server with no
`SUPABASE_URL`/`OPENAI_API_KEY`/etc. set (worst case) and confirmed to fail
*gracefully* (correct HTTP status, no crash) rather than actually exercising
real billing logic — that part needs your real Supabase project. Both are
documented separately below.

## One real bug I found and fixed before you ever saw this code

The first draft of the migration used `CREATE POLICY IF NOT EXISTS`, which
**is not valid PostgreSQL syntax** — Postgres has no `IF NOT EXISTS` clause
for `CREATE POLICY`. Running it would have failed outright. Fixed to the
correct idempotent pattern (`DROP POLICY IF EXISTS` then `CREATE POLICY`)
before this delivery. Caught by re-reading the file, not by running it
against a real database — worth a second look yourself before you run it.

## Part 1 — Backend (can be tested right now, no Supabase needed)

```bash
cd backend
npm install
node server.js
```

| Test | Command | Expect |
|---|---|---|
| Health unchanged | `curl localhost:3000/health` | `status: ok`, same shape as before Milestone 7A |
| WhatsApp webhook unchanged | `curl "localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"` | `403` |
| Old `/api/clients` unchanged | `curl localhost:3000/api/clients` | `401` |
| New: billing status requires auth | `curl localhost:3000/api/billing/status` | `401` |
| New: upgrade requires auth | `curl -X POST localhost:3000/api/billing/upgrade` | `401` |
| New: downgrade requires auth | `curl -X POST localhost:3000/api/billing/downgrade` | `401` |
| New: resume requires auth | `curl -X POST localhost:3000/api/billing/resume` | `401` |
| New: admin billing list requires auth | `curl localhost:3000/api/admin/billing/clients` | `401` |
| New: admin billing summary requires auth | `curl localhost:3000/api/admin/billing/summary` | `401` |
| New: admin plan-config requires auth | `curl localhost:3000/api/admin/plan-config` | `401` |
| Old Stripe checkout still mounted | `curl -X POST localhost:3000/api/billing/checkout` | `200` (or the same response you got before this change — untouched file) |
| Old Stripe cancel still mounted | `curl -X POST localhost:3000/api/billing/cancel` | `401` (needs a real session token, same as before) |

## Part 2 — Database migration (needs your real Supabase project)

1. Supabase Dashboard → SQL Editor
2. Paste and run `database/migrations/20260719_milestone7_billing.sql`
3. Expect: no errors, and these new/changed objects exist afterward:
   - `subscriptions` has 7 new columns (`billing_cycle`, `trial_start`, `conversation_limit`, `conversations_used`, `overage_conversations`, `overage_rate`, `usage_reset_at`, `payment_provider`)
   - New tables: `payment_history`, `conversation_usage_log`, `plan_config`
   - `plan_config` has exactly 3 rows: `starter`, `growth`, `pro`, with the prices from the spec
   - RLS is enabled on all 3 new/extended tables
4. Re-run the same file a second time — every statement is guarded (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), so it should complete with no errors and no duplicate rows.

## Part 3 — Full end-to-end (needs real Supabase + a real logged-in client)

Only possible once the migration has been run and you have a real client account:

1. **Log into the client dashboard** → Billing tab.
2. **Usage bar** — should show `0 / <plan limit>` for a fresh subscription (0%).
3. **Upgrade** — click Upgrade Plan, enter `growth` → confirm the Plan field updates and the usage bar's limit changes to 1,000.
4. **Downgrade** — click Downgrade Plan, enter `starter` → confirm it's rejected if you're already on Starter (400 error, "not a downgrade"), accepted otherwise.
5. **Cancel** — existing flow, should still work exactly as before (untouched code path).
6. **Resume** — after cancelling, the "Resume Subscription" button should appear; click it → status returns to active, bot turns back on.
7. **Usage warnings** — manually set `conversations_used` close to the limit in Supabase's table editor (e.g. 80% of `conversation_limit`) and reload the Billing tab → confirm the amber warning appears; push it to 100%+ → confirm it turns red and says "Limit Reached."
8. **Admin dashboard** → Billing view → confirm MRR/ARR summary row appears above the table, and the Usage column shows real numbers per client.
9. **Admin plan settings** — `PATCH /api/admin/plan-config/starter` with `{"monthly_price_aed": 249}` (using an admin's auth token) → confirm the client dashboard's displayed price updates within 60 seconds (the cache TTL) without any code change or redeploy.

## Known limitation to test for specifically

`recordConversationUsage()` in `usageService.js` is **not called by anything
yet** — usage will stay at 0 until it's wired into the AI reply pipeline (see
`MILESTONE_7_FILES_CHANGED.md` for the exact one-line integration point).
Don't be surprised when usage doesn't increment after a real WhatsApp
conversation — that's expected until that wiring happens.
