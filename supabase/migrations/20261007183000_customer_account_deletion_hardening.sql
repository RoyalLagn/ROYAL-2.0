-- Migration: 20261007183000_customer_account_deletion_hardening.sql
-- Hardens customer account deletion by anonymizing customer PII in vendor_bookings,
-- and ensures trig_auto_provision_referral_profile only acts on active accounts.

begin;

-- 1. Updated prepare_customer_account_deletion() with booking PII anonymization
create or replace function public.prepare_customer_account_deletion()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = current_user_id and role = 'public_user'
  ) then
    raise exception 'Only customer accounts can use self-service deletion';
  end if;

  if exists (select 1 from public.vendors where profile_id = current_user_id) then
    raise exception 'Vendor accounts require an administrator-reviewed deletion request';
  end if;

  -- Anonymize clip views
  update public.clip_views
  set session_hash = coalesce(
    nullif(btrim(session_hash), ''),
    'deleted:' || gen_random_uuid()::text
  )
  where viewer_id = current_user_id;

  -- Anonymize vendor enquiries
  update public.vendor_enquiries
  set customer_id = null,
      guest_session_id = coalesce(guest_session_id, gen_random_uuid()),
      customer_name = 'Deleted customer',
      customer_email = null,
      customer_phone = null,
      message = 'Customer account deleted.',
      event_date = null,
      event_type = null,
      updated_at = now()
  where customer_id = current_user_id;

  -- Anonymize vendor bookings while preserving accounting, tickets, and financial totals
  update public.vendor_bookings
  set customer_id = null,
      customer_name = 'Deleted customer',
      customer_email = null,
      customer_phone = '0000000000',
      updated_at = now()
  where customer_id = current_user_id;
end;
$$;

revoke all on function public.prepare_customer_account_deletion() from public, anon;
grant execute on function public.prepare_customer_account_deletion() to authenticated;

comment on function public.prepare_customer_account_deletion() is
  'Anonymizes retained customer enquiries, bookings, and clip-view analytics before the verified customer auth user is permanently deleted.';

-- 2. Update referral profile trigger to respect is_active
create or replace function public.trig_auto_provision_referral_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'public_user' and coalesce(new.is_active, true) = true then
    perform public.ensure_customer_referral_profile(new.id);
  end if;
  return new;
end;
$$;

commit;
