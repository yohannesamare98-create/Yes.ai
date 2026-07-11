// backend/lib/notifications.js
// ============================================================
// Sends a "hot lead" alert to the business owner — via WhatsApp
// (to notification_number) and/or email (to notification_email).
// DEMO MODE: logs to console if no WhatsApp token is set.
// ============================================================

const DEMO_MODE = !process.env.WHATSAPP_TOKEN;

export async function sendHotLeadAlert(client, lead) {
  const message = `🔥 Hot lead for ${client.business_name}!\n\nCustomer: ${lead.customer_name || 'Unknown'}\nWhatsApp: ${lead.customer_whatsapp}\nDetails: ${lead.message_summary}\n\nReply fast — this one looks ready to buy.`;

  if (DEMO_MODE) {
    console.log('[notifications:DEMO MODE] Would send hot lead alert:', {
      to: client.notification_number || client.notification_email,
      message
    });
    return { demo: true };
  }

  if (client.notification_number) {
    await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: client.notification_number,
        text: { body: message }
      })
    });
  }

  // Email sending: plug in your provider of choice (Resend, SendGrid, Postmark, etc.)
  // if (client.notification_email) { await sendEmail(client.notification_email, 'Hot Lead Alert', message); }

  return { demo: false };
}
