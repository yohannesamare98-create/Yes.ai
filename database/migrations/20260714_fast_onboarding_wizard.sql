-- YES.AI Milestone 2: Fast WhatsApp-first onboarding wizard
-- Additive migration. Does not delete or rename existing data.

alter table public.clients add column if not exists owner_name text;
alter table public.clients add column if not exists country text default 'United Arab Emirates';
alter table public.clients add column if not exists city text;
alter table public.clients add column if not exists timezone text default 'Asia/Dubai';
alter table public.clients add column if not exists has_website boolean default false;
alter table public.clients add column if not exists website_url text;
alter table public.clients add column if not exists business_hours_json jsonb default '{}'::jsonb;
alter table public.clients add column if not exists onboarding_step integer default 1;
alter table public.clients add column if not exists onboarding_completed_at timestamptz;

-- Keep onboarding step within the current seven-step flow.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_onboarding_step_range') then
    alter table public.clients add constraint clients_onboarding_step_range check (onboarding_step between 1 and 7);
  end if;
end $$;

create index if not exists idx_clients_setup_status on public.clients(setup_status);
