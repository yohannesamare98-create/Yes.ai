# Environment Variables Reference

All variables live in `backend/.env` (copy from `backend/.env.example`).
Leave any group blank to keep that integration in demo mode.

| Variable | Used for | Where to get it |
|---|---|---|
| `APP_URL` | Redirect URLs after Stripe checkout | Your deployed backend/frontend URL |
| `PORT` | Local server port | Default `3000` is fine |
| `WHATSAPP_TOKEN` | Sending WhatsApp messages (both customer replies and hot-lead alerts) | Meta Business App → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | Which WhatsApp number sends replies | Meta Business App → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification handshake | You choose this value yourself, then enter the same value in Meta's webhook config |
| `WHATSAPP_APP_SECRET` | Verifying that incoming webhook POSTs really came from Meta (`X-Hub-Signature-256`) | Meta Business App → Settings → Basic → App Secret |
| `ALLOWED_ORIGINS` | Restricts which website origins can call `/api` from a browser | Comma-separated list, e.g. `https://app.yourdomain.com,https://admin.yourdomain.com`. Leave blank in demo mode. |
| `OPENAI_API_KEY` | The AI replies | https://platform.openai.com/api-keys |
| `OPENAI_MODEL` | (Optional) Overrides the model used by the intelligence engine | Defaults to `gpt-4o-mini` if unset — only set this if you want a different model |
| `SUPABASE_URL` | Database connection | Supabase project → Settings → API |
| `SUPABASE_KEY` | (public/anon key, if used client-side later) | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Database connection (backend only — full access, keep secret) | Supabase project → Settings → API |
| `STRIPE_SECRET_KEY` | Billing | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Verifying Stripe webhook events | Stripe Dashboard → Developers → Webhooks → your endpoint |
| `STRIPE_PRICE_LITE/GROWTH/PRO` | Which Stripe Price ID maps to each plan | Stripe Dashboard → Products |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (if you later let clients connect their own Sheets/Calendar directly) | Google Cloud Console → Credentials |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Sheets + Calendar sync (base64-encoded service account JSON) | Google Cloud Console → IAM → Service Accounts |

## Quick checklist for going live feature-by-feature

- [ ] Add `OPENAI_API_KEY` → bot starts generating real replies
- [ ] Add `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + register webhook → bot goes live on real WhatsApp
- [ ] Add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + run `schema.sql` → leads/appointments persist for real
- [ ] Add `GOOGLE_SERVICE_ACCOUNT_KEY` → Sheets/Calendar sync goes live
- [ ] Add Stripe keys + Price IDs → real subscriptions and 14-day trials start processing

You can turn these on one at a time, in any order — nothing else breaks
while a given integration is still in demo mode.
