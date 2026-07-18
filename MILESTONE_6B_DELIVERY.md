# Milestone 6B — Delivery Notes

## Exact files changed

### New files
- `backend/lib/whatsappClient.js` — shared WhatsApp Cloud API send function
- `backend/routes/conversationsRoutes.js` — Conversations API (list,
  messages, mark-read, mode toggle, manual reply)
- `database/migrations/20260719_production_messaging.sql` — schema migration

### Modified files
- `backend/lib/botEngine.js` — `getClientByWhatsappNumber()` now takes
  `{ phoneNumberId, displayNumber }` and prefers the stable ID;
  `handleIncomingMessage()` gained human-mode pause logic, unsupported-
  media handling, and unread/last-message tracking on every lead upsert
- `backend/routes/whatsappWebhook.js` — extracts `phone_number_id` and
  `message.type` from the payload, calls the updated
  `handleIncomingMessage()` signature, uses the shared `whatsappClient.js`
  instead of a local send function (the old local `sendWhatsappReply()`
  was removed, its logic now lives in `whatsappClient.js`)
- `backend/routes/clientRoutes.js` — `whatsapp_phone_number_id` added to
  `CLIENT_UPDATE_FIELDS`
- `backend/server.js` — mounts `conversationsRoutes`
- `client-dashboard/index.html` — additive Conversations tab (nav button,
  view panel, scoped CSS, `DataAPI` methods, rendering/interaction JS).
  No existing tab's markup, styling, or behavior was changed.

### Untouched (verified, not just assumed)
- `admin-dashboard/index.html`, `landing/`, `test-ai.html` — no changes
- All Milestone 5A security middleware (helmet, CORS, rate limiting,
  webhook signature verification) — unmodified
- Milestone 6A's structured-output schema, prompt building, and
  qualification/merging logic — unmodified

## Required Supabase migrations

Run in order (if not already applied from prior milestones):
```
database/migrations/20260718_intelligence_engine.sql   (Milestone 6A)
database/migrations/20260719_production_messaging.sql  (Milestone 6B — this release)
```
Both are idempotent — safe to re-run.

## Required Railway environment variables

No previously-required variable was removed or renamed. One new variable
is recommended (not strictly required — there's a fallback):

| Variable | Required? | Notes |
|---|---|---|
| `WHATSAPP_TOKEN` | Already required (unchanged) | Meta permanent access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Already required (unchanged) | Used as the fallback send-from number if a client doesn't have their own `whatsapp_phone_number_id` set |
| `WHATSAPP_APP_SECRET` | Already required (unchanged, from 5A) | Webhook signature verification |
| `WHATSAPP_VERIFY_TOKEN` | Already required (unchanged) | Webhook handshake |
| `OPENAI_API_KEY` | Already required (unchanged, from 6A) | Not reconnected — reused exactly as-is |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Already required (unchanged) | |

No new variable is strictly required for 6B — everything reuses what
5A/6A already need. Setting each client's `whatsapp_phone_number_id` (via
`PATCH /api/clients/:id`, see below) is **recommended** for
multi-number setups but not required for a single shared number.

## Exact Meta webhook setup steps

If you've already completed webhook setup for a prior milestone, only
step 5 is new for this release.

1. **Meta Business Manager → your App → WhatsApp → API Setup.**
   Copy your **Phone number ID** — this is the value to store as
   `clients.whatsapp_phone_number_id` for each client (step 5).

2. **WhatsApp → Configuration → Webhook.**
   - Callback URL: `https://<your-railway-domain>/webhook`
   - Verify token: must exactly match your `WHATSAPP_VERIFY_TOKEN`
     Railway env var.
   - Click **Verify and Save** — this triggers a `GET /webhook` handshake;
     check Railway logs for `[whatsappWebhook] Webhook verified` to
     confirm it succeeded.

3. **Subscribe to webhook fields:** at minimum, `messages`. (Optional:
   `message_status` if you later want delivery/read receipts — not used
   by this milestone.)

4. **App Settings → Basic → App Secret.**
   Copy this into `WHATSAPP_APP_SECRET` on Railway — this is what powers
   the Milestone 5A signature verification. Without it, the webhook still
   works but skips signature verification (logged as a warning).

5. **NEW for 6B — set each client's stable phone_number_id:**
   ```bash
   curl -X PATCH https://<your-backend>/api/clients/<client-id> \
     -H "Authorization: Bearer <a valid session token>" \
     -H "Content-Type: application/json" \
     -d '{"whatsapp_phone_number_id":"<the Phone number ID from step 1>"}'
   ```
   If you're running a single shared WhatsApp number for all clients (the
   setup this project launched with), this step is optional — the
   webhook falls back to matching `display_phone_number`, and outbound
   sends fall back to the global `WHATSAPP_PHONE_NUMBER_ID` env var.
   Setting it explicitly is recommended once you have more than one
   number in play, since `phone_number_id` is guaranteed stable while
   `display_phone_number`'s formatting is not.

6. **Send a real test message** to the connected WhatsApp number from
   your own phone, and confirm in Railway logs / the Conversations tab
   that it was received, replied to, and saved.

## Production verification checklist

Run through this before considering 6B live for real customer traffic:

**Configuration**
- [ ] `database/migrations/20260718_intelligence_engine.sql` and
      `20260719_production_messaging.sql` both applied in Supabase
- [ ] `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
      `WHATSAPP_VERIFY_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_URL`,
      `SUPABASE_SERVICE_ROLE_KEY` all set on Railway
- [ ] Meta webhook callback URL verified (Railway logs show
      `Webhook verified`)
- [ ] `messages` field subscribed in Meta's webhook configuration
- [ ] Each live client has either `whatsapp_phone_number_id` set, or is
      intentionally relying on the single-shared-number fallback

**Functional**
- [ ] A real inbound WhatsApp message reaches the webhook and gets a
      real AI reply back on the same number within a few seconds
- [ ] The reply reflects that client's actual configured services/FAQs
      (not another client's, not invented information)
- [ ] A second message from the same customer shows the AI remembering
      the first message (doesn't re-ask answered questions)
- [ ] Sending an image/voice note gets the safe canned reply and flags
      `human_handoff`, without an OpenAI call happening
- [ ] Taking over a conversation from the Conversations tab stops the AI
      from auto-replying to that customer's next message
- [ ] A manual reply sent from the Conversations tab is actually
      delivered to the customer's WhatsApp
- [ ] Returning a conversation to AI mode resumes automatic replies
- [ ] Duplicate webhook delivery (retry from Meta) does not produce a
      duplicate reply to the customer
- [ ] A second client's leads/messages/config are never visible while
      logged in as a different client (spot-check in the dashboard)

**Security (regression from 5A)**
- [ ] `POST /webhook` with an invalid `X-Hub-Signature-256` is rejected
      with `401`
- [ ] All `/api/clients/:id/conversations*` routes reject requests with
      no `Authorization` header with `401`
- [ ] Rate limiting still applies to `/api` and `/webhook` (spot-check
      response headers or trigger the limit deliberately in staging)
- [ ] No access token, app secret, or service-role key appears in
      Railway logs under normal operation or in any error path exercised
      above

**Rollback plan**
- [ ] Confirm you can redeploy the previous (6A) build from Railway if
      something in 6B needs to be rolled back — the migration is
      additive-only (no columns dropped, no data rewritten), so rolling
      back the application code does not require reversing the migration
