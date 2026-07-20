// backend/services/paymentProviders/googlePayProvider.js
// ============================================================
// PLACEHOLDER — Google Pay is not implemented yet. Same note as
// applePayProvider.js: in practice this is usually enabled as a payment
// method on an existing processor (Stripe supports Google Pay directly)
// rather than built as an independent billing backend.
// ============================================================

export const PROVIDER_NAME = 'Google Pay';

export function isConfigured() {
  return false;
}

export async function createCheckoutSession() {
  throw new Error('Google Pay is not configured yet.');
}

export async function cancelSubscription() {
  throw new Error('Google Pay is not configured yet.');
}

export async function handleWebhookEvent() {
  throw new Error('Google Pay is not configured yet.');
}
