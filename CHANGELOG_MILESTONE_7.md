# CHANGELOG — Milestone 7A: Billing, Subscriptions & Pricing System

**Branch:** `milestone-7-billing` (not created/pushed by me — no GitHub write access; see MERGE_INSTRUCTIONS below)
**Status:** Built and validated locally. **Not deployed.**

## Summary

A production-ready billing and subscription system, built entirely additive
on top of the existing YES.AI backend/dashboards. Zero files belonging to
the AI Intelligence Engine, WhatsApp Engine, or Authentication were
modified — verified by diff against the uploaded project ZIP.

## New files (10)

| File | Purpose |
|---|---|
| `database/migrations/20260719_milestone7_billing.sql` | Additive migration — extends `subscriptions`, adds `payment_history`, `conversation_usage_log`, `plan_config` (admin-editable pricing/limits, seeded with Starter/Growth/Pro) |
| `backend/config/planConfig.js` | Single source of truth for plan pricing, limits, and feature gating. Reads from `plan_config` at runtime (cached 60s), falls back to hardcoded values if the table isn't reachable yet |
| `backend/services/usageService.js` | Conversation usage tracking + monthly reset. **Not called from the AI engine** — one documented integration point (`recordConversationUsage()`) left for whoever wires it in |
| `backend/services/paymentProviders/index.js` | Payment provider abstraction — routes to a provider by key, never hardcoded |
| `backend/services/paymentProviders/stripeProvider.js` | Real implementation, wraps the existing `backend/lib/stripeClient.js` (untouched, not duplicated) |
| `backend/services/paymentProviders/paytabsProvider.js` | Inert stub — same interface, throws "not configured" until built |
| `backend/services/paymentProviders/applePayProvider.js` | Inert stub |
| `backend/services/paymentProviders/googlePayProvider.js` | Inert stub |
| `backend/routes/billingRoutes.js` | New `/api/billing/status`, `/upgrade`, `/downgrade`, `/resume`, `/providers`, `/api/admin/billing/clients`, `/summary`, `/api/admin/plan-config` (GET+PATCH) |

## Changed files (3)

| File | What changed |
|---|---|
| `backend/server.js` | 2 additive lines: import + mount `billingRoutes` alongside the existing `clientRoutes`/`testAiRoutes` mounts. Nothing else touched. |
| `admin-dashboard/index.html` | Removed a hardcoded, stale plan-price map (`{lite:99, growth:199, pro:399}` — pre-Milestone-7 prices that had drifted from reality) and replaced MRR with a live value from the new `/api/admin/billing/summary` endpoint. Added an MRR/ARR/status-counts summary row and a Conversation Usage column to the existing billing table — same table, same styling, extended not redesigned. |
| `client-dashboard/index.html` | Extended the existing Billing tab: usage progress bar with 80/90/100% warning states, overage estimate, Upgrade/Downgrade/Resume buttons wired to the new backend endpoints, Payment History table. Existing Cancel Subscription flow (calls the untouched `/api/billing/cancel`) left exactly as-is. |

## Plan model

- **Starter** AED 199/mo, 300 conversations, AED 0.40/overage
- **Growth** AED 349/mo, 1,000 conversations, AED 0.40/overage
- **Pro** AED 599/mo, 1,800 conversations, AED 0.35/overage

All three fully seeded in `plan_config` with the complete feature list from
the spec. The pre-existing plan name `'lite'` is treated as a permanent
alias for `'starter'` everywhere (`normalizePlanKey()`) — no existing
subscription rows are rewritten by the migration.

## Explicitly deferred (documented, not silently skipped)

- **Real proration via the payment provider** — upgrade/downgrade currently updates the plan on our side immediately (dashboard + feature gating reflect it right away) but doesn't yet call Stripe's "update subscription item" API, because that needs a live Stripe Price ID per new plan tier that doesn't exist in this environment. The webhook that reconciles actual billing (`backend/routes/stripeRoutes.js`, untouched) still runs as before.
- **PayTabs / Apple Pay / Google Pay** — architecture is real and ready (same interface as Stripe); no live implementation, since no credentials exist for any of them.
- **Usage tracking is not yet live** — `usageService.js` is complete and tested in isolation, but isn't called anywhere yet because that call belongs inside the AI reply pipeline, which is explicitly off-limits (Milestone 6A in progress). One function call, one documented location — see `MILESTONE_7_FILES_CHANGED.md`.

## Verified before packaging (not just written — actually run)

- Fresh `npm install`: clean, 127 packages, zero new dependencies added
- `node --check` on every backend `.js` file: pass
- Every relative import in the backend resolves, exact case: pass
- Server starts with zero env vars, stays up, `/health` unchanged
- All 9 new endpoints return `401` with no auth token
- All pre-existing endpoints (`/webhook`, `/api/clients`, `/api/billing/checkout`, `/api/billing/cancel`, `/api/test-ai/*`) behave identically to before — zero regressions
- Both dashboard files: `<div>` balance correct, extracted script passes `node --check`
- SQL migration: parens/quotes balanced, zero destructive statements (no `DROP`, `DELETE`, `TRUNCATE`), zero invalid Postgres syntax (caught and fixed an invalid `CREATE POLICY IF NOT EXISTS` before this delivery — see TEST_GUIDE.md)

**Not verified** (cannot be, from this environment): the migration has not been run against a live Supabase instance, since I have no credentials for it. See "Supabase migration steps" below for exactly how to do that yourself before merging.
