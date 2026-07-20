# Architecture — Built to Extend Beyond WhatsApp

YES.AI's core design already separates three concerns, which is what makes
adding new channels later a matter of writing a new adapter, not rebuilding
the platform:

```
Channel adapter  →  botEngine.js (shared brain)  →  Supabase (shared data)
(WhatsApp today)     (per-client config, OpenAI)     (clients, leads, etc.)
```

## What's channel-agnostic today

- **`backend/lib/botEngine.js`** — builds the system prompt from a client's
  stored config (services, FAQs, tone, questions, hot-lead rules) and calls
  OpenAI. Nothing in this file is WhatsApp-specific except the parameter
  names (`businessWhatsappNumber`, `customerWhatsappNumber`) — the logic
  itself works for any conversational channel.
- **`database/schema.sql`** — `leads` and `messages` both have a `channel`
  column (`'whatsapp' | 'website_chat' | 'voice' | 'instagram' | 'facebook' | 'telegram'`),
  defaulting to `'whatsapp'` so nothing breaks today. A lead or message from
  any future channel slots into the same tables, the same dashboards, and
  the same admin/client views with zero schema changes.
- **The dashboards** — read leads/appointments generically; they don't
  assume WhatsApp anywhere in the UI beyond labels.

## What's WhatsApp-specific today

Only **`backend/routes/whatsappWebhook.js`** — it's the *adapter*: it
translates Meta's webhook payload into the shape `botEngine.js` expects,
sends replies back via the WhatsApp Cloud API, and stamps `channel: 'whatsapp'`
on the lead/message rows it creates.

## Adding a new channel later

For each new channel (Website Chat, Voice AI, Instagram, Facebook Messenger,
Telegram), the pattern is the same:

1. Create a new adapter file, e.g. `backend/routes/instagramWebhook.js`.
2. In it, translate that platform's inbound event into a call to
   `handleIncomingMessage()` in `botEngine.js`, passing `channel: 'instagram'`.
3. Have it send the AI's reply back through that platform's API instead of
   WhatsApp's.
4. Mount the new route in `server.js` alongside the existing ones.

No changes to `botEngine.js`, the database schema, or either dashboard are
required — they already generalize. The one small refactor worth doing
*before* the first non-WhatsApp channel ships: rename `businessWhatsappNumber`
/ `customerWhatsappNumber` in `botEngine.js` to something channel-neutral
like `businessChannelId` / `customerChannelId`, purely for code clarity —
functionally nothing needs to change.

## CRM / Marketing Automation

These aren't separate products bolted on — they're views over data that
already exists:

- **CRM** = the `leads`, `messages`, and `appointments` tables, already
  queryable per client today. A future "Customer 360" view is a new
  dashboard tab, not new infrastructure.
- **Marketing automation** (e.g. re-engaging cold leads) = a scheduled job
  that queries `leads` where `status = 'new'` and `created_at` is old,
  and calls `botEngine.js` to send a follow-up — using the exact same
  shared engine, just triggered by a timer instead of an inbound message.

This is why the "one engine, many clients" principle matters beyond just
WhatsApp: it's the same reason onboarding a new *client* doesn't require
new code, and it's the same reason adding a new *channel* won't either.
