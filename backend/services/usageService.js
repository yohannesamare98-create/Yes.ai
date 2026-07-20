// backend/services/usageService.js
// ============================================================
// Tracks conversation usage against a client's plan limit. This file is
// intentionally NOT called from anywhere yet — in particular, NOT from
// backend/lib/botEngine.js, which is owned by the Milestone 6A work in
// progress and explicitly off-limits here.
//
// SINGLE INTEGRATION POINT (for whoever wires this in, in a later
// milestone or by the 6A developer): after a successful AI reply is
// generated, call:
//
//   import { recordConversationUsage } from '../services/usageService.js';
//   await recordConversationUsage({ clientId, leadId });
//
// That's the entire integration surface — one function call, one place.
// Everything else (limit checking, overage calculation, monthly reset)
// happens inside this file.
// ============================================================

import { supabase } from '../lib/supabaseClient.js';
import { getPlan } from '../config/planConfig.js';

/**
 * Records one billable conversation for a client, incrementing their
 * usage counter and flagging overage once they're past their plan's
 * included limit. Safe to call even if the Milestone 7A migration
 * hasn't been run yet — fails gracefully, logs, and never throws (usage
 * tracking should never be able to break a customer's AI reply).
 */
export async function recordConversationUsage({ clientId, leadId }) {
  try {
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('plan, conversations_used, conversation_limit, usage_reset_at')
      .eq('client_id', clientId)
      .single();
    if (subError || !sub) throw subError || new Error('no subscription row for client');

    await maybeResetMonthlyUsage(clientId, sub);

    const plan = await getPlan(sub.plan);
    const limit = sub.conversation_limit ?? plan.conversationLimit;
    const newUsed = (sub.conversations_used || 0) + 1;
    const isOverage = newUsed > limit;

    await supabase
      .from('subscriptions')
      .update({
        conversations_used: newUsed,
        overage_conversations: isOverage ? newUsed - limit : 0
      })
      .eq('client_id', clientId);

    await supabase.from('conversation_usage_log').insert({ client_id: clientId, lead_id: leadId || null, is_overage: isOverage });

    return { used: newUsed, limit, isOverage };
  } catch (err) {
    console.warn('[usageService] Failed to record usage (non-fatal, reply was still sent):', err.message);
    return null;
  }
}

/** Resets conversations_used to 0 once the monthly reset date has passed. */
async function maybeResetMonthlyUsage(clientId, sub) {
  if (!sub.usage_reset_at || new Date(sub.usage_reset_at) > new Date()) return;
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  await supabase
    .from('subscriptions')
    .update({ conversations_used: 0, overage_conversations: 0, usage_reset_at: nextReset.toISOString() })
    .eq('client_id', clientId);
  sub.conversations_used = 0;
}

/**
 * Returns a client's current usage snapshot — used by the billing
 * dashboard (both client and admin views).
 */
export async function getUsageSnapshot(clientId) {
  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('plan, conversations_used, conversation_limit, overage_conversations, overage_rate, usage_reset_at')
    .eq('client_id', clientId)
    .single();
  if (error || !sub) return null;

  const plan = await getPlan(sub.plan);
  const limit = sub.conversation_limit ?? plan.conversationLimit;
  const used = sub.conversations_used || 0;
  const overageCount = sub.overage_conversations || 0;
  const overageRate = sub.overage_rate ?? plan.overageRateAed;

  return {
    plan: sub.plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percentUsed: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    overageCount,
    overageCostAed: Math.round(overageCount * overageRate * 100) / 100,
    resetAt: sub.usage_reset_at
  };
}
