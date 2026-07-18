// backend/lib/botEngine.js
// ============================================================
// THE ONE BOT ENGINE — shared by every client.
// This file is never duplicated. What changes per client is the
// DATA it's given (business_name, services, faqs, questions, etc.)
// which is fetched from Supabase using the client's WhatsApp number
// (live WhatsApp traffic) or client_id (Test AI page/endpoint).
//
// MILESTONE 6A — Intelligence Engine
// Adds: structured JSON output (reply/intent/qualification/etc.),
// Supabase-backed conversation memory (survives server restarts,
// unlike the old in-memory-only cache), turn-over-turn lead-profile
// merging, keyword-based human-handoff safety net, and a stateless
// test-mode entry point for the Test AI page.
// ============================================================

import OpenAI from 'openai';
import { supabase } from './supabaseClient.js';

// Like supabaseClient.js, this uses a placeholder when the key is missing
// so a blank .env doesn't crash the whole process — the OpenAI SDK throws
// synchronously in its constructor if apiKey is empty, unlike most SDKs
// which only fail when you actually make a call.
const OPENAI_CONFIGURED = !!process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder-key-not-set' });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const DEFAULT_FALLBACK_MESSAGE =
  "Thanks for your message — I want to make sure you get the right answer, so I'm looping in someone from our team to follow up with you shortly.";

const DEFAULT_QUALIFICATION_QUESTIONS = [
  'What service do you need?',
  'What date works for you?',
  'What time do you prefer?'
];

// Structured output schema — every field the spec asks for, enforced by
// OpenAI's strict JSON schema mode so the reply is always parseable and
// never missing a field the rest of the app depends on.
const RESPONSE_SCHEMA = {
  name: 'yesai_structured_reply',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: 'The natural-language WhatsApp reply to send the customer. 1-3 short, friendly sentences.'
      },
      intent: {
        type: 'string',
        enum: ['booking', 'pricing_question', 'general_inquiry', 'complaint', 'support', 'small_talk', 'other'],
        description: 'The primary purpose of the customer\'s latest message.'
      },
      service_or_product: {
        type: ['string', 'null'],
        description: 'The specific service/product name from the business\'s verified list that the customer is asking about, or null if unclear/not mentioned yet.'
      },
      lead_temperature: {
        type: 'string',
        enum: ['cold', 'warm', 'hot'],
        description: 'cold = just browsing/early question. warm = interested, some details given. hot = ready to book/buy now, urgent, or gave budget+date+contact intent.'
      },
      qualification_score: {
        type: 'integer',
        description: '0-100. How complete and buying-ready this lead\'s profile is based on the whole conversation so far.'
      },
      collected_customer_data: {
        type: 'object',
        properties: {
          service_needed: { type: ['string', 'null'] },
          budget: { type: ['string', 'null'] },
          urgency: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          preferred_date: { type: ['string', 'null'] },
          buying_readiness: { type: ['string', 'null'] }
        },
        required: ['service_needed', 'budget', 'urgency', 'location', 'preferred_date', 'buying_readiness'],
        additionalProperties: false
      },
      appointment_requested: {
        type: 'boolean',
        description: 'true if the customer is asking to book/schedule something in this message or has now confirmed a date/time.'
      },
      human_handoff: {
        type: 'boolean',
        description: 'true if you do not have verified information to answer confidently, the topic is sensitive (legal, medical, refund dispute, complaint), or the customer explicitly asks for a human.'
      },
      conversation_summary: {
        type: 'string',
        description: 'A short (1-3 sentence) up-to-date summary of the ENTIRE conversation so far, for use as memory in future turns. Not just this message.'
      }
    },
    required: [
      'reply', 'intent', 'service_or_product', 'lead_temperature',
      'qualification_score', 'collected_customer_data', 'appointment_requested',
      'human_handoff', 'conversation_summary'
    ],
    additionalProperties: false
  }
};

/**
 * Look up which client owns a given WhatsApp Business number, and pull
 * their bot configuration (services, FAQs, questions, rules). This is the
 * client-isolation boundary for live WhatsApp traffic — every downstream
 * read/write is scoped to this one client.id.
 *
 * MILESTONE 6B: prefers Meta's stable `phone_number_id` (never changes
 * for a given number) over the human-readable `display_phone_number`
 * (formatting like spaces/+/leading zeros is not guaranteed stable).
 * Falls back to displayNumber for clients that haven't had
 * whatsapp_phone_number_id set yet, so existing setups keep working
 * unchanged.
 */
export async function getClientByWhatsappNumber({ phoneNumberId, displayNumber }) {
  let client = null;

  if (phoneNumberId) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .maybeSingle();
    client = data || null;
  }

  if (!client && displayNumber) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_number', displayNumber)
      .maybeSingle();
    client = data || null;
  }

  if (!client) return null;

  const { data: config } = await supabase
    .from('bot_config')
    .select('*')
    .eq('client_id', client.id)
    .single();

  return { client, config };
}

/**
 * Look up a client directly by ID — used by the Test AI endpoint, where
 * the caller has already been authenticated and authorized (requireAuth +
 * requireClientAccess) to act as this specific client_id, so this is just
 * a data load, not a second isolation check.
 */
export async function getClientById(clientId) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (clientError || !client) return null;

  const { data: config } = await supabase
    .from('bot_config')
    .select('*')
    .eq('client_id', clientId)
    .single();

  return { client, config };
}

/**
 * Build the system prompt for this specific client from their stored
 * config, plus whatever we already know about THIS lead so far (so the
 * AI doesn't re-ask questions it already has answers to). This is the
 * only thing that changes between clients/leads — the API call, schema,
 * and saving logic are identical for everyone.
 */
function buildSystemPrompt(client, config, priorState) {
  const services = (config?.services || [])
    .map(s => `- ${s.name}: AED ${s.price}`)
    .join('\n');

  const offers = (config?.offers || [])
    .map(o => `- ${o.name}${o.description ? `: ${o.description}` : ''}${o.price ? ` (AED ${o.price})` : ''}`)
    .join('\n');

  const faqs = (config?.faqs || [])
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  const questions = (config?.qualification_questions?.length
    ? config.qualification_questions
    : DEFAULT_QUALIFICATION_QUESTIONS
  ).join('\n');

  const known = priorState?.collected_customer_data || {};
  const knownFacts = Object.entries(known)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const languageLine = client.language === 'ar'
    ? 'Reply in Arabic.'
    : client.language === 'both'
      ? 'Reply in whichever language the customer writes in (English or Arabic) — match them.'
      : 'Reply in English.';

  return `
You are the WhatsApp sales assistant for "${client.business_name}", a ${client.industry || 'local'} business.
Opening hours: ${client.opening_hours || 'not specified'}.
Location: ${client.location || 'not specified'}.
${languageLine}
Tone: ${config?.tone_of_voice || 'Friendly'}.

VERIFIED BUSINESS INFORMATION — this is the ONLY information you may use to
answer questions or quote prices. Do not invent, guess, or assume anything
that isn't listed below.

Services and prices:
${services || '(no services configured yet)'}

Current offers/promotions:
${offers || '(none configured)'}

Policies (cancellation, payment, deposits, etc.):
${config?.policies || '(none configured)'}

FAQs:
${faqs || '(no FAQs configured yet)'}
${config?.business_description ? `\nAbout the business:\n${config.business_description}` : ''}
${config?.ai_instructions ? `\nAdditional instructions from the business owner:\n${config.ai_instructions}` : ''}

WHAT WE ALREADY KNOW ABOUT THIS LEAD (do not ask again — only ask what's
still missing):
${knownFacts || '(nothing collected yet — this is a new conversation)'}
${priorState?.conversation_summary ? `\nConversation so far (summary):\n${priorState.conversation_summary}` : ''}

YOUR JOB, every message:
1. Answer naturally and helpfully using ONLY the verified information above.
2. Naturally qualify the lead over the course of the conversation by
   learning: which service/product they need, their budget, urgency,
   location, preferred date, and how ready they are to buy — ask about
   ONE missing thing at a time, conversationally, not as an interrogation.
   Suggested qualification questions if you need a starting point:
${questions}
3. Recommend the correct service/offer from the verified list above based
   on what the customer describes needing. Never recommend or invent
   something not in the list.
4. If the customer wants to book something, treat that clearly as an
   appointment request.
5. If you do not have verified information to answer confidently, OR the
   topic is sensitive (legal, medical, a complaint, a refund dispute, or
   the customer explicitly asks for a human), do NOT guess — give a brief
   honest reply and flag this for human follow-up instead.
6. Keep every reply short: 1-3 sentences, friendly, natural WhatsApp tone.

You must respond by filling in the structured fields you've been given
(reply, intent, service_or_product, lead_temperature, qualification_score,
collected_customer_data, appointment_requested, human_handoff,
conversation_summary). "collected_customer_data" and "conversation_summary"
must reflect the FULL conversation so far, not just this message — carry
forward everything already known above and add anything new.
`.trim();
}

/**
 * Rule-based safety net layered on top of the model's own judgment: if the
 * customer's latest message contains any of the client's configured
 * human-handoff keywords, force human_handoff = true regardless of what
 * the model itself decided. Relying on the model alone to always notice a
 * sensitive topic isn't reliable enough on its own.
 */
export function keywordForcesHandoff(latestCustomerMessage, humanHandoffKeywords) {
  if (!latestCustomerMessage || !Array.isArray(humanHandoffKeywords) || !humanHandoffKeywords.length) {
    return false;
  }
  const text = latestCustomerMessage.toLowerCase();
  return humanHandoffKeywords.some(k => k && text.includes(String(k).toLowerCase()));
}

/**
 * Same idea as the old checkHotLead(), preserved as an additional signal
 * that can only push a lead's temperature UP (never overrides the model
 * down from hot), combined with hot_lead_rules.keywords already used by
 * the rest of the app (admin/client dashboards, hot-lead alerts).
 */
export function keywordSuggestsHot(conversationText, hotLeadRules) {
  if (!hotLeadRules) return false;
  const text = conversationText.toLowerCase();
  return (hotLeadRules.keywords || []).some(k => text.includes(String(k).toLowerCase()));
}

/**
 * Merge newly extracted customer data with what we already knew — a field
 * only gets overwritten if the model actually returned a non-null value
 * for it this turn, so the lead's profile accumulates across the
 * conversation instead of losing earlier answers.
 */
export function mergeCollectedData(prior, incoming) {
  const merged = { ...(prior || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value !== null && value !== undefined && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * The one call to OpenAI, shared by both live WhatsApp traffic and the
 * Test AI endpoint. Returns the parsed structured JSON, or a safe
 * fallback object (with human_handoff forced true) if the call fails or
 * returns something unparseable.
 */
async function callIntelligenceEngine({ client, config, messages, priorState }) {
  if (!OPENAI_CONFIGURED) {
    // Demo mode — no OpenAI key configured yet. Return a clearly-labeled
    // simulated response so the Test AI page and webhook still function
    // end-to-end without a real key, matching the rest of the codebase's
    // demo-mode-safe pattern.
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    return {
      ok: true,
      demo: true,
      data: {
        reply: `[DEMO MODE — no OPENAI_API_KEY set] I received: "${lastUserMessage.slice(0, 120)}". Add OPENAI_API_KEY in Railway to get real AI replies.`,
        intent: 'other',
        service_or_product: null,
        lead_temperature: 'cold',
        qualification_score: 0,
        collected_customer_data: priorState?.collected_customer_data || {
          service_needed: null, budget: null, urgency: null,
          location: null, preferred_date: null, buying_readiness: null
        },
        appointment_requested: false,
        human_handoff: false,
        conversation_summary: priorState?.conversation_summary || 'Demo mode — no real conversation processed yet.'
      }
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 700,
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA }
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    return { ok: true, demo: false, data: parsed };
  } catch (err) {
    console.error(`[botEngine] OpenAI request failed for client ${client?.id}:`, err.message);
    return {
      ok: false,
      demo: false,
      error: err.message,
      data: {
        reply: config?.fallback_message || DEFAULT_FALLBACK_MESSAGE,
        intent: 'other',
        service_or_product: null,
        lead_temperature: priorState?.lead_temperature || 'cold',
        qualification_score: priorState?.qualification_score || 0,
        collected_customer_data: priorState?.collected_customer_data || {
          service_needed: null, budget: null, urgency: null,
          location: null, preferred_date: null, buying_readiness: null
        },
        appointment_requested: false,
        human_handoff: true,
        conversation_summary: priorState?.conversation_summary || ''
      }
    };
  }
}

/**
 * Loads this lead's existing profile (if any) plus recent raw message
 * history from Supabase, so conversation memory survives server restarts
 * and works correctly across multiple backend instances — unlike an
 * in-memory-only cache. Falls back to whatever conversationHistory the
 * caller passed in if Supabase isn't reachable (demo mode / local dev
 * without a database yet).
 */
async function loadConversationMemory({ clientId, customerWhatsappNumber, fallbackHistory, historyLimit = 20 }) {
  try {
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('client_id', clientId)
      .eq('customer_whatsapp', customerWhatsappNumber)
      .maybeSingle();

    let history = fallbackHistory || [];
    if (existingLead) {
      const { data: pastMessages, error } = await supabase
        .from('messages')
        .select('direction, body, created_at')
        .eq('client_id', clientId)
        .eq('lead_id', existingLead.id)
        .order('created_at', { ascending: true })
        .limit(historyLimit);

      if (!error && pastMessages?.length) {
        history = pastMessages.map(m => ({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: m.body || ''
        }));
      }
    }

    return { priorLead: existingLead || null, history };
  } catch (err) {
    console.error('[botEngine] Failed to load conversation memory from Supabase, using fallback history:', err.message);
    return { priorLead: null, history: fallbackHistory || [] };
  }
}

const UNSUPPORTED_MEDIA_REPLY =
  "Thanks for sending that — right now I can only read text messages. Someone from our team will follow up with you shortly about this.";

/**
 * Builds the same structured shape callIntelligenceEngine() would return,
 * but without calling OpenAI at all — used when the inbound message isn't
 * text (image/audio/video/document/location/sticker/etc). Per the spec,
 * unsupported media gets a safe canned reply and an automatic human
 * handoff rather than being sent to the model or silently dropped.
 */
export function buildUnsupportedMediaResponse(priorState) {
  return {
    reply: UNSUPPORTED_MEDIA_REPLY,
    intent: 'support',
    service_or_product: null,
    lead_temperature: priorState?.lead_temperature || 'cold',
    qualification_score: priorState?.qualification_score || 0,
    collected_customer_data: priorState?.collected_customer_data || {
      service_needed: null, budget: null, urgency: null,
      location: null, preferred_date: null, buying_readiness: null
    },
    appointment_requested: false,
    human_handoff: true,
    conversation_summary: priorState?.conversation_summary || 'Customer sent a non-text message that needs human review.'
  };
}

/**
 * Main entry point — called once per inbound WhatsApp message.
 *
 * businessPhoneNumberId / businessDisplayNumber: identify which client
 * owns this number (MILESTONE 6B — phone_number_id preferred, display
 * number as fallback; see getClientByWhatsappNumber()).
 * messageType: Meta's message.type ('text', 'image', 'audio', 'video',
 * 'document', 'location', 'sticker', 'contacts', 'interactive', etc.).
 * Anything other than 'text' skips the AI entirely (see
 * buildUnsupportedMediaResponse above).
 * conversationHistory (optional): array of { role: 'user'|'assistant', content }
 * used only as a fallback if Supabase-backed memory can't be loaded.
 */
export async function handleIncomingMessage({
  businessPhoneNumberId = null,
  businessDisplayNumber = null,
  customerWhatsappNumber,
  customerName,
  conversationHistory = [],
  externalMessageId = null,
  messageType = 'text'
}) {
  const result = await getClientByWhatsappNumber({
    phoneNumberId: businessPhoneNumberId,
    displayNumber: businessDisplayNumber
  });
  if (!result) {
    throw new Error(`No client found for WhatsApp number (phone_number_id=${businessPhoneNumberId}, display=${businessDisplayNumber})`);
  }
  const { client, config } = result;

  if (client.bot_status !== 'on') {
    return { reply: null, skipped: true, reason: `Bot status is '${client.bot_status}'`, client };
  }

  const latestMessage = conversationHistory.at(-1)?.content || '';

  const { priorLead, history } = await loadConversationMemory({
    clientId: client.id,
    customerWhatsappNumber,
    fallbackHistory: conversationHistory
  });

  const priorState = priorLead ? {
    collected_customer_data: priorLead.collected_customer_data,
    conversation_summary: priorLead.conversation_summary,
    lead_temperature: priorLead.lead_temperature,
    qualification_score: priorLead.qualification_score
  } : null;
  const nextUnreadCount = (priorLead?.unread_count || 0) + 1;

  // ---- Human takeover: AI is paused for this conversation ----
  // A human agent is handling this lead from the Conversations tab. Save
  // the incoming message and bump the unread badge, but do NOT call
  // OpenAI or auto-reply — the business owner will reply manually.
  if (priorLead?.mode === 'human') {
    let lead = priorLead;
    try {
      const { data, error } = await supabase
        .from('leads')
        .update({
          unread_count: nextUnreadCount,
          last_message_at: new Date().toISOString(),
          last_message_preview: latestMessage.slice(0, 200),
          customer_name: customerName || priorLead.customer_name
        })
        .eq('id', priorLead.id)
        .select()
        .single();
      if (error) throw error;
      lead = data;

      const { error: msgError } = await supabase.from('messages').insert({
        client_id: client.id, lead_id: lead.id, direction: 'inbound',
        body: messageType === 'text' ? latestMessage : `[${messageType} message]`,
        external_message_id: externalMessageId
      });
      if (msgError) throw msgError;
    } catch (err) {
      console.error(`[botEngine] Failed to save inbound message during human-mode pause for client ${client.id}:`, err.message);
    }
    return { reply: null, skipped: true, reason: 'human_active_mode', client, lead };
  }

  // ---- Unsupported media: skip the AI, give a safe canned reply ----
  const isTextMessage = messageType === 'text';
  const engineResult = isTextMessage
    ? await callIntelligenceEngine({
        client, config,
        messages: [{ role: 'system', content: buildSystemPrompt(client, config, priorState) }, ...history],
        priorState
      })
    : { ok: true, demo: false, data: buildUnsupportedMediaResponse(priorState) };

  const structured = engineResult.data;

  // Safety-net overrides — rule-based, on top of the model's own judgment.
  if (isTextMessage && keywordForcesHandoff(latestMessage, config?.human_handoff_keywords)) {
    structured.human_handoff = true;
  }
  const fullConversationText = history.map(m => m.content).join(' ') + ' ' + structured.reply;
  const keywordHot = isTextMessage && keywordSuggestsHot(fullConversationText, config?.hot_lead_rules);
  if (keywordHot && structured.lead_temperature !== 'hot') {
    structured.lead_temperature = 'hot';
  }
  const isHot = structured.lead_temperature === 'hot';

  structured.collected_customer_data = mergeCollectedData(
    priorState?.collected_customer_data,
    structured.collected_customer_data
  );

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
        message_summary: structured.conversation_summary?.slice(0, 500) || fullConversationText.slice(0, 500),
        is_hot_lead: isHot,
        intent: structured.intent,
        service_or_product: structured.service_or_product,
        lead_temperature: structured.lead_temperature,
        qualification_score: structured.qualification_score,
        collected_customer_data: structured.collected_customer_data,
        appointment_requested: structured.appointment_requested,
        human_handoff: structured.human_handoff,
        conversation_summary: structured.conversation_summary,
        status: priorLead?.status || 'new',
        mode: priorLead?.mode || 'ai',
        unread_count: nextUnreadCount,
        last_message_at: new Date().toISOString(),
        last_message_preview: structured.reply?.slice(0, 200) || latestMessage.slice(0, 200)
      }, { onConflict: 'customer_whatsapp,client_id' })
      .select()
      .single();
    if (error) throw error;
    lead = data;

    const { error: messagesError } = await supabase.from('messages').insert([
      {
        client_id: client.id, lead_id: lead?.id, direction: 'inbound',
        body: isTextMessage ? latestMessage : `[${messageType} message]`,
        external_message_id: externalMessageId
      },
      { client_id: client.id, lead_id: lead?.id, direction: 'outbound', body: structured.reply, metadata: structured, sent_by: 'ai' }
    ]);
    if (messagesError) throw messagesError;
  } catch (err) {
    console.error(`[botEngine] Failed to save lead/messages to Supabase for client ${client.id}:`, err.message);
  }

  return {
    reply: structured.reply,
    client,
    lead,
    isHot,
    aiFailed: !engineResult.ok,
    structured
  };
}

/**
 * Test AI entry point — used by the Test AI page/endpoint so a business
 * owner can try their bot's knowledge before connecting live WhatsApp.
 * Deliberately stateless: the caller passes the FULL conversation history
 * each time, and nothing is written to Supabase (no fake leads/messages
 * created), so repeated testing never pollutes real dashboard data.
 * Client isolation is enforced by the route (requireAuth +
 * requireClientAccess) before this is ever called.
 */
export async function runTestMessage({ clientId, conversationHistory = [] }) {
  const result = await getClientById(clientId);
  if (!result) {
    throw new Error(`No client found for id ${clientId}`);
  }
  const { client, config } = result;

  const systemPrompt = buildSystemPrompt(client, config, null);

  const engineResult = await callIntelligenceEngine({
    client, config,
    messages: [{ role: 'system', content: systemPrompt }, ...conversationHistory],
    priorState: null
  });

  const structured = engineResult.data;
  const latestMessage = conversationHistory.at(-1)?.content || '';
  if (keywordForcesHandoff(latestMessage, config?.human_handoff_keywords)) {
    structured.human_handoff = true;
  }

  return {
    reply: structured.reply,
    structured,
    demo: engineResult.demo,
    aiFailed: !engineResult.ok
  };
}
