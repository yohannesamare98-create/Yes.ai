// backend/routes/testAiRoutes.js
// ============================================================
// MILESTONE 6A — Test AI endpoint.
// Lets a client (or admin) try their bot's business knowledge and
// qualification behavior before connecting a live WhatsApp number.
// Reuses the exact same intelligence engine as real WhatsApp traffic
// (runTestMessage() in botEngine.js calls the same buildSystemPrompt +
// callIntelligenceEngine used by handleIncomingMessage()) — this is not
// a separate, divergent code path, just a stateless entry point into it.
//
// Deliberately writes NOTHING to Supabase: the frontend keeps the running
// conversation in memory and sends the full history each call, so you can
// test freely without creating fake leads/messages that would show up in
// your real dashboards.
// ============================================================

import express from 'express';
import { runTestMessage } from '../lib/botEngine.js';
import { requireAuth, resolveYesAiRole, requireClientAccess } from '../middleware/auth.js';

const router = express.Router();
router.use(express.json());

const MAX_TEST_HISTORY = 30; // guards against an unbounded request body

router.post(
  '/clients/:id/test-ai',
  requireAuth,
  resolveYesAiRole,
  requireClientAccess,
  async (req, res) => {
    const clientId = req.params.id;
    const { message, conversation_history } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message (string) is required' });
    }

    const priorHistory = Array.isArray(conversation_history) ? conversation_history : [];
    const trimmedHistory = priorHistory.slice(-MAX_TEST_HISTORY).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, 4000)
    }));
    const conversationHistory = [...trimmedHistory, { role: 'user', content: message.trim().slice(0, 4000) }];

    try {
      const result = await runTestMessage({ clientId, conversationHistory });
      res.json({
        reply: result.reply,
        structured: result.structured,
        demo_mode: result.demo,
        ai_failed: result.aiFailed,
        conversation_history: [...conversationHistory, { role: 'assistant', content: result.reply }]
      });
    } catch (err) {
      console.error(`[testAiRoutes] Test AI call failed for client ${clientId}:`, err.message);
      res.status(500).json({ error: 'Test AI call failed', detail: err.message });
    }
  }
);

export default router;
