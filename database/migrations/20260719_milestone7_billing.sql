-- =============================================================
-- YES.AI — Milestone 7A: Billing, Subscriptions & Usage Metering
-- Additive migration. Safe to re-run (every statement is guarded).
-- Does NOT touch: clients, bot_config, leads, conversations, messages,
-- or anything owned by the AI Intelligence Engine (Milestone 6A) or
-- WhatsApp Engine. Only extends `subscriptions` + adds new tables.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Extend the existing `subscriptions` table (additive columns only)
-- ---------------------------------------------------------------
alter table subscriptions add column if not exists billing_cycle            text default 'monthly';        -- 'monthly' | 'annual'
alter table subscriptions add column if not exists trial_start              timestamptz;
alter table subscriptions add column if not exists conversation_limit       int default 300;               -- included conversations for the current plan
alter table subscriptions add column if not exists conversations_used       int default 0;                 -- resets monthly (see usage_reset_at)
alter table subscriptions add column if not exists overage_conversations    int default 0;
alter table subscriptions add column if not exists overage_rate            numeric default 0.40;           -- AED per conversation over the limit
alter table subscriptions add column if not exists usage_reset_at          timestamptz default (date_trunc('month', now()) + interval '1 month');
alter table subscriptions add column if not exists payment_provider        text default 'stripe';          -- 'stripe' | 'paytabs' | 'apple_pay' | 'google_pay'

-- `plan` already exists as text on this table (previously 'lite'|'growth'|'pro').
-- Milestone 7A renames the entry tier to 'starter' going forward. Existing
-- 'lite' rows are NOT rewritten by this migration (no silent data mutation
-- on someone else's live rows) — backend/config/planConfig.js treats
-- 'lite' as a permanent alias for 'starter', so nothing currently on the
-- old plan name breaks. New signups/upgrades use 'starter' from here on.

-- ---------------------------------------------------------------
-- 2. Payment history — one row per successful or failed charge.
--    (`invoices` already exists in schema.sql for downloadable invoice
--    records; this is the underlying payment ledger it's generated from.)
-- ---------------------------------------------------------------
create table if not exists payment_history (
  id                  uuid primary key default uuid_generate_v4(),
  client_id           uuid references clients(id) on delete cascade,
  provider            text not null default 'stripe',   -- 'stripe' | 'paytabs' | 'apple_pay' | 'google_pay'
  provider_charge_id  text,
  amount_aed          numeric not null,
  status              text not null,                    -- 'succeeded' | 'failed' | 'refunded'
  description         text,
  created_at          timestamptz default now()
);

-- ---------------------------------------------------------------
-- 3. Conversation usage log — one row per billing-relevant AI reply.
--    Written by backend/services/usageService.js. Nothing in this
--    migration wires it into the AI engine itself — see
--    MILESTONE_7_FILES_CHANGED.md for the single integration point.
-- ---------------------------------------------------------------
create table if not exists conversation_usage_log (
  id           uuid primary key default uuid_generate_v4(),
  client_id    uuid references clients(id) on delete cascade,
  lead_id      uuid references leads(id) on delete set null,
  is_overage   boolean default false,
  created_at   timestamptz default now()
);

-- ---------------------------------------------------------------
-- 4. Central, admin-editable plan configuration — the single source of
--    truth backend/config/planConfig.js reads from. Lets an admin change
--    conversation limits, overage rates, trial length, and prices
--    without touching source code (Milestone 7A requirement #9).
-- ---------------------------------------------------------------
create table if not exists plan_config (
  plan_key              text primary key,             -- 'starter' | 'growth' | 'pro'
  label                 text not null,
  monthly_price_aed     numeric not null,
  conversation_limit    int not null,
  overage_rate_aed      numeric not null,
  trial_days            int not null default 14,
  features              jsonb not null default '[]',  -- ordered list of feature keys this plan unlocks
  is_active             boolean default true,
  updated_at            timestamptz default now()
);

insert into plan_config (plan_key, label, monthly_price_aed, conversation_limit, overage_rate_aed, trial_days, features)
values
  ('starter', 'Starter', 199, 300, 0.40, 14, '[
    "ai_whatsapp_assistant","instant_replies","lead_capture","ai_lead_qualification",
    "hot_lead_detection","hot_lead_owner_alert","appointment_request_detection",
    "knowledge_base","customer_database","conversation_history","human_takeover",
    "multi_user_dashboard_3","setup_wizard","basic_analytics","email_support"
  ]'),
  ('growth', 'Growth', 349, 1000, 0.40, 14, '[
    "ai_whatsapp_assistant","instant_replies","lead_capture","ai_lead_qualification",
    "hot_lead_detection","hot_lead_owner_alert","appointment_request_detection",
    "knowledge_base","customer_database","conversation_history","human_takeover",
    "multi_user_dashboard_3","setup_wizard","basic_analytics","email_support",
    "ai_appointment_booking","appointment_auto_confirm","appointment_owner_alert",
    "google_calendar","google_sheets","crm_export","ai_conversation_memory",
    "advanced_lead_qualification","ai_lead_scoring","ai_followup_suggestions",
    "advanced_analytics","team_roles","priority_support"
  ]'),
  ('pro', 'Pro', 599, 1800, 0.35, 14, '[
    "ai_whatsapp_assistant","instant_replies","lead_capture","ai_lead_qualification",
    "hot_lead_detection","hot_lead_owner_alert","appointment_request_detection",
    "knowledge_base","customer_database","conversation_history","human_takeover",
    "unlimited_team_members","setup_wizard","basic_analytics","email_support",
    "ai_appointment_booking","appointment_auto_confirm","appointment_owner_alert",
    "google_calendar","google_sheets","crm_export","ai_conversation_memory",
    "advanced_lead_qualification","ai_lead_scoring","ai_followup_suggestions",
    "advanced_analytics","team_roles","priority_support",
    "ai_sales_assistant","ai_buying_intent","ai_sentiment_analysis","ai_purchase_readiness",
    "ai_auto_followups","ai_appointment_scheduling","ai_conversation_summaries",
    "ai_sales_recommendations","ai_product_recommendations","ai_customer_journey",
    "ai_missed_opportunity","ai_performance_insights","alert_call_request",
    "alert_high_value_lead","alert_human_takeover_request","daily_sales_summary",
    "weekly_performance_report","advanced_knowledge_base","custom_ai_instructions",
    "industry_templates","revenue_dashboard","customer_analytics","advanced_reports",
    "api_ready","custom_integrations","white_label_ready","premium_onboarding",
    "vip_support","early_access"
  ]')
on conflict (plan_key) do nothing;

alter table plan_config enable row level security;
drop policy if exists "admin manages plan_config" on plan_config;
create policy "admin manages plan_config" on plan_config
  for all using (is_admin()) with check (is_admin());
drop policy if exists "everyone reads active plans" on plan_config;
create policy "everyone reads active plans" on plan_config
  for select using (is_active = true);

-- ---------------------------------------------------------------
-- 5. RLS for the two new tables — same admin/client pattern as every
--    other table (uses the existing is_admin() / my_client_id() helpers
--    from the Milestone 3 auth migration; not redefined here).
-- ---------------------------------------------------------------
alter table payment_history        enable row level security;
alter table conversation_usage_log enable row level security;

drop policy if exists "admin full access to payment_history" on payment_history;
create policy "admin full access to payment_history" on payment_history
  for all using (is_admin()) with check (is_admin());
drop policy if exists "client reads own payment_history" on payment_history;
create policy "client reads own payment_history" on payment_history
  for select using (client_id = my_client_id());

drop policy if exists "admin full access to usage_log" on conversation_usage_log;
create policy "admin full access to usage_log" on conversation_usage_log
  for all using (is_admin()) with check (is_admin());
drop policy if exists "client reads own usage_log" on conversation_usage_log;
create policy "client reads own usage_log" on conversation_usage_log
  for select using (client_id = my_client_id());

-- ---------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------
create index if not exists idx_payment_history_client on payment_history(client_id);
create index if not exists idx_usage_log_client on conversation_usage_log(client_id, created_at);
