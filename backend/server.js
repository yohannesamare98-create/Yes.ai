// backend/server.js
// ============================================================
// YES.AI backend — one server, every client.
// Run: npm install && npm start
// ============================================================
 
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import whatsappWebhook from './routes/whatsappWebhook.js';
import stripeRoutes from './routes/stripeRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import testAiRoutes from './routes/testAiRoutes.js';
import { supabase } from './lib/supabaseClient.js';
 
const app = express();
const PORT = process.env.PORT || 3000;

// Sets standard security headers (X-Content-Type-Options, HSTS, etc).
// Meta's webhook POSTs don't render anything in a browser, so this is safe
// to apply globally with no compatibility downside.
app.use(helmet());

// Restrict browser-based cross-origin requests to your own dashboards.
// Leave ALLOWED_ORIGINS unset in demo mode to allow all origins (matches
// prior behavior); set it to a comma-separated list in production, e.g.
// "https://app.yourdomain.com,https://admin.yourdomain.com".
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

// General API rate limit — generous enough for normal dashboard use, but
// stops a leaked URL or scraper from hammering the backend or running up
// your Supabase/OpenAI usage.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

// Tighter limit on the public webhook endpoint specifically, since it's the
// one route Meta calls without any auth token of its own.
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use('/webhook', webhookLimiter);
 
// NOTE: stripeRoutes registers its own express.raw() body parser for the
// webhook path specifically — mount it BEFORE any global express.json().
app.use('/api', stripeRoutes);
 
// Capture the raw request body alongside the parsed JSON so the WhatsApp
// webhook route can verify Meta's X-Hub-Signature-256 header against the
// exact bytes that were sent (HMAC verification needs the raw bytes, not
// the re-serialized JSON, which can differ in whitespace/key order).
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use('/api', clientRoutes);
app.use('/api', testAiRoutes);
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
});
