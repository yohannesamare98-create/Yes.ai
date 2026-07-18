# YES.AI — Test Guide (Milestone 5A)

Manual test script for the dashboard merge and security hardening in this
release. No backend keys are required for most of these — the project's
demo-mode fallback means everything below can be tested locally first.

---

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
