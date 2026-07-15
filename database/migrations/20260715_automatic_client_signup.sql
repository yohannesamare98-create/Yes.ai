-- YES.AI Milestone 3
-- Automatic client signup, 14-day trial, and onboarding launch.
-- Run once in Supabase SQL Editor.

begin;

-- One login should map to only one client account.
create unique index if not exists idx_client_users_auth_uid_unique
  on public.client_users(auth_uid)
  where auth_uid is not null;

-- Provision the authenticated user safely.
create or replace function public.provision_yesai_client()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_client_id uuid;
  v_existing_client_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select client_id
    into v_existing_client_id
  from public.client_users
  where auth_uid = v_user_id
  limit 1;

  if v_existing_client_id is not null then
    return jsonb_build_object(
      'client_id', v_existing_client_id,
      'created', false
    );
  end if;

  select email
    into v_email
  from auth.users
  where id = v_user_id;

  insert into public.clients (
    business_name,
    whatsapp_number,
    contact_email,
    notification_email,
    plan,
    bot_status,
    setup_status,
    language
  )
  values (
    'New YES.AI Business',
    'pending_' || v_user_id::text,
    v_email,
    v_email,
    'lite',
    'off',
    'needs_setup',
    'en'
  )
  returning id into v_client_id;

  insert into public.client_users (
    client_id,
    auth_uid,
    email
  )
  values (
    v_client_id,
    v_user_id,
    v_email
  );

  insert into public.bot_config (
    client_id,
    tone_of_voice,
    services,
    offers,
    faqs,
    qualification_questions,
    hot_lead_rules
  )
  values (
    v_client_id,
    'Friendly',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[
      "What service or product do you need?",
      "When would you like to buy or book?",
      "What is your budget range?"
    ]'::jsonb,
    '{"keywords":["urgent","today","ready to buy","book now","quotation"]}'::jsonb
  )
  on conflict (client_id) do nothing;

  insert into public.subscriptions (
    client_id,
    plan,
    status,
    trial_end_date,
    next_billing_date
  )
  values (
    v_client_id,
    'lite',
    'trialing',
    now() + interval '14 days',
    now() + interval '14 days'
  )
  on conflict (client_id) do nothing;

  return jsonb_build_object(
    'client_id', v_client_id,
    'created', true,
    'trial_end_date', now() + interval '14 days'
  );
end;
$$;

revoke all on function public.provision_yesai_client() from public;
grant execute on function public.provision_yesai_client() to authenticated;

commit;
