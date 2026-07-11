// backend/routes/clientRoutes.js
// ============================================================
// CRUD API for clients + their bot config. Used by both the
// Admin Dashboard (all clients) and Client Dashboard (own client only —
// add an auth check + client_id scoping before going to production).
// ============================================================

import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();
router.use(express.json());

// ---- List all clients (admin only) ----
router.get('/clients', async (req, res) => {
  const { data, error } = await supabase.from('clients').select('*, subscriptions(*)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Get one client + bot config ----
router.get('/clients/:id', async (req, res) => {
  const { data: client, error } = await supabase.from('clients').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Client not found' });
  const { data: config } = await supabase.from('bot_config').select('*').eq('client_id', req.params.id).single();
  res.json({ client, config });
});

// ---- Add a new client (this is THE step for onboarding a new business) ----
router.post('/clients', async (req, res) => {
  const {
    business_name, industry, whatsapp_number, contact_email, location,
    opening_hours, language, plan, notification_number, notification_email,
    google_sheet_url, google_calendar_id,
    services, faqs, qualification_questions, hot_lead_rules, ai_instructions
  } = req.body;

  const { data: client, error } = await supabase.from('clients').insert({
    business_name, industry, whatsapp_number, contact_email, location,
    opening_hours, language: language || 'en', plan: plan || 'lite',
    bot_status: 'off', notification_number, notification_email,
    google_sheet_url, google_calendar_id
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('bot_config').insert({
    client_id: client.id,
    ai_instructions: ai_instructions || '',
    services: services || [],
    faqs: faqs || [],
    qualification_questions: qualification_questions || [
      'What service do you need?', 'What date works for you?', 'What time do you prefer?'
    ],
    hot_lead_rules: hot_lead_rules || { keywords: ['urgent', 'today', 'asap'] }
  });

  await supabase.from('subscriptions').insert({ client_id: client.id, plan: plan || 'lite', status: 'trialing' });

  res.status(201).json(client);
});

// ---- Update client details ----
router.patch('/clients/:id', async (req, res) => {
  const { data, error } = await supabase.from('clients').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Update bot config (services, FAQs, questions, hot lead rules, AI instructions) ----
router.patch('/clients/:id/bot-config', async (req, res) => {
  const { data, error } = await supabase.from('bot_config').update(req.body).eq('client_id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Toggle bot on/off/paused ----
router.patch('/clients/:id/bot-status', async (req, res) => {
  const { status } = req.body; // 'on' | 'off' | 'paused'
  const { data, error } = await supabase.from('clients').update({ bot_status: status }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Delete a client (cascades to bot_config, leads, appointments, messages, subscriptions, invoices) ----
router.delete('/clients/:id', async (req, res) => {
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---- Leads for one client (or all, for admin, if no id given) ----
router.get('/clients/:id/leads', async (req, res) => {
  const { data, error } = await supabase.from('leads').select('*').eq('client_id', req.params.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Appointments for one client ----
router.get('/clients/:id/appointments', async (req, res) => {
  const { data, error } = await supabase.from('appointments').select('*').eq('client_id', req.params.id).order('appointment_time', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
