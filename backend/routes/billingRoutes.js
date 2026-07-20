// backend/routes/billingRoutes.js
// ============================================================
// New billing/subscription endpoints for Milestone 7A. Mounted under the
// same '/api/billing/...' prefix as the existing checkout/webhook/cancel
// routes in stripeRoutes.js (left completely untouched) — client-facing
// routes resolve the caller's client_id from their auth token via the
// existing requireAuth -> resolveYesAiRole middleware (same as
// clientRoutes.js), never from a URL parameter, so a client can only
// ever act on their own subscription.
// ============================================================

import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, resolveYesAiRole, requireAdmin } from '../middleware/auth.js';
import { getPlans, getPlan, normalizePlanKey } from '../config/planConfig.js';
import { getUsageSnapshot } from '../services/usageService.js';

const router = express.Router();
router.use(express.json());

const VALID_PLANS = ['starter', 'growth', 'pro'];

async function loadOwnSubscription(clientId) {
  const { data: sub, error } = await supabase.from('subscriptions').select('*').eq('client_id', clientId).single();
  if (error || !sub) return null;
  return sub;
}

// ---- GET /billing/status — the logged-in client's own billing snapshot ----
router.get('/billing/status', requireAuth, resolveYesAiRole, async (req, res) => {
  if (req.auth.role !== 'client') return res.status(403).json({ error: 'Client access required' });
  const clientId = req.auth.clientId;

  const sub = await loadOwnSubscription(clientId);
  if (!sub) return res.status(404).json({ error: 'No subscription found' });

  const plan = await getPlan(sub.plan);
  const usage = await getUsageSnapshot(clientId);
  const { data: invoices } = await supabase.from('invoices').select('*').eq('client_id', clientId).order('issued_at', { ascending: false }).limit(24);
  const { data: payments } = await supabase.from('payment_history').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(24);

  const trialDaysRemaining = sub.trial_end_date
    ? Math.max(0, Math.ceil((new Date(sub.trial_end_date) - new Date()) / 86400000))
    : null;

  res.json({
    plan: normalizePlanKey(sub.plan),
    planLabel: plan.label,
    monthlyPriceAed: plan.monthlyPriceAed,
    status: sub.status,
    billingCycle: sub.billing_cycle || 'monthly',
    trialStart: sub.trial_start,
    trialEnd: sub.trial_end_date,
    trialDaysRemaining,
    nextBillingDate: sub.next_billing_date,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    usage,
    invoices: invoices || [],
    payments: payments || []
  });
});

async function changePlan(req, res, direction) {
  if (req.auth.role !== 'client') return res.status(403).json({ error: 'Client access required' });
  const clientId = req.auth.clientId;
  const requestedPlan = normalizePlanKey(req.body.plan);

  if (!VALID_PLANS.includes(requestedPlan)) {
    return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
  }

  const sub = await loadOwnSubscription(clientId);
  if (!sub) return res.status(404).json({ error: 'No subscription found' });

  const currentRank = VALID_PLANS.indexOf(normalizePlanKey(sub.plan));
  const requestedRank = VALID_PLANS.indexOf(requestedPlan);
  if (direction === 'upgrade' && requestedRank <= currentRank) {
    return res.status(400).json({ error: `'${requestedPlan}' is not an upgrade from your current plan` });
  }
  if (direction === 'downgrade' && requestedRank >= currentRank) {
    return res.status(400).json({ error: `'${requestedPlan}' is not a downgrade from your current plan` });
  }

  const newPlanConfig = await getPlan(requestedPlan);

  // Updates our side immediately so the dashboard and feature gating
  // reflect it right away. A full production rollout should also call
  // the payment provider's "update subscription item" API here for
  // proration — deferred, since it needs a live Stripe Price ID per
  // plan that isn't set in this environment (see MERGE_INSTRUCTIONS.md).
  const { data: updated, error } = await supabase
    .from('subscriptions')
    .update({ plan: requestedPlan, conversation_limit: newPlanConfig.conversationLimit, overage_rate: newPlanConfig.overageRateAed })
    .eq('client_id', clientId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true, plan: requestedPlan, subscription: updated });
}

// ---- POST /billing/upgrade  { plan } ----
router.post('/billing/upgrade', requireAuth, resolveYesAiRole, (req, res) => changePlan(req, res, 'upgrade'));

// ---- POST /billing/downgrade  { plan } ----
router.post('/billing/downgrade', requireAuth, resolveYesAiRole, (req, res) => changePlan(req, res, 'downgrade'));

// ---- POST /billing/resume — undo a pending cancellation ----
router.post('/billing/resume', requireAuth, resolveYesAiRole, async (req, res) => {
  if (req.auth.role !== 'client') return res.status(403).json({ error: 'Client access required' });
  const clientId = req.auth.clientId;

  const sub = await loadOwnSubscription(clientId);
  if (!sub) return res.status(404).json({ error: 'No subscription found' });
  if (!sub.cancel_at_period_end && sub.status !== 'cancelled') {
    return res.status(400).json({ error: 'Subscription is not cancelled or pending cancellation' });
  }

  const { data: updated, error } = await supabase
    .from('subscriptions')
    .update({ cancel_at_period_end: false, status: sub.status === 'cancelled' ? 'active' : sub.status })
    .eq('client_id', clientId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('clients').update({ bot_status: 'on' }).eq('id', clientId);
  res.json({ success: true, subscription: updated });
});

// =====================================================================
// ADMIN BILLING MANAGEMENT
// =====================================================================

router.get('/billing/providers', requireAuth, resolveYesAiRole, requireAdmin, async (req, res) => {
  const { listProviders } = await import('../services/paymentProviders/index.js');
  res.json(listProviders());
});

router.get('/admin/billing/clients', requireAuth, resolveYesAiRole, requireAdmin, async (req, res) => {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, business_name, industry, bot_status, subscriptions(*)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const rows = await Promise.all((clients || []).map(async c => {
    const sub = Array.isArray(c.subscriptions) ? c.subscriptions[0] : c.subscriptions;
    const usage = sub ? await getUsageSnapshot(c.id) : null;
    return {
      clientId: c.id,
      businessName: c.business_name,
      industry: c.industry,
      botStatus: c.bot_status,
      plan: sub ? normalizePlanKey(sub.plan) : null,
      status: sub?.status || null,
      trialEnd: sub?.trial_end_date || null,
      nextBillingDate: sub?.next_billing_date || null,
      usage
    };
  }));

  res.json(rows);
});

router.get('/admin/billing/summary', requireAuth, resolveYesAiRole, requireAdmin, async (req, res) => {
  const { data: subs, error } = await supabase.from('subscriptions').select('plan, status');
  if (error) return res.status(500).json({ error: error.message });

  const plans = await getPlans();
  let mrr = 0;
  const counts = { active: 0, trialing: 0, past_due: 0, cancelled: 0, failed: 0 };

  for (const sub of subs || []) {
    if (counts[sub.status] !== undefined) counts[sub.status]++;
    if (sub.status === 'active') {
      mrr += plans[normalizePlanKey(sub.plan)]?.monthlyPriceAed || 0;
    }
  }

  res.json({
    mrrAed: mrr,
    arrAed: mrr * 12,
    totalClients: (subs || []).length,
    activeClients: counts.active,
    trialClients: counts.trialing,
    pastDueClients: counts.past_due,
    cancelledClients: counts.cancelled,
    failedClients: counts.failed
  });
});

// =====================================================================
// ADMIN PLAN SETTINGS — edit prices/limits/features without a code deploy
// =====================================================================

router.get('/admin/plan-config', requireAuth, resolveYesAiRole, requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('plan_config').select('*').order('monthly_price_aed', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/admin/plan-config/:planKey', requireAuth, resolveYesAiRole, requireAdmin, async (req, res) => {
  const allowedFields = ['monthly_price_aed', 'conversation_limit', 'overage_rate_aed', 'trial_days', 'features', 'is_active', 'label'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowedFields.includes(k)));
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('plan_config').update(updates).eq('plan_key', req.params.planKey).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
