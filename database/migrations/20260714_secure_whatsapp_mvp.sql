-- YES.AI Milestone 1: additive production-safety migration
-- Safe to run against the existing schema. No tables or columns are dropped.

begin;

-- Required by botEngine upsert(onConflict: 'customer_whatsapp,client_id').
create unique index if not exists uq_leads_client_customer_whatsapp
  on public.leads (client_id, customer_whatsapp);

-- Store Meta's message id so webhook retries can be ignored.
alter table public.messages
  add column if not exists external_message_id text;

create unique index if not exists uq_messages_client_external_message
  on public.messages (client_id, external_message_id)
  where external_message_id is not null;

-- Helpful lookup for recent client conversations.
create index if not exists idx_messages_client_created_at
  on public.messages (client_id, created_at desc);

commit;
