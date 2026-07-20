// backend/services/paymentProviders/paytabsProvider.js
// ============================================================
// PLACEHOLDER — PayTabs is not implemented yet. No PayTabs credentials
// exist in this project, so nothing here makes a real API call.
//
// Implements the same interface as stripeProvider.js so
// paymentProviders/index.js can route to it once it's built for real,
// without any caller needing to change.
//
// To implement later: PayTabs' Hosted Payment Page API (or their
// server-to-server API) for checkout, their IPN webhook for payment
// confirmation, and their refund/cancel endpoints — following the exact
// same three-function shape below.
// ============================================================

export const PROVIDER_NAME = 'PayTabs';

export function isConfigured() {
  return false;
}

export async function createCheckoutSession() {
  throw new Error('PayTabs is not configured yet. Use the Stripe provider, or implement backend/services/paymentProviders/paytabsProvider.js.');
}

export async function cancelSubscription() {
  throw new Error('PayTabs is not configured yet.');
}

export async function handleWebhookEvent() {
  throw new Error('PayTabs is not configured yet.');
}
