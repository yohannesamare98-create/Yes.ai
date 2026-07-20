// backend/services/paymentProviders/stripeProvider.js
// ============================================================
// The real, working provider — implemented by wrapping the existing
// backend/lib/stripeClient.js (untouched, not duplicated) behind the
// common provider interface every other provider module also implements.
// ============================================================

import {
  createCheckoutSession as stripeCreateCheckoutSession,
  cancelSubscriptionAtPeriodEnd as stripeCancelSubscription,
  handleStripeEvent,
  STRIPE_DEMO_MODE
} from '../../lib/stripeClient.js';

export const PROVIDER_NAME = 'Stripe';

export function isConfigured() {
  return !STRIPE_DEMO_MODE;
}

// The underlying stripeClient.js still keys its Stripe Price ID map on
// the pre-Milestone-7 plan name 'lite'. Normalizing here means nothing
// in that working file needs to change.
function toLegacyPlanKey(planKey) {
  return planKey === 'starter' ? 'lite' : planKey;
}

export async function createCheckoutSession({ clientId, plan, customerEmail, successUrl, cancelUrl }) {
  return stripeCreateCheckoutSession({ clientId, plan: toLegacyPlanKey(plan), customerEmail, successUrl, cancelUrl });
}

export async function cancelSubscription(clientId) {
  return stripeCancelSubscription(clientId);
}

export async function handleWebhookEvent(event) {
  return handleStripeEvent(event);
}
