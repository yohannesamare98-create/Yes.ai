# Deployment Guide

## 1. Landing page

Deploy `landing/index.html` as a static site.

- **Netlify**: drag the `landing` folder into Netlify's dashboard, or connect
  the repo and set the publish directory to `landing`.
- **Vercel**: `vercel deploy landing` (or connect the repo, root directory = `landing`).
- **Lovable**: import the HTML file directly, or paste its contents into a new project.

No build step needed — it's a single static HTML file.

## 2. Database (Supabase)

1. Create a free project at https://supabase.com.
2. Go to the SQL Editor → paste the contents of `database/schema.sql` → Run.
3. Copy your **Project URL** and **service_role key** (Settings → API) into
   `backend/.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Once you add Supabase Auth for client logins, also set up Row Level
   Security policies (there's a commented example at the bottom of
   `schema.sql`) so each client only ever sees their own leads/appointments.

## 3. Backend (Node.js/Express)

The backend can run anywhere that supports Node.js:

**Option A — Render/Railway/Fly.io (recommended for a long-running Express server)**
1. Push the `backend/` folder to its own Git repo (or a subfolder of your monorepo).
2. Connect it to Render/Railway.
3. Set the environment variables from `.env.example` in their dashboard.
4. Deploy. Note the resulting URL — you'll register `<url>/webhook` with Meta.

**Option B — Vercel serverless functions**
The current `server.js` is a single long-running Express app; if you want
serverless, your developer will need to split each route file into an
individual Vercel function (e.g. `/api/webhook.js`, `/api/billing/webhook.js`).
This is a small refactor, not a rewrite — the logic in `lib/` stays the same.

Either way:
```bash
cd backend
cp .env.example .env   # then fill in real keys as you get them
npm install
npm start
```
Visit `<your-backend-url>/health` to confirm it's running and see which
integrations are still in demo mode.

## 4. WhatsApp Cloud API setup (when ready)

1. Create a Meta Business App at https://developers.facebook.com → add the
   WhatsApp product.
2. Note your **Phone Number ID** and generate a permanent **Access Token**.
3. In Meta's WhatsApp → Configuration → Webhook, set:
   - Callback URL: `https://<your-backend-url>/webhook`
   - Verify Token: whatever you set as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` field.
4. Put the Phone Number ID and Access Token into `.env`.

Note: each client's WhatsApp Business number normally needs its own Meta
verification, OR you route every client through one shared number using
a template/keyword system. Decide this with your developer early — it
affects how `clients.whatsapp_number` is used to route messages in
`botEngine.js`.

## 5. OpenAI

Add `OPENAI_API_KEY` from https://platform.openai.com/api-keys. That's it —
`botEngine.js` will start generating real replies instead of demo ones.

## 6. Google Sheets & Calendar

1. In Google Cloud Console, create a project → enable the Sheets API and
   Calendar API → create a **Service Account** → download its JSON key.
2. Base64-encode the JSON key and set it as `GOOGLE_SERVICE_ACCOUNT_KEY`.
3. Share each client's Google Sheet and Calendar with the service account's
   email address (found inside the JSON key) so it has edit access.
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if you later add "Sign in
   with Google" for clients to connect their own Sheets directly (more
   client-friendly than sharing manually, but more setup work).

## 7. Stripe (14-day trial billing)

1. Create a Stripe account (or start in test mode with a test account).
2. Create 3 recurring **Products/Prices** in the Stripe Dashboard: Lite
   (AED 99/mo), Growth (AED 199/mo), Pro (AED 399/mo). Copy their Price IDs
   into `.env` as `STRIPE_PRICE_LITE/GROWTH/PRO`.
3. Add a webhook endpoint in Stripe pointing to
   `https://<your-backend-url>/api/billing/webhook`, listening for:
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
4. Copy the webhook's signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Set `STRIPE_SECRET_KEY` from your Stripe API keys page.

**UAE note**: if Stripe isn't a good fit for receiving AED payouts to a UAE
bank account, evaluate PayTabs, Telr, or Ziina as alternatives — you'd swap
`lib/stripeClient.js` for an equivalent lib using their SDK/API, keeping the
same function signatures (`createCheckoutSession`, `handleStripeEvent`) so
nothing else in the codebase needs to change.

## 8. Dashboards

Deploy `admin-dashboard/index.html` and `client-dashboard/index.html` as
static sites too (same as the landing page) — ideally behind a login wall
once real client accounts exist. They currently read/write `localStorage`
demo data; connect them to `backend`'s `/api/clients` endpoints (see
inline comments in each file) to make them real.

## 9. Custom domain + email

Point your domain's DNS to wherever you deployed the landing page. Use
`royaldo1991@gmail.com` (or a dedicated business inbox) for the notification
email fields until you set up a branded email address.
