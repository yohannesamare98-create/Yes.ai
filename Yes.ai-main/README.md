# YES.AI — Multi-Tenant WhatsApp Sales Assistant Platform

**One bot engine. Many clients. Monthly subscription revenue.**

This is the MVP codebase for YES.AI: an AI WhatsApp sales assistant you sell
as a subscription to UAE businesses (salons, clinics, real estate, car
dealers, restaurants, gyms, etc).

## The core idea

You are **not** building a separate bot for every client. You are building
**one bot engine** that reads a client's settings out of the database at
runtime (business name, services, prices, FAQs, opening hours, questions to
ask, hot-lead rules) and behaves accordingly. Onboarding a new client means
**adding a row to the database**, not writing new code.

```
Customer messages WhatsApp number
        ↓
Meta Cloud API webhook (ONE webhook URL for every client)
        ↓
botEngine.js looks up which client owns that WhatsApp number
        ↓
Builds a system prompt from that client's stored config
        ↓
OpenAI generates the reply
        ↓
Reply sent back via WhatsApp
Lead saved to Supabase → mirrored to client's Google Sheet
Hot lead? → WhatsApp/email alert to the business owner
Appointment booked? → written to client's Google Calendar
        ↓
Everything shows up in the Admin Dashboard and that client's own Dashboard
```

## Folder structure

```
yes-ai-platform/
├── landing/              → Marketing/sales page (index.html, deploy as-is)
├── admin-dashboard/       → YOUR dashboard — real Supabase Auth login, every client, all leads, billing
│   ├── index.html
│   └── config.js          → put your SUPABASE_URL + anon key here to go live
├── client-dashboard/      → Each CLIENT's own dashboard — real login, their own data only
│   ├── index.html
│   └── config.js
├── backend/               → Node.js/Express API + WhatsApp webhook + bot engine
│   ├── server.js          → main entry point
│   ├── routes/
│   │   ├── whatsappWebhook.js  → receives WhatsApp messages from Meta
│   │   ├── clientRoutes.js     → CRUD API for clients/leads/appointments
│   │   └── stripeRoutes.js     → checkout + billing webhook + cancel-subscription
│   ├── lib/
│   │   ├── botEngine.js        → THE shared AI bot logic (one file, every client)
│   │   ├── supabaseClient.js   → database connection
│   │   ├── googleSheets.js     → lead sync to Sheets
│   │   ├── googleCalendar.js   → appointment booking
│   │   ├── stripeClient.js     → subscription + 14-day trial + cancellation logic
│   │   └── notifications.js    → hot lead alerts
│   ├── .env.example
│   └── package.json
├── database/
│   └── schema.sql         → run this once in Supabase — tables + RLS + auth helper functions
└── docs/
    ├── DEPLOYMENT.md
    ├── ENV_VARS.md
    ├── ADD_CLIENT_GUIDE.md
    └── AUTH_SETUP.md       → step-by-step: create admin/client logins, enable real auth
```

## Current status: DEMO MODE

Every external integration (WhatsApp, OpenAI, Stripe, Google, Supabase) has
a **demo-mode fallback** — if the relevant API key is missing from `.env`,
the code logs what it *would* do to the console instead of crashing. This
means:

- The landing page works fully today, as-is.
- The two dashboards work fully today using local demo data in the browser
  (`localStorage`) — no backend needed to explore them.
- The backend code is complete and ready — plug in real API keys and it
  starts making real calls with zero code changes.

See `docs/ENV_VARS.md` for exactly which keys unlock which integration, and
`docs/DEPLOYMENT.md` for how to go live.

## What's a working prototype vs. production-ready today

| Piece | Status |
|---|---|
| Landing page | ✅ Ready to deploy as-is |
| Admin dashboard UI | ✅ Working prototype — clients, leads, appointments, hot leads, billing, MRR, Setup Status badges (🟢 Live / ⚪ Trial / 🟡 In Progress / 🔴 Needs Setup), plus Add/Edit/Pause/Delete/Login-as-Client actions. Runs on local demo data; needs wiring to `/api/clients` for real multi-client use. |
| Client dashboard UI | ✅ Working prototype — Overview, Leads, Appointments, Bot Settings, Knowledge Base (FAQs/description/offers), Integrations (WhatsApp/Calendar/Sheets connect state), Billing, and the full 6-step Setup Wizard. Same demo-data caveat as above. |
| Setup Wizard | ✅ 6 steps (Business Info → Services → AI Knowledge → Lead Qualification → Integrations → Launch), under 5 minutes, auto-opens for new clients, writes directly into `clients` + `bot_config`. "Connect" buttons for WhatsApp/Calendar/Sheets are simulated in demo mode — see `docs/DEPLOYMENT.md` for wiring real OAuth. |
| Database schema | ✅ Ready to run in Supabase |
| WhatsApp webhook + bot engine | ✅ Code complete, demo-mode safe — needs a real Meta WhatsApp Business API + OpenAI key to go live |
| Google Sheets/Calendar sync | ✅ Code complete, demo-mode safe — needs a Google Cloud service account |
| Stripe 14-day trial billing | ✅ Code complete, demo-mode safe — needs a real Stripe account + Price IDs |
| Client login / auth | ✅ Wired — both dashboards have real Supabase Auth login. Admins see every client (`admin_users` + `is_admin()` policy); clients see only their own leads/appointments/billing/services/FAQs (`client_users` + `my_client_id()` policy), enforced by Row Level Security at the database level. Falls back to demo mode automatically if `config.js` is left blank. See `docs/AUTH_SETUP.md`. |

Read `docs/DEPLOYMENT.md` next, then `docs/AUTH_SETUP.md` to turn on real logins.
See `docs/ARCHITECTURE.md` for how the platform is structured to support future
channels (Website Chat, Voice, Instagram, Facebook, Telegram) and CRM/marketing
automation without a rebuild.
