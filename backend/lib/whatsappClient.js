// backend/lib/whatsappClient.js
// ============================================================
// MILESTONE 6B
// Single shared function for sending a WhatsApp Cloud API message,
// used by both the webhook's AI auto-reply and the Conversations tab's
// manual human reply — one send path, not two copies to keep in sync.
// ============================================================

/**
 * Sends a text message via the WhatsApp Cloud API.
 *
 * phoneNumberId resolution order:
 *   1. An explicit phoneNumberId argument (e.g. client.whatsapp_phone_number_id,
 *      for setups where each client has their own Meta number).
 *   2. process.env.WHATSAPP_PHONE_NUMBER_ID (the current single-shared-number
 *      setup this project launched with) — unchanged fallback behavior.
 *
 * Demo-mode safe: if no phone number ID or token is available, this logs
 * a warning and returns without sending, matching the rest of the
 * codebase's pattern instead of throwing during local/demo use.
 */
export async function sendWhatsappMessage({ phoneNumberId, to, body }) {
  const resolvedPhoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;

  if (!resolvedPhoneNumberId || !accessToken) {
    console.warn('[whatsappClient] WHATSAPP_TOKEN or a phone_number_id not set — skipping real send (demo mode).');
    return { sent: false, demo: true };
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${resolvedPhoneNumberId}/messages`, {
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
    // Log only the HTTP status and Meta's error payload — never the
    // access token itself.
    const errorBody = await response.text().catch(() => '');
    throw new Error(`WhatsApp API responded ${response.status}: ${errorBody}`);
  }

  return { sent: true, demo: false };
}
