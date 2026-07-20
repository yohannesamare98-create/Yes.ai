// backend/config/planConfig.js
// ============================================================
// THE single source of truth for plan pricing, limits, and feature
// access. Nothing else in the codebase should hardcode a conversation
// limit, overage rate, or "does plan X have feature Y" check — import
// from here instead, so there is exactly one place to update when
// pricing changes.
//
// Runtime-configurable: the actual values live in the `plan_config`
// table (see migrations/20260719_milestone7_billing.sql), so an admin
// can change prices/limits without a code deploy. The constants below
// are only the fallback used if that table can't be reached (e.g. before
// the migration has been run yet) — kept in sync with the migration's
// seed data on purpose.
// ============================================================

import { supabase } from '../lib/supabaseClient.js';

export const FALLBACK_PLANS = {
  starter: { label: 'Starter', monthlyPriceAed: 199, conversationLimit: 300, overageRateAed: 0.40, trialDays: 14 },
  growth:  { label: 'Growth',  monthlyPriceAed: 349, conversationLimit: 1000, overageRateAed: 0.40, trialDays: 14 },
  pro:     { label: 'Pro',     monthlyPriceAed: 599, conversationLimit: 1800, overageRateAed: 0.35, trialDays: 14 }
};

// 'lite' was the pre-Milestone-7 entry-tier name. Existing rows on that
// value keep working — this alias means every lookup below treats them
// identically to 'starter' without rewriting anyone's data.
const PLAN_ALIASES = { lite: 'starter' };

function normalizePlanKey(planKey) {
  return PLAN_ALIASES[planKey] || planKey || 'starter';
}

let cachedPlans = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute — admin price edits show up quickly without hitting the DB on every request

/**
 * Loads plan config from the database, falling back to FALLBACK_PLANS if
 * the table isn't reachable yet (e.g. migration not run, or Supabase not
 * configured — same demo-mode-safe pattern used everywhere else in this
 * backend).
 */
export async function getPlans() {
  if (cachedPlans && Date.now() < cacheExpiresAt) return cachedPlans;

  try {
    const { data, error } = await supabase.from('plan_config').select('*').eq('is_active', true);
    if (error || !data || !data.length) throw error || new Error('no plan_config rows');

    const plans = {};
    for (const row of data) {
      plans[row.plan_key] = {
        label: row.label,
        monthlyPriceAed: Number(row.monthly_price_aed),
        conversationLimit: row.conversation_limit,
        overageRateAed: Number(row.overage_rate_aed),
        trialDays: row.trial_days,
        features: row.features || []
      };
    }
    cachedPlans = plans;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return plans;
  } catch (err) {
    console.warn('[planConfig] plan_config table unavailable, using fallback values:', err.message);
    return FALLBACK_PLANS;
  }
}

export async function getPlan(planKey) {
  const plans = await getPlans();
  return plans[normalizePlanKey(planKey)] || plans.starter;
}

/**
 * The feature-permission check every route/UI should use instead of
 * duplicating plan comparisons. Returns false (not throws) for an
 * unknown feature or plan — fail closed, not open.
 */
export async function planHasFeature(planKey, featureKey) {
  const plan = await getPlan(planKey);
  return Array.isArray(plan.features) && plan.features.includes(featureKey);
}

export { normalizePlanKey };
