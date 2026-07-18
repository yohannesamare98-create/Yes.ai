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
import { sendWhatsappMessage } from '../lib/whatsappClient.js';
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

    // MILESTONE 6B: prefer Meta's stable phone_number_id; display_phone_number
    // is kept as a fallback identifier for clients that haven't been
    // migrated to phone_number_id yet (see getClientByWhatsappNumber()).
    const businessPhoneNumberId = change.metadata?.phone_number_id || null;
    const businessDisplayNumber = change.metadata?.display_phone_number || null;
    const externalMessageId = message.id || null;
    const customerNumber = message.from;
    const messageType = message.type || 'text'; // 'text', 'image', 'audio', 'video', 'document', 'location', 'sticker', etc.

    // Meta may retry the same webhook. Ignore it before calling OpenAI so the
    // customer never receives a duplicate answer.
    if (externalMessageId) {
      const clientResult = await getClientByWhatsappNumber({
        phoneNumberId: businessPhoneNumberId,
        displayNumber: businessDisplayNumber
      });
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
    // Only text messages have a `.text.body` — unsupported media types are
    // handled inside handleIncomingMessage() via the messageType flag
    // rather than being sent to the AI as an empty string.
    const text = messageType === 'text' ? (message.text?.body || '') : `[${messageType} message]`;

    const cacheKey = `${businessPhoneNumberId || businessDisplayNumber}:${customerNumber}`;
    const history = conversationCache.get(cacheKey) || [];
    history.push({ role: 'user', content: text });

    // handleIncomingMessage() has its own internal error handling for the
    // OpenAI call and the Supabase save — it always returns a `reply`
    // string (falling back to a safe message on failure) rather than
    // throwing, so a single AI or DB hiccup can't silently drop this
    // customer's message with no response at all.
    const { reply, client, lead, isHot, skipped } = await handleIncomingMessage({
      businessPhoneNumberId,
      businessDisplayNumber,
      customerWhatsappNumber: customerNumber,
      customerName,
      conversationHistory: history,
      externalMessageId,
      messageType
    });

    if (skipped) return; // bot turned off, or a human has taken over this conversation

    history.push({ role: 'assistant', content: reply });
    conversationCache.set(cacheKey, history);

    // Sending the reply is the most important step — do it first, and on
    // its own try/catch, so a failure further down (Sheets, hot-lead alert)
    // can never prevent the customer from getting an answer.
    try {
      await sendWhatsappMessage({
        phoneNumberId: client?.whatsapp_phone_number_id || businessPhoneNumberId,
        to: customerNumber,
        body: reply
      });
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

export default router;
