// backend/lib/stripeClient.js
// ============================================================
// Stripe subscription helpers: checkout with 14-day trial,
// plan upgrade/downgrade, and cancellation.
// DEMO MODE: if STRIPE_SECRET_KEY is not set, functions return
// fake IDs so the rest of the flow (Supabase writes, dashboard
// display) can be built and tested before Stripe is connected.
// ============================================================

import Stripe from 'stripe';
import { supabase } from './supabaseClient.js';

const DEMO_MODE = !process.env.STRIPE_SECRET_KEY;
const stripe = DEMO_MODE ? null : new Stripe(process.env.STRIPE_SECRET_KEY);

// Map our plan names to Stripe Price IDs (create these in your Stripe Dashboard).
// Monthly recurring price only — setup fee is charged as a separate one-time invoice item.
const PRICE_IDS = {
  lite:   process.env.STRIPE_PRICE_LITE   || 'price_lite_placeholder',
  growth: process.env.STRIPE_PRICE_GROWTH || 'price_growth_placeholder',
  pro:    process.env.STRIPE_PRICE_PRO    || 'price_pro_placeholder'
};

const SETUP_FEES_AED = { lite: 299, growth: 499, pro: 999 };

/**
 * Creates a Stripe Checkout session for a new client signing up,
 * with a 14-day free trial on the recurring plan. The one-time
 * setup fee is added as a separate line item charged immediately.
 */
export async function createCheckoutSession({ clientId, plan, customerEmail, successUrl, cancelUrl }) {
  if (DEMO_MODE) {
    const fakeSession = {
      demo: true,
      id: `demo_session_${Date.now()}`,
      url: `${successUrl}?demo=true&plan=${plan}`
    };
    console.log('[stripeClient:DEMO MODE] Would create checkout session:', { clientId, plan, customerEmail });
    await upsertSubscriptionRecord(clientId, {
      plan,
      status: 'trialing',
      trial_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      setup_fee_paid: false
    });
    return fakeSession;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: [
      { price: PRICE_IDS[plan], quantity: 1 },
      {
        price_data: {
          currency: 'aed',
          product_data: { name: `${plan} plan — one-time setup fee` },
          unit_amount: SETUP_FEES_AED[plan] * 100
        },
        quantity: 1
      }
    ],
    subscription_data: {
      trial_period_days: 14,
      metadata: { client_id: clientId, plan }
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  return session;
}

/**
 * Handles Stripe webhook events and syncs subscription status into Supabase.
 * Wire this up in routes/stripeWebhook.js.
 */
export async function handleStripeEvent(event) {
  switch (event.type) {
    case 'customer.subscription.trial_will_end':
      // Optional: notify the client their trial ends in 3 days.
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const clientId = sub.metadata?.client_id;
      await upsertSubscriptionRecord(clientId, {
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        status: mapStripeStatus(sub.status),
        trial_end_date: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        next_billing_date: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end
      });
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const clientId = invoice.subscription_details?.metadata?.client_id;
      await supabase.from('invoices').insert({
        client_id: clientId,
        stripe_invoice_id: invoice.id,
        amount_aed: invoice.amount_paid / 100,
        status: 'paid',
        invoice_pdf_url: invoice.invoice_pdf
      });
      if (clientId) {
        await supabase.from('subscriptions').update({ status: 'active', failed_payment_count: 0 }).eq('client_id', clientId);
        await supabase.from('clients').update({ bot_status: 'on', setup_status: 'live' }).eq('id', clientId);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const clientId = invoice.subscription_details?.metadata?.client_id;
      if (clientId) {
        const { data: sub } = await supabase.from('subscriptions').select('failed_payment_count').eq('client_id', clientId).single();
        const failCount = (sub?.failed_payment_count || 0) + 1;
        await supabase.from('subscriptions').update({
          status: 'past_due',
          failed_payment_count: failCount
        }).eq('client_id', clientId);

        // After repeated failures, auto-pause the bot and flag for admin attention.
        if (failCount >= 3) {
          await supabase.from('clients').update({ bot_status: 'paused' }).eq('id', clientId);
        }
        // TODO: notify admin + client via email/WhatsApp of the failed payment.
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const clientId = sub.metadata?.client_id;
      if (clientId) {
        await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('client_id', clientId);
        await supabase.from('clients').update({ bot_status: 'off' }).eq('id', clientId);
      }
      break;
    }

    default:
      break;
  }
}

function mapStripeStatus(stripeStatus) {
  const map = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'failed'
  };
  return map[stripeStatus] || stripeStatus;
}

async function upsertSubscriptionRecord(clientId, fields) {
  if (!clientId) return;
  await supabase.from('subscriptions').upsert(
    { client_id: clientId, ...fields },
    { onConflict: 'client_id' }
  );
}

/**
 * Cancels a client's subscription at the end of the current billing period
 * (not immediately) — called from the client dashboard's "Cancel Subscription" button.
 */
export async function cancelSubscriptionAtPeriodEnd(clientId) {
  const { data: sub } = await supabase.from('subscriptions').select('stripe_subscription_id').eq('client_id', clientId).single();

  if (DEMO_MODE || !sub?.stripe_subscription_id) {
    console.log('[stripeClient:DEMO MODE] Would cancel subscription at period end for client', clientId);
    await supabase.from('subscriptions').update({ cancel_at_period_end: true }).eq('client_id', clientId);
    return { demo: true };
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
  await supabase.from('subscriptions').update({ cancel_at_period_end: true }).eq('client_id', clientId);
  return { demo: false };
}

export { DEMO_MODE as STRIPE_DEMO_MODE };
