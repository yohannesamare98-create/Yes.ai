// backend/services/paymentProviders/applePayProvider.js
// ============================================================
// PLACEHOLDER — Apple Pay is not implemented yet. Apple Pay in practice
// is a payment METHOD processed through an underlying processor (Stripe
// supports Apple Pay directly, for example) rather than a separate
// billing backend — implementing this for real likely means enabling
// Apple Pay as a payment method inside stripeProvider.js's checkout
// session, plus Apple Merchant domain verification, rather than building
// a fully separate provider from scratch. Left as its own file here so
// the interface and the decision are both explicit, not because it
// necessarily needs a fully independent implementation.
// ============================================================

export const PROVIDER_NAME = 'Apple Pay';

export function isConfigured() {
  return false;
}

export async function createCheckoutSession() {
  throw new Error('Apple Pay is not configured yet.');
}

export async function cancelSubscription() {
  throw new Error('Apple Pay is not configured yet.');
}

export async function handleWebhookEvent() {
  throw new Error('Apple Pay is not configured yet.');
}
