# Supabase Auth Setup — Admin & Client Logins

This is the full walkthrough for turning on real login for both dashboards.
Until you do this, both dashboards run fine in **demo mode** (no login,
local browser data) — nothing breaks by leaving it for later.

## How it works

- **One Supabase Auth user pool** for everyone (admins and clients both log
  in with plain email + password).
- Two small mapping tables decide what a logged-in user is allowed to see:
  - `admin_users` — if your `auth_uid` is in here, you're an admin and can
    see every client (enforced by the `is_admin()` policy on every table).
  - `client_users` — if your `auth_uid` is in here, you're linked to exactly
    one `client_id`, and can only ever see that client's rows (enforced by
    the `my_client_id()` policy).
- Row Level Security (RLS) enforces this **in the database itself** — even
  if someone tampers with the frontend JavaScript, Postgres still refuses
  to return rows they're not allowed to see.

## Step 1 — Run the schema

If you haven't already, run `database/schema.sql` in your Supabase
project's SQL Editor. It creates every table, the `is_admin()` /
`my_client_id()` helper functions, and all the RLS policies.

## Step 2 — Create your own admin login

1. Supabase Dashboard → Authentication → Users → **Add User**.
2. Enter your email + a password (or use "send invite" for a magic link instead).
3. Copy the new user's **UID** (shown in the users table).
4. SQL Editor → run:
   ```sql
   insert into admin_users (auth_uid, email, full_name)
   values ('<paste-the-uid-here>', 'you@example.com', 'Your Name');
   ```
5. You can now log into `admin-dashboard/index.html` with that email/password.

## Step 3 — Create a login for each client

Do this once per client, at onboarding time:

1. Supabase Dashboard → Authentication → Users → **Add User** with the
   client's email (or let them set their own password via a Supabase invite
   email — nicer for a real launch, but manual creation is fine for MVP).
2. Copy their UID.
3. SQL Editor → run:
   ```sql
   insert into client_users (client_id, auth_uid, email)
   values ('<the-client-id-from-the-clients-table>', '<their-auth-uid>', 'owner@theirbusiness.ae');
   ```
   (You'll have the `client_id` already from adding them via the Admin
   Dashboard — see `docs/ADD_CLIENT_GUIDE.md`.)
4. Give the client their login email + a temporary password (ask them to
   change it on first login via Supabase's password-reset flow).
5. They can now log into `client-dashboard/index.html` and will only ever
   see their own leads, appointments, billing, services, and FAQs.

## Step 4 — Point the dashboards at your real Supabase project

Edit both config files with your project's public values (Supabase
Dashboard → Settings → API):

`admin-dashboard/config.js` and `client-dashboard/config.js`:
```js
window.YESAI_CONFIG = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key'
};
```

**Important:** this is the **anon/public** key, not the `service_role` key.
The anon key is safe to ship in browser code — RLS is what actually
protects the data, not the key itself. Never put the `service_role` key
(used only in `backend/.env`) into either config.js file.

Once these are filled in, both dashboards automatically switch from demo
mode to real Supabase Auth — no other code changes needed.

## Step 5 — Test it

1. Open `admin-dashboard/index.html`, log in as yourself → you should see
   every client.
2. Open `client-dashboard/index.html` in a different browser/incognito
   window, log in as a client → you should see only that client's data,
   and the Bot Settings tab should let them edit their own services/FAQs.
3. Try logging into the client dashboard with an account that's *not* in
   `client_users` — you should get "This account is not linked to a
   client" and be signed back out. That's the RLS + mapping-table check
   working correctly.

## Notes on the "Cancel Subscription" button

The client dashboard's cancel button calls `POST /api/billing/cancel` on
your backend (see `backend/routes/stripeRoutes.js`) rather than writing to
the `subscriptions` table directly from the browser. That route verifies
the caller's Supabase session token server-side, confirms which client they
belong to via `client_users`, and only then tells Stripe to cancel at the
end of the billing period. This keeps Stripe as the single source of truth
for billing state instead of trusting the browser.

## Notes on the "Login as Client" button (Admin Dashboard)

In demo mode this just opens the Client Dashboard pre-selected to that
client — nothing to configure. In real Supabase mode, true impersonation
needs a backend endpoint (e.g. `POST /api/admin/impersonate`) that uses the
**service role key** to mint a one-time session or magic link for that
client's `auth_uid`, then redirects the admin's browser to `/client` with
it. This must happen server-side — the service role key should never reach
the browser. This endpoint isn't built yet; the button currently explains
this and stops short of it in real mode.
