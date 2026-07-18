// backend/routes/clientRoutes.js
// Authenticated CRUD API for YES.AI clients and their bot configuration.

import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import {
  requireAuth,
  resolveYesAiRole,
  requireAdmin,
  requireClientAccess
} from '../middleware/auth.js';

const router = express.Router();
router.use(express.json());
router.use('/clients', requireAuth, resolveYesAiRole);

const CLIENT_UPDATE_FIELDS = new Set([
  'business_name', 'industry', 'business_phone', 'logo_url', 'contact_email',
  'location', 'opening_hours', 'language', 'notification_number',
  'notification_email', 'google_sheet_url', 'google_calendar_id',
  'whatsapp_connected', 'calendar_connected', 'sheets_connected', 'setup_status'
]);

const BOT_CONFIG_UPDATE_FIELDS = new Set([
  'ai_instructions', 'business_description', 'tone_of_voice', 'services',
  'offers', 'faqs', 'qualification_questions', 'hot_lead_rules',
  'policies', 'fallback_message', 'human_handoff_keywords'
]);

function pickAllowed(body, allowed) {
  return Object.fromEntries(Object.entries(body || {}).filter(([key]) => allowed.has(key)));
}

router.get('/clients', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*, subscriptions(*)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/clients/:id', requireClientAccess, async (req, res) => {
  const { data: client, error } = await supabase.from('clients').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Client not found' });
  const { data: config } = await supabase.from('bot_config').select('*').eq('client_id', req.params.id).maybeSingle();
  res.json({ client, config });
});

router.post('/clients', requireAdmin, async (req, res) => {
  const {
    business_name, industry, whatsapp_number, contact_email, location,
    opening_hours, language, plan, notification_number, notification_email,
    google_sheet_url, google_calendar_id, services, faqs,
    qualification_questions, hot_lead_rules, ai_instructions
  } = req.body || {};

  if (!business_name || !whatsapp_number) {
    return res.status(400).json({ error: 'business_name and whatsapp_number are required' });
  }

  const { data: client, error } = await supabase.from('clients').insert({
    business_name, industry, whatsapp_number, contact_email, location,
    opening_hours, language: language || 'en', plan: plan || 'lite',
    bot_status: 'off', notification_number, notification_email,
    google_sheet_url, google_calendar_id
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  const { error: configError } = await supabase.from('bot_config').insert({
    client_id: client.id,
    ai_instructions: ai_instructions || '',
    services: services || [],
    faqs: faqs || [],
    qualification_questions: qualification_questions || [
      'What service do you need?', 'What date works for you?', 'What time do you prefer?'
    ],
    hot_lead_rules: hot_lead_rules || { keywords: ['urgent', 'today', 'asap'] }
  });

  if (configError) {
    await supabase.from('clients').delete().eq('id', client.id);
    return res.status(500).json({ error: configError.message });
  }

  const { error: subscriptionError } = await supabase
    .from('subscriptions')
    .insert({ client_id: client.id, plan: plan || 'lite', status: 'trialing' });

  if (subscriptionError) console.error('[clientRoutes] subscription creation failed:', subscriptionError.message);
  res.status(201).json(client);
});

router.patch('/clients/:id', requireClientAccess, async (req, res) => {
  const updates = pickAllowed(req.body, CLIENT_UPDATE_FIELDS);
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No allowed fields supplied' });
  const { data, error } = await supabase.from('clients').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/clients/:id/bot-config', requireClientAccess, async (req, res) => {
  const updates = pickAllowed(req.body, BOT_CONFIG_UPDATE_FIELDS);
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No allowed fields supplied' });
  const { data, error } = await supabase.from('bot_config').update(updates).eq('client_id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/clients/:id/bot-status', requireClientAccess, async (req, res) => {
  const { status } = req.body || {};
  if (!['on', 'off', 'paused'].includes(status)) return res.status(400).json({ error: 'Invalid bot status' });
  const { data, error } = await supabase.from('clients').update({ bot_status: status }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/clients/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.get('/clients/:id/leads', requireClientAccess, async (req, res) => {
  const { data, error } = await supabase.from('leads').select('*').eq('client_id', req.params.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/clients/:id/appointments', requireClientAccess, async (req, res) => {
  const { data, error } = await supabase.from('appointments').select('*').eq('client_id', req.params.id).order('appointment_time', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
