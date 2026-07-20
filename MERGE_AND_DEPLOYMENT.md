# Milestone 7A — Merge Instructions, Environment Variables, Production Checklist

## I did not create a branch, commit, or push anything

No GitHub connector is available in this chat and I have no write access to
your repository — this has been true throughout this project. Everything
below is exactly what to run yourself.

## Git — create the branch and commit (run these yourself)

```bash
# From your local clone of the repo, on main, up to date:
git checkout -b milestone-7-billing

# Extract this ZIP over your working directory, then:
git add database/migrations/20260719_milestone7_billing.sql
git add backend/config/planConfig.js
git add backend/services/usageService.js
git add backend/services/paymentProviders/
git add backend/routes/billingRoutes.js
git add backend/server.js
git add admin-dashboard/index.html
git add client-dashboard/index.html
git add CHANGELOG_MILESTONE_7.md TEST_GUIDE_MILESTONE_7.md MILESTONE_7_FILES_CHANGED.md MERGE_AND_DEPLOYMENT.md

git commit -m "Milestone 7A: Billing, Subscriptions & Pricing System

- Central plan config (Starter/Growth/Pro) driven by plan_config table
- Payment provider abstraction (Stripe implemented, PayTabs/Apple Pay/Google Pay stubbed)
- Conversation usage tracking service (not yet wired into AI engine — see MILESTONE_7_FILES_CHANGED.md)
- New /api/billing/* and /api/admin/billing/* endpoints
- Extended (not redesigned) client + admin billing dashboards
- Additive Supabase migration, zero destructive statements
- Zero changes to AI Intelligence Engine, WhatsApp Engine, or Authentication"

git push -u origin milestone-7-billing
```

**Do not merge into `main` yourself either** — open a PR from
`milestone-7-billing` and merge it the same way you'd review any other
change, especially since Milestone 6A is landing in parallel and you'll
want to confirm both branches reconcile cleanly.

## Supabase — run the migration

1. Supabase Dashboard → your project → SQL Editor
2. Paste the full contents of `database/migrations/20260719_milestone7_billing.sql`
3. Run it
4. Confirm no errors, and spot-check: `select * from plan_config;` should return exactly 3 rows

Safe to run before or after merging the branch — it's purely additive and
doesn't depend on any of the changed application code.

## Environment variables

**No new required environment variables.** This milestone reuses the
existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`STRIPE_PRICE_LITE/GROWTH/PRO` (already in `docs/ENV_VARS.md`) — `stripeProvider.js`
maps the new plan name `starter` to the existing `STRIPE_PRICE_LITE` env var
automatically, so nothing needs to be renamed in Railway.

PayTabs, Apple Pay, and Google Pay intentionally define **zero** environment
variables — they're inert stubs and reading an env var that doesn't exist
yet would be pointless. When one of them is actually implemented, add its
variables to `docs/ENV_VARS.md` at that time.

## Production checklist

- [ ] Migration run against production Supabase (see above)
- [ ] Verified `select * from plan_config` returns 3 rows with correct prices
- [ ] Backend deployed to Railway, `/health` still returns `200`
- [ ] Smoke-tested: log in as an existing client, confirm the Billing tab loads without errors (check browser console)
- [ ] Smoke-tested: `/api/billing/status` returns real data for a logged-in client (not just `401`)
- [ ] Smoke-tested: admin dashboard's Billing view shows the new MRR/ARR row with real numbers, not `AED 0` for every client
- [ ] Confirmed existing WhatsApp bot still replies to a real test message (this milestone shouldn't have touched that, but verify before considering the deploy final)
- [ ] Confirmed existing Stripe checkout/cancel flows still work end-to-end with a real card
- [ ] Decided when/how to wire `recordConversationUsage()` into the AI reply pipeline (coordinate with whoever owns Milestone 6A)
- [ ] Decided whether to implement real Stripe proration for upgrade/downgrade, or accept the current "updates immediately on our side, webhook reconciles billing separately" behavior for launch

## What "all together, no regressions" actually means here

I can't run your real Railway/Vercel/Supabase/Meta/OpenAI stack from this
sandbox — I have no credentials for any of them. What I *can* and *did*
verify: this milestone's code doesn't change the interface, behavior, or
file contents of anything those systems depend on (WhatsApp webhook,
Stripe webhook, Supabase client init, auth middleware, AI engine files —
all confirmed byte-identical via diff against your uploaded project). The
new billing code is independently tested against a local server instance
with the same demo-mode-safe patterns already used throughout this
codebase. The remaining verification — real data flowing through a real
Supabase project, a real WhatsApp message, a real Stripe charge — can only
happen once this is actually deployed, which I have not done and am not
claiming to have done.
