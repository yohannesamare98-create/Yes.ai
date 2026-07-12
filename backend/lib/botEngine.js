// backend/lib/botEngine.js
// ============================================================
// THE ONE BOT ENGINE — shared by every client.
// This file is never duplicated. What changes per client is the
// DATA it's given (business_name, services, faqs, questions, etc.)
// which is fetched from Supabase using the client's WhatsApp number.
// ============================================================

import OpenAI from 'openai';
import { supabase } from './supabaseClient.js';

// Like supabaseClient.js, this uses a placeholder when the key is missing
// so a blank .env doesn't crash the whole process — the OpenAI SDK throws
// synchronously in its constructor if apiKey is empty, unlike most SDKs
// which only fail when you actually make a call.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder-key-not-set' });

/**
 * Look up which client owns a given WhatsApp Business number,
 * and pull their bot configuration (services, FAQs, questions, rules).
 */
export async function getClientByWhatsappNumber(whatsappNumber) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp_number', whatsappNumber)
    .single();

  if (clientError || !client) return null;

  const { data: config } = await supabase
    .from('bot_config')
    .select('*')
    .eq('client_id', client.id)
    .single();

  return { client, config };
}

/**
 * Build the system prompt for this specific client from their stored config.
 * This is the ONLY thing that changes between clients — everything else
 * (the API call, the flow, the saving logic) is identical.
 */
function buildSystemPrompt(client, config) {
  const services = (config?.services || [])
    .map(s => `- ${s.name}: AED ${s.price}`)
    .join('\n');

  const faqs = (config?.faqs || [])
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  const questions = (config?.qualification_questions || [
    'What service do you need?',
    'What date works for you?',
    'What time do you prefer?'
  ]).join('\n');

  return `
You are the WhatsApp sales assistant for "${client.business_name}", a ${client.industry || 'local'} business in the UAE.
Opening hours: ${client.opening_hours || 'not specified'}.
Location: ${client.location || 'not specified'}.
Reply in ${client.language === 'ar' ? 'Arabic' : client.language === 'both' ? 'the language the customer writes in (English or Arabic)' : 'English'}.

Your job, in order:
1. Greet the customer warmly and briefly.
2. Ask these qualification questions ONE AT A TIME, waiting for a reply each time:
${questions}
3. Use these FAQs to answer questions if asked:
${faqs || '(no FAQs configured yet)'}
4. Services and prices you can quote:
${services || '(no services configured yet)'}
5. Once you have the answers, confirm the booking clearly and say the lead/booking has been saved.

Keep every message short (1-3 sentences), friendly, and never invent prices or services that aren't listed above.
${config?.ai_instructions ? `\nAdditional instructions from the business owner:\n${config.ai_instructions}` : ''}
`.trim();
}

/**
 * Decide if this lead should be flagged "hot" based on the client's own rules.
 */
function checkHotLead(conversationText, hotLeadRules) {
  if (!hotLeadRules) return false;
  const text = conversationText.toLowerCase();
  const keywordHit = (hotLeadRules.keywords || []).some(k => text.includes(k.toLowerCase()));
  return keywordHit;
}

/**
 * Main entry point — called once per inbound WhatsApp message.
 * conversationHistory: array of { role: 'user'|'assistant', content }
 */
export async function handleIncomingMessage({ businessWhatsappNumber, customerWhatsappNumber, customerName, conversationHistory }) {
  const result = await getClientByWhatsappNumber(businessWhatsappNumber);
  if (!result) {
    throw new Error(`No client found for WhatsApp number ${businessWhatsappNumber}`);
  }
  const { client, config } = result;

  if (client.bot_status !== 'on') {
    return { reply: null, skipped: true, reason: `Bot status is '${client.bot_status}'` };
  }

  const systemPrompt = buildSystemPrompt(client, config);

  // The OpenAI call is the one step a customer directly feels if it fails —
  // fall back to a safe, honest message instead of throwing, so the
  // conversation never just goes silent.
  let reply;
  let aiFailed = false;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory
      ],
      max_tokens: 300
    });
    reply = completion.choices[0].message.content;
  } catch (err) {
    aiFailed = true;
    console.error(`[botEngine] OpenAI request failed for client ${client.id}:`, err.message);
    reply = "Sorry, I'm having a little trouble replying right now — someone from our team will follow up with you shortly.";
  }

  const fullConversationText = conversationHistory.map(m => m.content).join(' ') + ' ' + reply;
  const isHot = checkHotLead(fullConversationText, config?.hot_lead_rules);

  // Saving to Supabase should never be able to block the customer from
  // getting `reply` back — a DB hiccup here is logged, not thrown, so the
  // webhook route can still send the WhatsApp message either way.
  let lead = null;
  try {
    const { data, error } = await supabase
      .from('leads')
      .upsert({
        client_id: client.id,
        customer_name: customerName || null,
        customer_whatsapp: customerWhatsappNumber,
        message_summary: fullConversationText.slice(0, 500),
        is_hot_lead: isHot,
        status: 'new'
      }, { onConflict: 'customer_whatsapp,client_id' })
      .select()
      .single();
    if (error) throw error;
    lead = data;

    const { error: messagesError } = await supabase.from('messages').insert([
      { client_id: client.id, lead_id: lead?.id, direction: 'inbound', body: conversationHistory.at(-1)?.content },
      { client_id: client.id, lead_id: lead?.id, direction: 'outbound', body: reply }
    ]);
    if (messagesError) throw messagesError;
  } catch (err) {
    console.error(`[botEngine] Failed to save lead/messages to Supabase for client ${client.id}:`, err.message);
  }

  return { reply, client, lead, isHot, aiFailed };
}
