// backend/routes/stripeRoutes.js
import express from 'express';
import Stripe from 'stripe';
import { createCheckoutSession, handleStripeEvent, cancelSubscriptionAtPeriodEnd, STRIPE_DEMO_MODE } from '../lib/stripeClient.js';

const router = express.Router();
const stripe = STRIPE_DEMO_MODE ? null : new Stripe(process.env.STRIPE_SECRET_KEY);

// ---- Start checkout (called from the client dashboard / pricing page) ----
// POST /api/billing/checkout  { clientId, plan, customerEmail }
router.post('/billing/checkout', express.json(), async (req, res) => {
  try {
    const { clientId, plan, customerEmail } = req.body;
    const session = await createCheckoutSession({
      clientId,
      plan,
      customerEmail,
      successUrl: `${process.env.APP_URL}/dashboard?checkout=success`,
      cancelUrl: `${process.env.APP_URL}/pricing?checkout=cancelled`
    });
    res.json(session);
  } catch (err) {
    console.error('[stripeRoutes] checkout error:', err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// ---- Stripe webhook (MUST use raw body, not JSON-parsed, for signature verification) ----
// POST /api/billing/webhook
router.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (STRIPE_DEMO_MODE) {
    console.log('[stripeRoutes:DEMO MODE] Webhook received but Stripe is not configured — skipping signature check.');
    return res.sendStatus(200);
  }

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripeRoutes] webhook signature verification failed:', err.message);
    return res.sendStatus(400);
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error('[stripeRoutes] error processing event:', err);
  }

  res.sendStatus(200);
});

// ---- Cancel subscription (called from the client dashboard) ----
// POST /api/billing/cancel  { clientId }
// Header: Authorization: Bearer <supabase access token of the logged-in client>
//
// IMPORTANT: we don't trust clientId alone — we verify the caller's Supabase
// session token, look up which client THEY are linked to via client_users,
// and only allow cancelling that client's own subscription.
router.post('/billing/cancel', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { supabase } = await import('../lib/supabaseClient.js');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid session' });

    const { data: clientUserRow } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_uid', user.id)
      .single();

    if (!clientUserRow) return res.status(403).json({ error: 'Account is not linked to a client' });

    await cancelSubscriptionAtPeriodEnd(clientUserRow.client_id);
    res.json({ success: true, cancel_at_period_end: true });
  } catch (err) {
    console.error('[stripeRoutes] cancel error:', err);
    res.status(500).json({ error: 'Could not cancel subscription' });
  }
});

export default router;
