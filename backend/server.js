// backend/server.js
// ============================================================
// YES.AI backend — one server, every client.
// Run: npm install && npm start
// ============================================================
 
import 'dotenv/config';
import express from 'express';
import whatsappWebhook from './routes/whatsappWebhook.js';
import stripeRoutes from './routes/stripeRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import { supabase } from './lib/supabaseClient.js';
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// NOTE: stripeRoutes registers its own express.raw() body parser for the
// webhook path specifically — mount it BEFORE any global express.json().
app.use('/api', stripeRoutes);
 
app.use(express.json());
app.use('/api', clientRoutes);
app.use('/', whatsappWebhook); // exposes GET/POST /webhook for Meta
 
app.get('/', (req, res) => {
  res.send('YES.AI backend is running. See /webhook (WhatsApp) and /api routes.');
});
 
app.get('/health', async (req, res) => {
  // "configured" = the env var is present at all.
  // "connected" = for Supabase specifically, we've actually queried the
  // database and gotten a real response — not just "a key was supplied".
  // A wrong URL, wrong key, or unreachable project would show configured:
  // true but connected: false, which is exactly the case worth catching.
  const supabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  let supabaseConnected = false;
  let supabaseError = null;
 
  if (supabaseConfigured) {
    try {
      const { error } = await supabase.from('clients').select('id').limit(1);
      // A real connection returns either data or a normal Postgres/PostgREST
      // error (e.g. RLS denial, empty table). A failed connection throws or
      // returns a network/auth-level error — that's what we're catching here.
      supabaseConnected = !error;
      if (error) supabaseError = error.message;
    } catch (err) {
      supabaseConnected = false;
      supabaseError = err.message;
    }
  }
 
  res.json({
    status: 'ok',
    integrations: {
      whatsapp: !!process.env.WHATSAPP_TOKEN,
      openai: !!process.env.OPENAI_API_KEY,
      supabase: supabaseConnected,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      google: !!process.env.GOOGLE_CLIENT_ID
    },
    supabase: {
      configured: supabaseConfigured,
      connected: supabaseConnected,
      error: supabaseError
    }
  });
});
 
app.listen(PORT, () => {
  console.log(`YES.AI backend listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
