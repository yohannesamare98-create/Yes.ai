// backend/routes/whatsappWebhook.js
// ============================================================
// Meta WhatsApp Cloud API webhook.
// One webhook URL handles ALL clients — Meta tells us which
// business number ("to") the message was sent to, and we look
// up which client owns that number in botEngine.js.
// ============================================================

import express from 'express';
import { handleIncomingMessage } from '../lib/botEngine.js';
import { appendLeadToSheet } from '../lib/googleSheets.js';
import { sendHotLeadAlert } from '../lib/notifications.js';

const router = express.Router();

// In-memory conversation cache (replace with a proper store like Redis in production —
// this is fine for a first launch with a modest number of concurrent conversations).
const conversationCache = new Map();

// ---- Webhook verification (Meta calls this once when you set up the webhook) ----
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---- Incoming messages ----
router.post('/webhook', async (req, res) => {
  // Respond to Meta immediately — always within a few seconds, per their requirements.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return; // status update / non-message event, ignore

    const businessNumber = change.metadata.display_phone_number; // the client's number
    const customerNumber = message.from;
    const customerName = change.contacts?.[0]?.profile?.name;
    const text = message.text?.body || '';

    const cacheKey = `${businessNumber}:${customerNumber}`;
    const history = conversationCache.get(cacheKey) || [];
    history.push({ role: 'user', content: text });

    const { reply, client, lead, isHot, skipped } = await handleIncomingMessage({
      businessWhatsappNumber: businessNumber,
      customerWhatsappNumber: customerNumber,
      customerName,
      conversationHistory: history
    });

    if (skipped) return; // bot turned off for this client

    history.push({ role: 'assistant', content: reply });
    conversationCache.set(cacheKey, history);

    await sendWhatsappReply(businessNumber, customerNumber, reply);

    if (client?.google_sheet_url && lead) {
      await appendLeadToSheet(client.google_sheet_url, lead);
    }

    if (isHot && client) {
      await sendHotLeadAlert(client, lead);
    }
  } catch (err) {
    console.error('[whatsappWebhook] error handling message:', err);
  }
});

/**
 * Sends a text reply via the WhatsApp Cloud API.
 * Requires WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID per client
 * (store these in the `clients` table if each client has their own
 * Meta app/number, or reuse one shared number ID if you're routing
 * through a single Meta Business number for all clients).
 */
async function sendWhatsappReply(businessNumber, to, body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
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
}

export default router;
