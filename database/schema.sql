-- =============================================================
-- YES.AI — Multi-Tenant WhatsApp Sales Assistant Platform
-- Database schema for Supabase (Postgres)
-- =============================================================
-- Design principle: ONE bot engine, MANY clients.
-- Every table below (except admin_users) has a client_id column.
-- The bot logic reads a client's row from `clients` + `bot_config`
-- at runtime and behaves accordingly — you never duplicate code
-- per client, only add a row.
-- =============================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- 1. CLIENTS  (one row per business you sell YES.AI to)
-- ---------------------------------------------------------------
create table clients (
  id                  uuid primary key default uuid_generate_v4(),
  business_name       text not null,
  industry            text,                 -- Salon / Clinic / Real Estate / Car Dealer / Restaurant / Gym / Other
  whatsapp_number     text not null unique, -- the CLIENT's business WhatsApp number, in E.164 format
  business_phone      text,                  -- general contact number (may differ from the WhatsApp bot number)
  logo_url            text,
  contact_email       text,
  location            text,
  opening_hours       text,                  -- free text, e.g. "Sun-Thu 9am-9pm, Fri-Sat 10am-10pm"
  language            text default 'en',     -- 'en' | 'ar' | 'both'
  plan                text default 'lite',   -- 'lite' | 'growth' | 'pro'
  bot_status          text default 'off',    -- 'on' | 'off' | 'paused' (paused = auto-paused after failed payment)
  notification_number text,                  -- WhatsApp number to send hot-lead alerts to (owner's personal number)
  notification_email  text,
  google_sheet_url    text,
  google_calendar_id  text,
  whatsapp_connected  boolean default false, -- set true once Step 5 of the setup wizard connects WhatsApp
  calendar_connected  boolean default false, -- set true once Google Calendar is connected (or left false if skipped)
  sheets_connected    boolean default false, -- set true once Google Sheets is connected (or left false if skipped)
  -- setup_status drives the Admin Dashboard status badge:
  --   'needs_setup' -> client row exists but the wizard hasn't been started
  --   'in_progress' -> wizard started, not yet launched
  --   'trial'       -> wizard completed, bot launched, subscription is trialing
  --   'live'        -> subscription is active (post-trial, paying) — flipped automatically by the Stripe webhook
  setup_status        text default 'needs_setup',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ---------------------------------------------------------------
-- 2. BOT_CONFIG  (the "brain settings" — one row per client)
-- ---------------------------------------------------------------
create table bot_config (
  id                      uuid primary key default uuid_generate_v4(),
  client_id               uuid references clients(id) on delete cascade unique,
  ai_instructions         text,     -- system prompt / tone instructions fed to OpenAI for this client
  business_description    text,     -- free text from Step 3 of the wizard, folded into the AI's system prompt
  tone_of_voice           text default 'Friendly', -- 'Friendly' | 'Professional' | 'Casual' | 'Luxury'
  services                jsonb,    -- [{ "name": "Haircut", "price": 80 }, { "name": "Color", "price": 220 }]
  offers                  jsonb default '[]', -- [{ "name": "Cut + Color Package", "description": "...", "price": 250 }]
  faqs                    jsonb,    -- [{ "question": "Do you take walk-ins?", "answer": "Yes, ..." }]
  qualification_questions jsonb,    -- ["What service do you need?", "What date works for you?", "What time?"]
  hot_lead_rules          jsonb,    -- e.g. { "min_budget": 500, "keywords": ["urgent","today","cash"] }
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ---------------------------------------------------------------
-- 3. LEADS  (every WhatsApp conversation that comes in)
-- ---------------------------------------------------------------
create table leads (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete cascade,
  channel           text default 'whatsapp', -- 'whatsapp' | 'website_chat' | 'voice' | 'instagram' | 'facebook' | 'telegram'
  customer_name     text,
  customer_whatsapp text not null,  -- kept as the primary customer identifier for now; for non-WhatsApp
                                     -- channels this can hold the platform-specific user ID (e.g. Instagram user ID)
  message_summary   text,             -- short AI-generated summary of what the customer wants
  answers           jsonb,            -- answers to the qualification questions
  is_hot_lead       boolean default false,
  status            text default 'new', -- 'new' | 'contacted' | 'booked' | 'closed' | 'lost'
  notes             text,
  created_at        timestamptz default now()
);

-- ---------------------------------------------------------------
-- 4. APPOINTMENTS
-- ---------------------------------------------------------------
create table appointments (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete cascade,
  lead_id           uuid references leads(id) on delete set null,
  service           text,
  appointment_time  timestamptz,
  calendar_event_id text,   -- Google Calendar event ID, for updates/cancellations
  status            text default 'confirmed', -- 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  created_at        timestamptz default now()
);

-- ---------------------------------------------------------------
-- 5. MESSAGES  (raw conversation log, for support/debugging + analytics)
-- ---------------------------------------------------------------
create table messages (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid references clients(id) on delete cascade,
  lead_id     uuid references leads(id) on delete set null,
  channel     text default 'whatsapp', -- matches leads.channel
  direction   text,  -- 'inbound' | 'outbound'
  body        text,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------
-- 6. SUBSCRIPTIONS  (Stripe billing state per client)
-- ---------------------------------------------------------------
create table subscriptions (
  id                        uuid primary key default uuid_generate_v4(),
  client_id                 uuid references clients(id) on delete cascade unique,
  stripe_customer_id        text,
  stripe_subscription_id    text,
  plan                      text default 'lite',        -- 'lite' | 'growth' | 'pro'
  status                    text default 'trialing',     -- 'trialing' | 'active' | 'past_due' | 'cancelled' | 'failed'
  setup_fee_paid            boolean default false,
  trial_end_date            timestamptz,
  next_billing_date         timestamptz,
  cancel_at_period_end      boolean default false,
  failed_payment_count      int default 0,
  discount_code             text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- ---------------------------------------------------------------
-- 7. INVOICES  (payment history, for client "download invoice")
-- ---------------------------------------------------------------
create table invoices (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete cascade,
  stripe_invoice_id text,
  amount_aed        numeric,
  status            text,  -- 'paid' | 'open' | 'failed'
  invoice_pdf_url   text,
  issued_at         timestamptz default now()
);

-- ---------------------------------------------------------------
-- 8. ADMIN_USERS  (you and your team — the platform owner side)
-- ---------------------------------------------------------------
create table admin_users (
  id          uuid primary key default uuid_generate_v4(),
  auth_uid    uuid unique, -- maps to Supabase auth.users.id, set after the admin's login is created
  email       text unique not null,
  full_name   text,
  role        text default 'admin', -- 'admin' | 'support'
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------
-- 9. CLIENT_USERS  (each client's own dashboard login — Supabase Auth
--    handles the actual auth; this table links an auth.users row to a client)
-- ---------------------------------------------------------------
create table client_users (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid references clients(id) on delete cascade,
  auth_uid    uuid,  -- maps to Supabase auth.users.id
  email       text,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------
-- Indexes for common queries
-- ---------------------------------------------------------------
create index idx_leads_client_id on leads(client_id);
create index idx_leads_hot on leads(client_id, is_hot_lead);
create index idx_appointments_client_id on appointments(client_id);
create index idx_messages_client_id on messages(client_id, lead_id);
create index idx_subscriptions_status on subscriptions(status);

-- =================================================================
-- AUTH HELPER FUNCTIONS
-- These are SECURITY DEFINER so they can read admin_users/client_users
-- even though those tables themselves have RLS enabled — this avoids
-- infinite-recursion issues and keeps every other policy a one-liner.
-- =================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admin_users where auth_uid = auth.uid()
  );
$$;

create or replace function public.my_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from client_users where auth_uid = auth.uid() limit 1;
$$;

-- =================================================================
-- ROW LEVEL SECURITY
-- Rule of thumb applied to every table below:
--   - Admins (is_admin() = true) can do everything, on every row.
--   - A logged-in client can only read/write rows where client_id
--     matches their own (my_client_id()).
--   - Anonymous / unauthenticated requests see nothing.
-- =================================================================

alter table clients        enable row level security;
alter table bot_config      enable row level security;
alter table leads           enable row level security;
alter table appointments    enable row level security;
alter table messages        enable row level security;
alter table subscriptions   enable row level security;
alter table invoices        enable row level security;
alter table admin_users     enable row level security;
alter table client_users    enable row level security;

-- ---- clients ----
create policy "admin full access to clients" on clients
  for all using (is_admin()) with check (is_admin());
create policy "client reads own row" on clients
  for select using (id = my_client_id());
create policy "client updates own row" on clients
  for update using (id = my_client_id()) with check (id = my_client_id());

-- ---- bot_config (services, FAQs, questions, hot-lead rules, AI instructions) ----
create policy "admin full access to bot_config" on bot_config
  for all using (is_admin()) with check (is_admin());
create policy "client reads own bot_config" on bot_config
  for select using (client_id = my_client_id());
create policy "client updates own bot_config" on bot_config
  for update using (client_id = my_client_id()) with check (client_id = my_client_id());

-- ---- leads ----
create policy "admin full access to leads" on leads
  for all using (is_admin()) with check (is_admin());
create policy "client reads own leads" on leads
  for select using (client_id = my_client_id());
create policy "client updates own leads" on leads
  for update using (client_id = my_client_id()) with check (client_id = my_client_id());

-- ---- appointments ----
create policy "admin full access to appointments" on appointments
  for all using (is_admin()) with check (is_admin());
create policy "client reads own appointments" on appointments
  for select using (client_id = my_client_id());

-- ---- messages ----
create policy "admin full access to messages" on messages
  for all using (is_admin()) with check (is_admin());
create policy "client reads own messages" on messages
  for select using (client_id = my_client_id());

-- ---- subscriptions (billing status — read-only for clients, admin manages) ----
create policy "admin full access to subscriptions" on subscriptions
  for all using (is_admin()) with check (is_admin());
create policy "client reads own subscription" on subscriptions
  for select using (client_id = my_client_id());

-- ---- invoices (read-only for clients) ----
create policy "admin full access to invoices" on invoices
  for all using (is_admin()) with check (is_admin());
create policy "client reads own invoices" on invoices
  for select using (client_id = my_client_id());

-- ---- admin_users (an admin can check their own membership row; only admins manage the list) ----
create policy "self read admin_users" on admin_users
  for select using (auth_uid = auth.uid());
create policy "admin manages admin_users" on admin_users
  for all using (is_admin()) with check (is_admin());

-- ---- client_users (a client can look up their own mapping row; admin manages all) ----
create policy "self read client_users" on client_users
  for select using (auth_uid = auth.uid());
create policy "admin manages client_users" on client_users
  for all using (is_admin()) with check (is_admin());

-- =================================================================
-- ONE-TIME SETUP AFTER RUNNING THIS SCHEMA
-- =================================================================
-- 1. In Supabase Dashboard → Authentication → Users, create a login
--    (email + password) for yourself (the admin) and for each client.
-- 2. Copy the resulting auth.users.id (the "UID" column) for each.
-- 3. Link the admin:
--      insert into admin_users (auth_uid, email, full_name)
--      values ('<admin-auth-uid>', 'you@example.com', 'Your Name');
-- 4. Link each client login:
--      insert into client_users (client_id, auth_uid, email)
--      values ('<client-id-from-clients-table>', '<client-auth-uid>', 'owner@theirbusiness.ae');
-- See docs/AUTH_SETUP.md for the full walkthrough.
