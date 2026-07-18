-- YES.AI Milestone 6B — Production WhatsApp Cloud API Messaging
-- Adds: stable phone_number_id client lookup, human-takeover mode,
-- unread/last-message tracking for the Conversations UI, and a way to
-- tell an AI reply apart from a human agent's manual reply in the
-- message log. Run once in the Supabase SQL Editor. Idempotent —
-- every change uses IF NOT EXISTS, safe to re-run.

begin;

-- ---------------------------------------------------------------
-- clients — stable Meta phone_number_id lookup
-- ---------------------------------------------------------------
alter table clients add column if not exists whatsapp_phone_number_id text;
  -- Meta's stable numeric ID for the receiving WhatsApp number
  -- (change.metadata.phone_number_id in the webhook payload). Preferred
  -- over whatsapp_number/display_phone_number for identifying which
  -- client owns an inbound message, since display_phone_number's
  -- formatting (spaces, +, leading zeros) is not guaranteed stable while
  -- phone_number_id never changes for a given number. whatsapp_number is
  -- kept as-is and used as a fallback for setups that haven't set this
  -- new field yet.

create unique index if not exists idx_clients_whatsapp_phone_number_id
  on clients(whatsapp_phone_number_id)
  where whatsapp_phone_number_id is not null;

-- ---------------------------------------------------------------
-- leads — human takeover mode + conversation-list metadata
-- ---------------------------------------------------------------
alter table leads add column if not exists mode text default 'ai';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_mode_check') then
    alter table leads add constraint leads_mode_check check (mode in ('ai','human'));
  end if;
end $$;
  -- 'ai' (default): the intelligence engine replies automatically.
  -- 'human': AI is paused for this conversation; only manual replies
  -- sent from the Conversations tab go out, until returned to AI.

alter table leads add column if not exists unread_count int default 0;
  -- Incremented on every inbound customer message, regardless of mode.
  -- Reset to 0 via POST /api/clients/:id/conversations/:leadId/read.

alter table leads add column if not exists last_message_at timestamptz;
alter table leads add column if not exists last_message_preview text;
  -- Denormalized so the Conversations list can sort/render without a
  -- join into `messages` per row.

create index if not exists idx_leads_last_message_at
  on leads(client_id, last_message_at desc nulls last);

-- ---------------------------------------------------------------
-- messages — who actually sent an outbound message
-- ---------------------------------------------------------------
alter table messages add column if not exists sent_by text;
  -- For direction='outbound' rows: 'ai' or 'human'. Null for inbound
  -- (customer) messages. Lets the Conversations history visually
  -- distinguish an AI reply from a human agent's manual reply.

commit;
