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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    demoMode: {
      whatsapp: !process.env.WHATSAPP_TOKEN,
      openai: !process.env.OPENAI_API_KEY,
      supabase: !process.env.SUPABASE_URL,
      stripe: !process.env.STRIPE_SECRET_KEY,
      google: !process.env.GOOGLE_CLIENT_ID
    }
  });
});

app.listen(PORT, () => {
  console.log(`YES.AI backend listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
