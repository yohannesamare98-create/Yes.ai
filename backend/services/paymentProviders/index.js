// backend/services/paymentProviders/index.js
// ============================================================
// Payment provider abstraction. Every provider module exports the same
// shape:
//
//   { name, isConfigured, createCheckoutSession, cancelSubscription,
//     handleWebhookEvent }
//
// Routes and services call getActiveProvider() and never import a
// specific provider directly — that's what makes adding PayTabs (or
// swapping which provider a given client uses) a config change, not a
// code change.
// ============================================================

import * as stripeProvider from './stripeProvider.js';
import * as paytabsProvider from './paytabsProvider.js';
import * as applePayProvider from './applePayProvider.js';
import * as googlePayProvider from './googlePayProvider.js';

const PROVIDERS = {
  stripe: stripeProvider,
  paytabs: paytabsProvider,
  apple_pay: applePayProvider,
  google_pay: googlePayProvider
};

/**
 * Returns the provider module for a given key, defaulting to Stripe
 * (the only fully-implemented provider today). Falls back to Stripe with
 * a warning if an unknown/unimplemented key is requested, rather than
 * throwing — a client record with a not-yet-built provider shouldn't be
 * able to crash a billing page.
 */
export function getProvider(providerKey = 'stripe') {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    console.warn(`[paymentProviders] Unknown provider '${providerKey}', falling back to Stripe.`);
    return stripeProvider;
  }
  return provider;
}

export function listProviders() {
  return Object.entries(PROVIDERS).map(([key, mod]) => ({
    key,
    name: mod.PROVIDER_NAME,
    configured: mod.isConfigured()
  }));
}
