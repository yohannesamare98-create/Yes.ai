# How to Add a New Client (Step-by-Step)

This is the entire workflow for onboarding a new business onto YES.AI —
no new code, no redeploying the bot.

## 1. Collect their details

From the lead form / sales call, gather:
- Business name, industry, location, opening hours
- Their WhatsApp Business number (the one customers already message)
- Their services + prices
- Common FAQs and answers
- Which plan they're on (Lite / Growth / Pro)
- Owner's personal number/email for hot-lead alerts
- Their Google Sheet link (or let them create a blank one from a template)
- Their Google Calendar (usually just their business Gmail)
- Any special instructions for how the bot should talk

## 2. Add them via the Admin Dashboard

1. Open `admin-dashboard/index.html` (or its deployed URL).
2. Click **+ Add New Client**.
3. Fill in the form:
   - Business Name, Industry, WhatsApp Number
   - Notification Number/Email (the owner, for hot lead alerts)
   - Opening Hours, Location
   - Language (English / Arabic / Both)
   - Plan (Lite / Growth / Pro)
   - Google Sheet URL, Google Calendar ID
   - Services (one per line: `Name, Price`)
   - FAQs (one per line: `Question ? Answer`)
   - Qualification Questions (one per line — what the bot asks before booking)
   - Hot Lead Keywords (comma-separated — e.g. `urgent, today, cash`)
   - Any additional AI instructions (tone, upsells, special rules)
4. Leave **Bot Status** as "Off" until you've tested the flow.
5. Click **Save Client**.

Behind the scenes (once the dashboard is wired to the backend), this:
- Inserts one row into `clients`
- Inserts one row into `bot_config`
- Inserts one row into `subscriptions` (status: `trialing`, 14-day trial clock starts)

## 3. Connect their real integrations

- Share their Google Sheet + Calendar with your service account email (see `docs/DEPLOYMENT.md` step 6).
- If each client has their own Meta WhatsApp number, complete Meta's number
  verification for it and confirm it's connected to your shared webhook.

## 4. Test before going live

- Message the bot yourself from a personal WhatsApp number.
- Confirm: greeting → qualification questions → FAQ answer → booking
  confirmation → lead appears in the dashboard → hot lead alert fires if
  you use one of their hot-lead keywords.

## 5. Turn the bot on

In the Admin Dashboard, set **Bot Status** to **On** for that client (or use
the "Turn On" button in the client list). They're now live.

## 6. Hand off their dashboard

Give the client their `client-dashboard` login (once auth is added) so they
can view leads/appointments and edit their own services/FAQs without
needing you.

## 7. Billing kicks in automatically

Their 14-day trial clock started the moment you added them. On day 15,
Stripe automatically bills their card (once they've entered one) and their
subscription status flips to `active`. If a payment fails 3 times in a row,
`bot_status` automatically flips to `paused` and you'll see it flagged in
the Billing tab of the Admin Dashboard.
