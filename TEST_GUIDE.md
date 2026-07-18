# YES.AI — Test Guide

## Milestone 6B — Production WhatsApp Cloud API Messaging

### 1. Run the migration first

In the Supabase SQL Editor, run
`database/migrations/20260719_production_messaging.sql` (after
`20260718_intelligence_engine.sql` from Milestone 6A). Idempotent — safe
to run more than once.

### 2. Set your client's stable phone_number_id (recommended)

Find your number's `phone_number_id` in Meta Business Manager → WhatsApp
→ API Setup, then set it via the existing client update endpoint:

```bash
curl -X PATCH https://<your-backend>/api/clients/<client-id> \
  -H "Authorization: Bearer <a valid session token>" \
  -H "Content-Type: application/json" \
  -d '{"whatsapp_phone_number_id":"1234567890"}'
```

If you skip this, the webhook falls back to matching on
`display_phone_number` (the old behavior) — still works, just less
robust to Meta formatting changes.

### 3. Unit tests — pure logic (no API key, Supabase, or Meta needed)

```bash
cd backend
npm install
node -e "
import('./lib/botEngine.js').then(async m => {
  const assert = await import('node:assert/strict');
  const fresh = m.buildUnsupportedMediaResponse(null);
  assert.default.equal(fresh.human_handoff, true);
  assert.default.equal(fresh.intent, 'support');
  const withPrior = m.buildUnsupportedMediaResponse({lead_temperature:'warm', qualification_score:60, collected_customer_data:{service_needed:'Haircut'}, conversation_summary:'x'});
  assert.default.equal(withPrior.lead_temperature, 'warm');
  assert.default.equal(withPrior.qualification_score, 60);
  console.log('buildUnsupportedMediaResponse: OK');
});
import('./lib/whatsappClient.js').then(async m => {
  const assert = await import('node:assert/strict');
  const result = await m.sendWhatsappMessage({ phoneNumberId: null, to: '971500000000', body: 'test' });
  assert.default.equal(result.sent, false);
  assert.default.equal(result.demo, true);
  console.log('whatsappClient demo-mode-safe: OK');
});
"
```

**Pass condition:** both `OK` lines print, no assertion errors.

### 4. Backend boots cleanly, every new route is auth-protected

```bash
cd backend
node server.js &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
# Expect: 200

for path in \
  "clients/x/conversations" \
  "clients/x/conversations/y/messages"; do
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/$path"
done
# Expect: 401, 401 (no Authorization header)

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/clients/x/conversations/y/read
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/clients/x/conversations/y/mode -H "Content-Type: application/json" -d '{"mode":"human"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/clients/x/conversations/y/reply -H "Content-Type: application/json" -d '{"message":"hi"}'
# Expect: 401, 401, 401
kill %1
```

### 5. Milestone 5A protections regression check

```bash
cd backend
WHATSAPP_APP_SECRET=testsecret123 node server.js &

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=deadbeef" -d '{"entry":[]}'
# Expect: 401

BODY='{"entry":[]}'
SIG=$(node -e "const c=require('crypto');process.stdout.write('sha256='+c.createHmac('sha256','testsecret123').update('$BODY').digest('hex'))")
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY"
# Expect: 200

curl -sI http://localhost:3000/health | grep -i "x-content-type\|strict-transport"
# Expect both headers present
kill %1
```

### 6. Human takeover — manual walkthrough

1. Log into `client-dashboard/index.html`, click the new **Conversations**
   tab (top nav — shows a small red dot if there are unread messages).
2. Have a real (or replayed test) WhatsApp message land for one of your
   leads. Confirm it appears in the conversation list with an unread
   badge and a live preview of the latest message.
3. Click into the conversation — confirm the unread badge clears and the
   full message history loads, with AI replies visibly tagged "AI".
4. Click **🙋 Take Over** — confirm:
   - A "Human mode active" banner appears.
   - The button changes to **↩ Return to AI**.
5. Send a real WhatsApp message from that customer's number now. Confirm:
   - It appears in the conversation (and increments unread) but **no AI
     reply is sent** — check your backend logs, there should be no
     OpenAI call for this message.
6. Type a manual reply in the box and hit Send. Confirm:
   - The customer actually receives it on WhatsApp.
   - It appears in the thread tagged "You", and the conversation list's
     preview updates.
7. Click **↩ Return to AI**, then send another test message from the
   customer — confirm the AI replies normally again.

**Pass condition:** all of the above behave as described, and at no
point does the AI reply while in human mode.

### 7. Unsupported media — manual walkthrough

1. From a test WhatsApp number, send an image (or voice note) to your
   connected business number.
2. Confirm in the Conversations tab: the inbound message shows as
   `[image message]` (or the relevant type), a safe reply was sent to the
   customer, and the conversation shows the "flagged for human
   follow-up" banner.
3. Confirm no OpenAI call was made for this message (check backend logs
   — there should be no intelligence-engine invocation, since media
   messages skip the AI entirely).

### 8. Duplicate delivery — manual walkthrough

Meta occasionally retries a webhook delivery for the same message. Send
one real WhatsApp message and confirm in your backend logs you see at
most one `[whatsappWebhook] duplicate message ignored: <id>` line if
Meta happens to retry it, and that the customer only ever receives one
reply — this logic is unchanged from Milestone 5A/6A, just re-verify it
still works with the new phone_number_id—based client lookup.

### 9. Full production checklist

See the **Production Verification Checklist** in
`MILESTONE_6B_DELIVERY.md` for the complete pre-launch list (Meta webhook
config, environment variables, end-to-end message test, etc).

---

# Milestone 6A — OpenAI Intelligence Engine
_Prior session — still valid, unchanged by 6B except where noted in
CHANGELOG.md_



### 1. Run the migration first

In the Supabase SQL Editor, run
`database/migrations/20260718_intelligence_engine.sql`. It's idempotent —
safe to run more than once.

### 2. Unit tests — pure logic (no API key or Supabase needed)

```bash
cd backend
npm install
node -e "
import('./lib/botEngine.js').then(async m => {
  const assert = await import('node:assert/strict');
  assert.default.equal(m.keywordForcesHandoff('I want a refund', ['refund']), true);
  assert.default.equal(m.keywordForcesHandoff('price please', ['refund']), false);
  assert.default.equal(m.keywordSuggestsHot('need this urgent today', {keywords:['urgent']}), true);
  const merged = m.mergeCollectedData({service_needed:'Haircut', budget:null}, {service_needed:null, budget:'AED 200'});
  assert.default.equal(merged.service_needed, 'Haircut');
  assert.default.equal(merged.budget, 'AED 200');
  console.log('All botEngine helper tests passed.');
});
"
```

**Pass condition:** `All botEngine helper tests passed.` with no assertion
errors.

### 3. Backend boots cleanly, new route is mounted and auth-protected

```bash
cd backend
node server.js &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
# Expect: 200

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://localhost:3000/api/clients/fake-id/test-ai \
  -H "Content-Type: application/json" -d '{"message":"hi"}'
# Expect: 401 (no Authorization header — proves the route is protected
# by the same auth middleware as the rest of the client API)
kill %1
```

### 4. Test AI page — manual walkthrough

1. Make sure Supabase is configured (`client-dashboard/config.js`) and
   you have at least one client + `bot_config` row with some `services`
   and `faqs` filled in (via the dashboard's Bot Settings/Knowledge Base
   tabs, or directly in Supabase).
2. Log into `client-dashboard/index.html` as that client.
3. Click **🧪 Test AI** in the top nav (new link, next to Setup Wizard).
4. Ask something answerable from that client's real FAQs/services —
   confirm the reply uses the real price/answer, not a generic one.
5. Ask something NOT in their services/FAQs/policies (e.g. "do you do
   home visits?" if that's not configured) — confirm the AI does not
   invent an answer, and either says it will check or the inspector
   panel shows **human_handoff = true** (red banner).
6. Say something like "I need this urgently, my budget is AED 500, can
   we do tomorrow?" — confirm the inspector panel's **Collected customer
   data** fills in budget/urgency/preferred_date, and **Lead
   temperature** moves toward warm/hot.
7. Send a follow-up message and confirm the AI does **not** re-ask a
   question you already answered — this proves conversation memory is
   working within the test session.
8. Click **Reset conversation** and confirm the chat and inspector both
   clear, and the next message starts a fresh (not carried-over)
   conversation.
9. Check the browser's Network tab: no requests should go to `/leads` or
   create anything visible back in the Leads tab of the dashboard after
   a test conversation — test mode should never pollute real data.

**Pass condition:** all of the above behave as described. If
`OPENAI_API_KEY` isn't set on the backend yet, you'll see a blue "Demo
mode" banner and a clearly-labeled simulated reply instead of a real AI
response — that's expected demo-mode behavior, not a bug.

### 5. Real end-to-end OpenAI call (requires a real API key + Supabase)

This can't be verified from a sandboxed environment without network
access to `api.openai.com` — verify it once deployed:

1. Set a real `OPENAI_API_KEY` in Railway.
2. Repeat the Test AI walkthrough above.
3. Confirm `demo_mode: false` in the response and that `reply` is a real,
   natural-sounding AI-generated message referencing your actual
   configured services/FAQs.
4. Deliberately send a message with no relevant FAQ configured and
   confirm the AI does not fabricate details — this is the core
   anti-hallucination behavior the milestone is built around.

### 6. Live WhatsApp regression check

Confirm `whatsappWebhook.js` didn't need any code changes and still
works: send a real WhatsApp message to a connected number (or replay a
test payload through `POST /webhook` with a valid signature per the
Milestone 5A section below), and confirm:
- A `leads` row is created/updated with the new fields populated
  (`intent`, `lead_temperature`, `qualification_score`,
  `collected_customer_data`, etc.)
- The `messages` table has both the inbound and outbound rows, with the
  outbound row's `metadata` column containing the full structured JSON.
- A second message from the same customer doesn't repeat questions
  already answered in the first.

---

# Milestone 5A — Dashboard Merge & Security Hardening
_Previous session — still valid, unchanged by 6A_

## 1. Client dashboard merge

**Goal:** confirm the fixed V2 dashboard is live and the old
login/dashboard race condition is gone.

1. Open `client-dashboard/index.html` directly in a browser (or serve the
   repo locally and visit it).
2. On load, you should briefly see a centered loading state ("Preparing
   your YES.AI workspace…") before the login screen appears — the login
   screen and dashboard should **never** flash or render on top of each
   other.
3. Log in with any demo credentials (or use the "Continue with Google" /
   magic link buttons to confirm they render, even without real Supabase
   keys configured).
4. Confirm all existing tabs still work: Overview, Leads, Appointments,
   Bot Settings, Knowledge Base, Integrations, Billing.
5. On a phone (or Chrome DevTools device emulation, iPhone SE size),
   confirm the Setup Wizard opens full-screen with no horizontal scroll
   and the action buttons stay reachable above the home indicator.

**Pass condition:** no visual regression vs. the previous dashboard, plus
the loading state and auth options above are present.

---

## 2. XSS fix — lead/appointment rendering

**Goal:** confirm untrusted WhatsApp data can no longer execute as HTML.

1. Open your browser's DevTools console on `client-dashboard/index.html`.
2. Seed a malicious demo lead. In the console:
   ```js
   const db = JSON.parse(localStorage.getItem('yesai_demo_db') || '{}');
   db.leads = db.leads || [];
   db.leads.push({
     id: 'test-xss', client_id: db.clients?.[0]?.id, status: 'new',
     customer_name: '<img src=x onerror="alert(1)">',
     customer_whatsapp: '+971500000000',
     message_summary: '<script>alert(2)</script>',
     is_hot_lead: false, created_at: new Date().toISOString()
   });
   localStorage.setItem('yesai_demo_db', JSON.stringify(db));
   location.reload();
   ```
   *(Adjust the storage key if your demo DB uses a different one — check
   `STORAGE_KEY` near the top of the dashboard's script.)*
3. Log in, go to the **Leads** tab.

**Pass condition:** the row shows the literal text
`<img src=x onerror="alert(1)">` in the Name column (visibly as text, not
rendered as a broken image) — **no alert box appears**. Repeat the same
check on `admin-dashboard/index.html`'s Leads and Hot Leads tables.

4. Click **Export CSV** with that same seeded lead present, open the file
   in Excel/Google Sheets, and confirm the malicious fields import as
   plain text with no formula prompt. Also test a lead with
   `customer_name: '=1+1'` — it should import as the literal text `'=1+1`,
   not execute as a formula.

---

## 3. Webhook signature verification

**Goal:** confirm the backend rejects forged webhook requests once
`WHATSAPP_APP_SECRET` is configured, and stays in safe demo mode when it
isn't.

```bash
cd backend
npm install

# --- Demo mode (no WHATSAPP_APP_SECRET set) ---
node server.js &
curl -i -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" -d '{"entry":[]}'
# Expect: 200 — and a console warning that signature verification was skipped.
kill %1

# --- Production mode ---
WHATSAPP_APP_SECRET=testsecret123 node server.js &

# Wrong/missing signature — should be rejected
curl -i -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=deadbeef" -d '{"entry":[]}'
# Expect: 401

curl -i -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" -d '{"entry":[]}'
# Expect: 401 (no signature header at all)

# Correct signature — should be accepted
BODY='{"entry":[]}'
SIG=$(node -e "const c=require('crypto');process.stdout.write('sha256='+c.createHmac('sha256','testsecret123').update('$BODY').digest('hex'))")
curl -i -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" -d "$BODY"
# Expect: 200

kill %1
```

**Pass condition:** matches the expected status codes in each comment
above. In real production use, `WHATSAPP_APP_SECRET` is your Meta App
Secret (Meta Business App → Settings → Basic), and Meta itself signs every
real webhook call — this test just proves your server checks it correctly.

---

## 4. Rate limiting & security headers

```bash
cd backend && node server.js &

# Security headers present
curl -sI http://localhost:3000/health | grep -i "x-content-type\|strict-transport"
# Expect both headers present

# Rate limit trips after repeated requests (61+ in a minute to /webhook)
for i in $(seq 1 65); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/webhook \
    -X GET
done | sort | uniq -c
# Expect mostly 403 (bad verify token, normal) with 429 appearing once
# you cross the 60/min limit.

kill %1
```

---

## 5. Regression check — nothing else broke

1. Confirm `landing/index.html` still loads and looks unchanged.
2. Confirm `admin-dashboard/index.html` login, all tabs, and the Add/Edit/
   Pause/Delete/Login-as-Client client actions still work exactly as
   before — only the Leads/Hot Leads/Appointments tables and CSV export
   should look different (escaped values only show up if you seed
   malicious test data as in Section 2 — normal data displays identically
   to before).
3. Run `node --check` over every changed backend file to confirm no syntax
   errors:
   ```bash
   cd backend
   node --check server.js
   node --check routes/whatsappWebhook.js
   ```

---

## Out of scope for this test guide

Multilingual support (Milestone 5B) is not part of this release — there is
nothing language-related to test yet. This guide will be extended once
that milestone lands.
