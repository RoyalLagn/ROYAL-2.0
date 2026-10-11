-- Migration: 20261009170000_realtime_and_fk_wiring.sql
-- Fix foreign key relationships to profiles for PostgREST joins,
-- Enable Supabase Realtime publication on payment & referral queues,
-- and grant team permission access on RLS select policies.

begin;

-- ============================================================================
-- 1. Foreign Key Constraints to public.profiles for PostgREST Relationships
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_payment_destinations_customer_profile_fkey'
  ) then
    alter table public.customer_payment_destinations
      add constraint customer_payment_destinations_customer_profile_fkey
      foreign key (customer_id) references public.profiles(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'referral_payout_requests_customer_profile_fkey'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_customer_profile_fkey
      foreign key (customer_id) references public.profiles(id) on delete cascade;
  end if;
end;
$$;

-- ============================================================================
-- 2. Enhanced RLS Select Policies for Team Permission Groups
-- ============================================================================

drop policy if exists "customer_payment_destinations_select" on public.customer_payment_destinations;
create policy "customer_payment_destinations_select"
on public.customer_payment_destinations
for select to authenticated
using (
  customer_id = auth.uid()
  or private.is_admin()
  or private.is_admin_or_service()
  or private.has_team_permission(auth.uid(), 'payment_verifier')
  or private.has_team_permission(auth.uid(), 'finance_operator')
  or private.has_team_permission(auth.uid(), 'team_manager')
  or private.has_team_permission(auth.uid(), 'admin_owner')
);

drop policy if exists "referral_payout_requests_select" on public.referral_payout_requests;
create policy "referral_payout_requests_select"
on public.referral_payout_requests
for select to authenticated
using (
  customer_id = auth.uid()
  or private.is_admin()
  or private.is_admin_or_service()
  or private.has_team_permission(auth.uid(), 'finance_operator')
  or private.has_team_permission(auth.uid(), 'team_manager')
  or private.has_team_permission(auth.uid(), 'admin_owner')
);

-- ============================================================================
-- 3. Enable Supabase Realtime Replication & Publication
-- ============================================================================

do $$
declare
  t text;
  tables_to_add text[] := array[
    'customer_payment_destinations',
    'referral_payout_requests',
    'referral_commissions',
    'referral_profiles',
    'team_activity_log',
    'team_memberships'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array tables_to_add loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

alter table public.customer_payment_destinations replica identity full;
alter table public.referral_payout_requests replica identity full;
alter table public.referral_commissions replica identity full;
alter table public.referral_profiles replica identity full;
alter table public.team_activity_log replica identity full;
alter table public.team_memberships replica identity full;

commit;
