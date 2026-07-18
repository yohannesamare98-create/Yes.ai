-- YES.AI Milestone 6A — OpenAI Intelligence Engine
-- Adds structured lead-intelligence fields and a few missing bot_config
-- fields (policies, fallback message, human-handoff keywords) so the
-- intelligence layer has somewhere to read/write everything the spec
-- asks for. Run once in the Supabase SQL Editor.
--
-- Safe to re-run: every change uses IF NOT EXISTS.

begin;

-- ---------------------------------------------------------------
-- bot_config — business knowledge the AI is allowed to use
-- ---------------------------------------------------------------
alter table bot_config
  add column if not exists policies text;
  -- Free text: cancellation policy, payment terms, deposit rules, etc.
  -- Folded into the system prompt alongside faqs/services so the AI can
  -- answer policy questions without inventing anything.

alter table bot_config
  add column if not exists fallback_message text;
  -- Shown to the customer when the AI can't answer confidently or the
  -- OpenAI call fails. Falls back to a sane built-in default if blank.

alter table bot_config
  add column if not exists human_handoff_keywords jsonb default '[]'::jsonb;
  -- e.g. ["refund","complaint","legal","emergency","cancel my subscription"]
  -- A rule-based safety net: if any of these appear in the customer's
  -- message, human_handoff is forced true regardless of what the model
  -- itself decides.

-- ---------------------------------------------------------------
-- leads — structured intelligence output, persisted per conversation
-- ---------------------------------------------------------------
alter table leads add column if not exists intent text;
alter table leads add column if not exists service_or_product text;

alter table leads add column if not exists lead_temperature text default 'cold';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_lead_temperature_check'
  ) then
    alter table leads
      add constraint leads_lead_temperature_check
      check (lead_temperature in ('cold','warm','hot'));
  end if;
end $$;

alter table leads add column if not exists qualification_score int default 0;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_qualification_score_check'
  ) then
    alter table leads
      add constraint leads_qualification_score_check
      check (qualification_score between 0 and 100);
  end if;
end $$;

alter table leads add column if not exists collected_customer_data jsonb default '{}'::jsonb;
  -- { service_needed, budget, urgency, location, preferred_date, buying_readiness }
  -- Merged turn-over-turn — a new message only overwrites the fields it
  -- actually provides new information for, so the lead's profile builds
  -- up across the conversation instead of resetting each message.

alter table leads add column if not exists appointment_requested boolean default false;
alter table leads add column if not exists human_handoff boolean default false;
alter table leads add column if not exists conversation_summary text;
  -- Rolling AI-maintained summary of the whole conversation so far, used
  -- to keep the prompt small on long conversations instead of replaying
  -- every message every time.

-- ---------------------------------------------------------------
-- messages — store the structured AI output alongside the raw log
-- ---------------------------------------------------------------
alter table messages add column if not exists metadata jsonb;
  -- On outbound (AI) messages: the full structured JSON returned by the
  -- intelligence engine for that turn (intent, qualification_score, etc.)
  -- — useful for debugging and for the Test AI page's response inspector.

-- ---------------------------------------------------------------
-- Index for admin/client dashboards to filter "needs a human" leads
-- ---------------------------------------------------------------
create index if not exists idx_leads_human_handoff
  on leads(client_id, human_handoff) where human_handoff = true;

create index if not exists idx_leads_temperature
  on leads(client_id, lead_temperature);

commit;
