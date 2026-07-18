// backend/routes/whatsappWebhook.js
// ============================================================
// Meta WhatsApp Cloud API webhook.
// One webhook URL handles ALL clients — Meta tells us which
// business number ("to") the message was sent to, and we look
// up which client owns that number in botEngine.js.
// ============================================================

import express from 'express';
import crypto from 'crypto';
import { getClientByWhatsappNumber, handleIncomingMessage } from '../lib/botEngine.js';
import { supabase } from '../lib/supabaseClient.js';
import { appendLeadToSheet } from '../lib/googleSheets.js';
import { sendHotLeadAlert } from '../lib/notifications.js';

const router = express.Router();

// Verifies that an incoming POST really came from Meta by recomputing the
// HMAC-SHA256 of the raw request body using your Meta App Secret and
// comparing it to the X-Hub-Signature-256 header Meta sends. Without this,
// anyone who discovers the webhook URL could POST fake messages — creating
// bogus leads, triggering hot-lead alerts, and spending your OpenAI budget.
//
// Demo-mode safe: if WHATSAPP_APP_SECRET isn't set yet, this logs a warning
// and allows the request through, matching the rest of the codebase's
// pattern of not hard-failing on missing integration config.
function verifyMetaSignature(req, res, next) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn('[whatsappWebhook] WHATSAPP_APP_SECRET not set — skipping signature verification (demo mode).');
    return next();
  }

  const signatureHeader = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.from(''))
    .digest('hex');

  const provided = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  const valid = provided.length === expectedBuf.length &&
    crypto.timingSafeEqual(provided, expectedBuf);

  if (!valid) {
    console.warn('[whatsappWebhook] Rejected request with invalid X-Hub-Signature-256.');
    return res.sendStatus(401);
  }
  next();
}

// In-memory conversation cache (replace with a proper store like Redis in production —
// this is fine for a first launch with a modest number of concurrent conversations).
const conversationCache = new Map();
// ---- Webhook verification ----
router.get('/webhook', (req, res) => {
  const mode = String(req.query['hub.mode'] || '').trim();
  const receivedToken = String(req.query['hub.verify_token'] || '').trim();
  const expectedToken = String(
    process.env.WHATSAPP_VERIFY_TOKEN || ''
  ).trim();

  const challenge = String(req.query['hub.challenge'] || '');

  console.log('[whatsappWebhook] verification request', {
    mode,
    tokenProvided: receivedToken.length > 0,
    verifyTokenConfigured: expectedToken.length > 0,
    receivedTokenLength: receivedToken.length,
    expectedTokenLength: expectedToken.length,
    tokensMatch: receivedToken === expectedToken
  });

  if (
    mode === 'subscribe' &&
    receivedToken === expectedToken &&
    challenge
  ) {
    console.log('[whatsappWebhook] Webhook verified');
    return res.status(200).type('text/plain').send(challenge);
  }

  console.warn('[whatsappWebhook] Webhook verification failed');
  return res.sendStatus(403);
});

// ---- Incoming messages ----
router.post('/webhook', verifyMetaSignature, async (req, res) => {
  // Respond to Meta immediately — always within a few seconds, per their requirements.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return; // status update / non-message event, ignore

    const businessNumber = change.metadata.display_phone_number; // the client's number
    const externalMessageId = message.id || null;
    const customerNumber = message.from;

    // Meta may retry the same webhook. Ignore it before calling OpenAI so the
    // customer never receives a duplicate answer.
    if (externalMessageId) {
      const clientResult = await getClientByWhatsappNumber(businessNumber);
      const clientId = clientResult?.client?.id;
      if (clientId) {
        const { data: existing, error: duplicateCheckError } = await supabase
          .from('messages')
          .select('id')
          .eq('client_id', clientId)
          .eq('external_message_id', externalMessageId)
          .maybeSingle();
        if (duplicateCheckError) {
          console.error('[whatsappWebhook] duplicate check failed:', duplicateCheckError.message);
        } else if (existing) {
          console.log('[whatsappWebhook] duplicate message ignored:', externalMessageId);
          return;
        }
      }
    }
    const customerName = change.contacts?.[0]?.profile?.name;
    const text = message.text?.body || '';

    const cacheKey = `${businessNumber}:${customerNumber}`;
    const history = conversationCache.get(cacheKey) || [];
    history.push({ role: 'user', content: text });

    // handleIncomingMessage() has its own internal error handling for the
    // OpenAI call and the Supabase save — it always returns a `reply`
    // string (falling back to a safe message on failure) rather than
    // throwing, so a single AI or DB hiccup can't silently drop this
    // customer's message with no response at all.
    const { reply, client, lead, isHot, skipped } = await handleIncomingMessage({
      businessWhatsappNumber: businessNumber,
      customerWhatsappNumber: customerNumber,
      customerName,
      conversationHistory: history,
      externalMessageId
    });

    if (skipped) return; // bot turned off for this client

    history.push({ role: 'assistant', content: reply });
    conversationCache.set(cacheKey, history);

    // Sending the reply is the most important step — do it first, and on
    // its own try/catch, so a failure further down (Sheets, hot-lead alert)
    // can never prevent the customer from getting an answer.
    try {
      await sendWhatsappReply(businessNumber, customerNumber, reply);
    } catch (err) {
      console.error('[whatsappWebhook] failed to send WhatsApp reply:', err.message);
    }

    if (client?.google_sheet_url && lead) {
      try {
        await appendLeadToSheet(client.google_sheet_url, lead);
      } catch (err) {
        console.error('[whatsappWebhook] failed to append lead to Google Sheet:', err.message);
      }
    }

    if (isHot && client) {
      try {
        await sendHotLeadAlert(client, lead);
      } catch (err) {
        console.error('[whatsappWebhook] failed to send hot lead alert:', err.message);
      }
    }
  } catch (err) {
    console.error('[whatsappWebhook] unexpected error handling message:', err);
  }
});

/**
 * Sends a text reply via the WhatsApp Cloud API.
 * Requires WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (per client, if each
 * client has their own Meta app/number, or reuse one shared number ID if
 * you're routing through a single Meta Business number for all clients).
 */
async function sendWhatsappReply(businessNumber, to, body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsappWebhook] WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — skipping real send (demo mode).');
    return;
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      text: { body }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`WhatsApp API responded ${response.status}: ${errorBody}`);
  }
}

export default router;
