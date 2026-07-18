// backend/routes/conversationsRoutes.js
// ============================================================
// MILESTONE 6B — Conversations tab backend.
// All routes are scoped by client_id and protected by the existing
// requireAuth + resolveYesAiRole + requireClientAccess middleware — the
// same auth used by clientRoutes.js and testAiRoutes.js. No new auth
// system, no new isolation model: every query below is filtered by
// client_id, exactly like the rest of the app.
// ============================================================

import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { sendWhatsappMessage } from '../lib/whatsappClient.js';
import { requireAuth, resolveYesAiRole, requireClientAccess } from '../middleware/auth.js';

const router = express.Router();
router.use(express.json());
router.use('/clients/:id/conversations', requireAuth, resolveYesAiRole, requireClientAccess);

// ---------------------------------------------------------------
// GET /api/clients/:id/conversations
// List every lead/conversation for this client, most recent first.
// ---------------------------------------------------------------
router.get('/clients/:id/conversations', async (req, res) => {
  const { data, error } = await supabase
    .from('leads')
    .select(`
      id, customer_name, customer_whatsapp, last_message_preview,
      last_message_at, unread_count, lead_temperature, human_handoff,
      mode, appointment_requested, is_hot_lead, status, created_at
    `)
    .eq('client_id', req.params.id)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------------------------------------------------------------
// GET /api/clients/:id/conversations/:leadId/messages
// Full message history for one conversation, oldest first.
// ---------------------------------------------------------------
router.get('/clients/:id/conversations/:leadId/messages', async (req, res) => {
  const { id: clientId, leadId } = req.params;

  const { data: lead, error: leadError } = await supabase
    .from('leads').select('*').eq('id', leadId).eq('client_id', clientId).maybeSingle();
  if (leadError) return res.status(500).json({ error: leadError.message });
  if (!lead) return res.status(404).json({ error: 'Conversation not found' });

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, direction, body, sent_by, created_at, metadata')
    .eq('client_id', clientId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ lead, messages });
});

// ---------------------------------------------------------------
// POST /api/clients/:id/conversations/:leadId/read
// Marks a conversation as read (clears the unread badge).
// ---------------------------------------------------------------
router.post('/clients/:id/conversations/:leadId/read', async (req, res) => {
  const { id: clientId, leadId } = req.params;
  const { data, error } = await supabase
    .from('leads')
    .update({ unread_count: 0 })
    .eq('id', leadId).eq('client_id', clientId)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Conversation not found' });
  res.json(data);
});

// ---------------------------------------------------------------
// POST /api/clients/:id/conversations/:leadId/mode
// body: { mode: 'ai' | 'human' } — human takeover / return to AI.
// ---------------------------------------------------------------
router.post('/clients/:id/conversations/:leadId/mode', async (req, res) => {
  const { id: clientId, leadId } = req.params;
  const { mode } = req.body || {};

  if (mode !== 'ai' && mode !== 'human') {
    return res.status(400).json({ error: "mode must be 'ai' or 'human'" });
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ mode })
    .eq('id', leadId).eq('client_id', clientId)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Conversation not found' });
  res.json(data);
});

// ---------------------------------------------------------------
// POST /api/clients/:id/conversations/:leadId/reply
// body: { message } — a human agent sends a manual WhatsApp reply.
// Sending a manual reply implicitly takes the conversation over (sets
// mode='human' if it wasn't already), so the AI won't also reply to the
// same customer message and talk over the human agent.
// ---------------------------------------------------------------
router.post('/clients/:id/conversations/:leadId/reply', async (req, res) => {
  const { id: clientId, leadId } = req.params;
  const { message } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message (string) is required' });
  }

  const { data: client, error: clientError } = await supabase
    .from('clients').select('*').eq('id', clientId).single();
  if (clientError || !client) return res.status(404).json({ error: 'Client not found' });

  const { data: lead, error: leadError } = await supabase
    .from('leads').select('*').eq('id', leadId).eq('client_id', clientId).maybeSingle();
  if (leadError) return res.status(500).json({ error: leadError.message });
  if (!lead) return res.status(404).json({ error: 'Conversation not found' });

  try {
    await sendWhatsappMessage({
      phoneNumberId: client.whatsapp_phone_number_id,
      to: lead.customer_whatsapp,
      body: message.trim()
    });
  } catch (err) {
    console.error(`[conversationsRoutes] Failed to send manual WhatsApp reply for client ${clientId}:`, err.message);
    return res.status(502).json({ error: 'Failed to send WhatsApp message' });
  }

  try {
    const { error: msgError } = await supabase.from('messages').insert({
      client_id: clientId, lead_id: leadId, direction: 'outbound',
      body: message.trim(), sent_by: 'human'
    });
    if (msgError) throw msgError;

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        mode: 'human',
        last_message_at: new Date().toISOString(),
        last_message_preview: message.trim().slice(0, 200)
      })
      .eq('id', leadId)
      .select()
      .single();
    if (updateError) throw updateError;

    res.json({ sent: true, lead: updatedLead });
  } catch (err) {
    // The WhatsApp message already went out at this point — a save
    // failure here shouldn't be reported as a failed send, but it does
    // need to be visible in the logs since the conversation record is
    // now out of sync with what the customer actually received.
    console.error(`[conversationsRoutes] Manual reply sent but failed to save for client ${clientId}:`, err.message);
    res.json({ sent: true, warning: 'Message was sent but the conversation record failed to update.' });
  }
});

export default router;
