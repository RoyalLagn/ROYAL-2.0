begin;

-- Additive upgrade to the subscription platform created in
-- 20260801120000_create_subscription_platform.sql. Nothing here drops a
-- table, deletes a row, or changes the meaning of an existing column; it
-- only adds the plan lifecycle status and Monthly/Yearly billing options
-- the admin console and vendor checkout need.

-- ---------------------------------------------------------------------
-- Plan lifecycle status (active / coming_soon / hidden / archived)
-- ---------------------------------------------------------------------

alter table public.subscription_plans
  add column if not exists status text,
  add column if not exists is_permanent boolean not null default false;

update public.subscription_plans
set status = case
  when archived_at is not null then 'archived'
  when is_active then 'active'
  else 'hidden'
end
where status is null;

alter table public.subscription_plans
  alter column status set default 'active',
  alter column status set not null;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_status_check;
alter table public.subscription_plans
  add constraint subscription_plans_status_check
  check (status in ('active', 'coming_soon', 'hidden', 'archived'));

-- Keep the legacy is_active/archived_at columns in sync with status so any
-- code path that still reads them (RLS policies, other queries) keeps
-- working unmodified during rollout.
create or replace function private.subscription_plan_sync_legacy_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_active := (new.status in ('active', 'coming_soon'));
  if new.status = 'archived' and new.archived_at is null then
    new.archived_at := now();
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_plans_sync_legacy_status on public.subscription_plans;
create trigger subscription_plans_sync_legacy_status
before insert or update of status on public.subscription_plans
for each row execute function private.subscription_plan_sync_legacy_status();

-- subscription_plans_public_read (defined in the base migration) already
-- gates on is_active/archived_at, which the trigger above keeps correct for
-- 'active' and 'coming_soon'. Vendors must see 'coming_soon' plans (as a
-- disabled/"Coming soon" card) but not 'hidden' ones, which the existing
-- policy already achieves since only 'active'/'coming_soon' set is_active.

create index if not exists subscription_plans_status_idx
  on public.subscription_plans(status);

-- ---------------------------------------------------------------------
-- Monthly / Yearly billing options
-- ---------------------------------------------------------------------

create table if not exists public.subscription_plan_billing_options (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  interval_count integer not null default 1 check (interval_count > 0),
  price numeric(12, 2) not null default 0,
  discounted_price numeric(12, 2),
  currency text not null default 'INR',
  trial_enabled boolean not null default false,
  trial_days integer not null default 0 check (trial_days >= 0),
  grace_period_days integer not null default 0 check (grace_period_days >= 0),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plan_billing_options_price_nonnegative check (price >= 0),
  constraint subscription_plan_billing_options_discount_nonnegative check (
    discounted_price is null or discounted_price >= 0
  ),
  constraint subscription_plan_billing_options_discount_not_above_price check (
    discounted_price is null or discounted_price <= price
  ),
  constraint subscription_plan_billing_options_unique_interval unique (plan_id, billing_interval)
);

create index if not exists subscription_plan_billing_options_plan_idx
  on public.subscription_plan_billing_options(plan_id, is_active, display_order);

drop trigger if exists subscription_plan_billing_options_set_updated_at on public.subscription_plan_billing_options;
create trigger subscription_plan_billing_options_set_updated_at
before update on public.subscription_plan_billing_options
for each row execute function private.subscription_set_updated_at();

-- Backfill one billing option per existing plan from its current legacy
-- price/interval/trial/grace columns, so every plan that is purchasable
-- today keeps a purchasable billing option after this migration. Plans
-- billed on a 'day' or 'custom' cadence (not month/year) are intentionally
-- left without a billing option row; RPCs fall back to the plan's legacy
-- columns whenever it has zero billing options (see the checkout/expiry
-- functions updated later in this migration chain).
insert into public.subscription_plan_billing_options(
  plan_id, billing_interval, interval_count, price, discounted_price, currency,
  trial_enabled, trial_days, grace_period_days, is_active, display_order
)
select
  plan.id, plan.billing_interval, plan.billing_interval_count, plan.price,
  plan.discounted_price, plan.currency, plan.trial_enabled, plan.trial_days,
  plan.grace_period_days, true, 0
from public.subscription_plans plan
where plan.billing_interval in ('month', 'year')
on conflict (plan_id, billing_interval) do nothing;

alter table public.subscription_plan_billing_options enable row level security;
revoke all on public.subscription_plan_billing_options from anon, authenticated;
grant select on public.subscription_plan_billing_options to anon, authenticated;
grant insert, update, delete on public.subscription_plan_billing_options to authenticated;

create policy subscription_plan_billing_options_public_read
on public.subscription_plan_billing_options for select to anon, authenticated
using (
  private.is_admin()
  or (
    is_active
    and exists (
      select 1 from public.subscription_plans plan
      where plan.id = plan_id and plan.status in ('active', 'coming_soon') and plan.archived_at is null
    )
  )
);
create policy subscription_plan_billing_options_admin_insert
on public.subscription_plan_billing_options for insert to authenticated
with check (private.is_admin());
create policy subscription_plan_billing_options_admin_update
on public.subscription_plan_billing_options for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy subscription_plan_billing_options_admin_delete
on public.subscription_plan_billing_options for delete to authenticated
using (private.is_admin());

commit;
