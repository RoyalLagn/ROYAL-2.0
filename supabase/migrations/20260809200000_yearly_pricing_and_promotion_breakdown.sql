begin;

-- Preserve the existing three-tier IDs, entitlements and subscription history;
-- only align the two paid tier names with the customer-facing product names.
update public.subscription_plans set name = 'Premium', updated_at = now()
where lower(slug) = 'silver';
update public.subscription_plans set name = 'Elite', updated_at = now()
where lower(slug) = 'premium';

-- A billing option stores the administrator-controlled interval discount.
-- For Yearly, price is always Monthly x 12 and discounted_price is derived;
-- neither value is trusted from a client.
alter table public.subscription_plan_billing_options
  add column if not exists discount_percentage numeric(5, 2) not null default 0;

alter table public.subscription_plan_billing_options
  drop constraint if exists subscription_plan_billing_options_discount_percentage_range;
alter table public.subscription_plan_billing_options
  add constraint subscription_plan_billing_options_discount_percentage_range
  check (discount_percentage >= 0 and discount_percentage <= 100);

create or replace function private.subscription_billing_option_derive_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  monthly_price numeric(12, 2);
begin
  if new.billing_interval = 'month' then
    new.interval_count := 1;
    new.discount_percentage := 0;
    new.discounted_price := null;
  elsif new.billing_interval = 'year' then
    select option.price into monthly_price
    from public.subscription_plan_billing_options option
    where option.plan_id = new.plan_id
      and option.billing_interval = 'month'
    limit 1;

    if monthly_price is null then
      raise exception 'Configure the Monthly price before enabling Yearly billing';
    end if;

    new.interval_count := 1;
    new.price := round(monthly_price * 12, 2);
    new.discounted_price := round(
      new.price * (1 - new.discount_percentage / 100.0),
      2
    );
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_billing_option_derive_price
on public.subscription_plan_billing_options;
create trigger subscription_billing_option_derive_price
before insert or update of plan_id, billing_interval, interval_count, price,
  discounted_price, discount_percentage
on public.subscription_plan_billing_options
for each row execute function private.subscription_billing_option_derive_price();

create or replace function private.subscription_monthly_price_sync_yearly()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.billing_interval = 'month'
    and (
      tg_op = 'INSERT'
      or new.price is distinct from old.price
      or new.currency is distinct from old.currency
    )
  then
    update public.subscription_plan_billing_options yearly
    set price = round(new.price * 12, 2),
        discounted_price = round(
          new.price * 12 * (1 - yearly.discount_percentage / 100.0),
          2
        ),
        currency = new.currency,
        updated_at = now()
    where yearly.plan_id = new.plan_id
      and yearly.billing_interval = 'year';
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_monthly_price_sync_yearly
on public.subscription_plan_billing_options;
create trigger subscription_monthly_price_sync_yearly
after insert or update of price, currency
on public.subscription_plan_billing_options
for each row execute function private.subscription_monthly_price_sync_yearly();

-- Monthly is the editable base price. Free remains ₹0. Paid tiers keep their
-- requested ₹499/₹999 prices and receive an initial 10% Yearly discount.
update public.subscription_plan_billing_options option
set price = case lower(plan.slug)
      when 'silver' then 499
      when 'premium' then 999
      else 0
    end,
    is_active = true,
    updated_at = now()
from public.subscription_plans plan
where option.plan_id = plan.id
  and option.billing_interval = 'month'
  and lower(plan.slug) in ('free', 'silver', 'premium');

insert into public.subscription_plan_billing_options(
  plan_id, billing_interval, interval_count, price, discounted_price,
  discount_percentage, currency, trial_enabled, trial_days,
  grace_period_days, is_active, display_order
)
select
  monthly.plan_id, 'year', 1, monthly.price * 12,
  round(monthly.price * 12 * 0.90, 2), 10, monthly.currency,
  false, 0, monthly.grace_period_days,
  lower(plan.slug) in ('silver', 'premium'), 10
from public.subscription_plan_billing_options monthly
join public.subscription_plans plan on plan.id = monthly.plan_id
where monthly.billing_interval = 'month'
  and lower(plan.slug) in ('free', 'silver', 'premium')
on conflict (plan_id, billing_interval) do update set
  discount_percentage = case
    when lower((select slug from public.subscription_plans where id = excluded.plan_id)) in ('silver', 'premium')
      then 10
    else 0
  end,
  is_active = lower((select slug from public.subscription_plans where id = excluded.plan_id)) in ('silver', 'premium'),
  updated_at = now();

-- Ensure legacy plan prices mirror Monthly for admin summaries and older
-- consumers. Checkout continues to use the selected billing option.
update public.subscription_plans plan
set price = monthly.price,
    discounted_price = null,
    billing_interval = 'month',
    billing_interval_count = 1,
    updated_at = now()
from public.subscription_plan_billing_options monthly
where monthly.plan_id = plan.id
  and monthly.billing_interval = 'month';

-- Replace the checkout resolver with an explicit, ordered breakdown:
-- base -> interval discount -> promotional discount -> payable.
drop function if exists public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz);

create function public.resolve_subscription_checkout(
  target_vendor_id uuid,
  target_plan_id uuid,
  target_offer_id uuid default null,
  target_billing_option_id uuid default null,
  evaluated_at timestamptz default now()
) returns table (
  vendor_id uuid,
  plan_id uuid,
  billing_option_id uuid,
  offer_id uuid,
  plan_name text,
  billing_interval text,
  currency text,
  base_amount numeric,
  interval_discount_percentage numeric,
  interval_discount_amount numeric,
  promotional_discount_percentage numeric,
  promotional_discount_amount numeric,
  original_amount numeric,
  discount_amount numeric,
  total_savings numeric,
  payable_amount numeric,
  amount_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  vendor public.vendors%rowtype;
  plan public.subscription_plans%rowtype;
  billing_option public.subscription_plan_billing_options%rowtype;
  offer public.subscription_offers%rowtype;
  resolved_base numeric(12, 2);
  interval_discount numeric(12, 2) := 0;
  subtotal numeric(12, 2);
  promo_discount numeric(12, 2) := 0;
  payable numeric(12, 2);
  resolved_interval text;
  resolved_currency text;
  promo_percentage numeric(5, 2) := 0;
  vendor_offer_uses integer := 0;
begin
  select * into vendor from public.vendors where id = target_vendor_id;
  if not found or not vendor.is_verified or coalesce(vendor.management_status, 'active') <> 'active' then
    raise exception 'An approved active Vendor is required';
  end if;
  if exists (
    select 1 from public.vendor_subscriptions subscription
    where subscription.vendor_id = target_vendor_id
      and subscription.status in ('suspended', 'deactivated')
      and not exists (
        select 1 from public.vendor_subscriptions newer
        where newer.vendor_id = subscription.vendor_id
          and newer.updated_at > subscription.updated_at
          and newer.status not in ('suspended', 'deactivated')
      )
  ) then
    raise exception 'This Vendor subscription requires administrator review';
  end if;

  select * into plan from public.subscription_plans
  where id = target_plan_id and status = 'active' and archived_at is null
    and (available_from is null or available_from <= evaluated_at)
    and (available_until is null or available_until > evaluated_at);
  if not found then raise exception 'This subscription plan is not available'; end if;

  if target_billing_option_id is not null then
    select * into billing_option
    from public.subscription_plan_billing_options
    where id = target_billing_option_id
      and plan_id = target_plan_id
      and is_active;
    if not found then raise exception 'This billing option is not available for the selected plan'; end if;
  end if;

  resolved_base := coalesce(billing_option.price, plan.price);
  interval_discount := greatest(
    0,
    resolved_base - coalesce(billing_option.discounted_price, billing_option.price, plan.discounted_price, plan.price)
  );
  subtotal := greatest(0, resolved_base - interval_discount);
  resolved_interval := coalesce(billing_option.billing_interval, plan.billing_interval);
  resolved_currency := coalesce(billing_option.currency, plan.currency);

  if target_offer_id is not null then
    select * into offer from public.subscription_offers
    where id = target_offer_id and is_active and archived_at is null
      and (start_date is null or start_date <= evaluated_at)
      and (end_date is null or end_date > evaluated_at)
      and (maximum_uses is null or current_uses < maximum_uses)
      and (cardinality(applicable_plan_ids) = 0 or target_plan_id = any(applicable_plan_ids))
      and (cardinality(applicable_billing_intervals) = 0 or resolved_interval = any(applicable_billing_intervals))
      and (is_global or target_vendor_id = any(applicable_vendor_ids));
    if not found then raise exception 'This subscription offer is not available'; end if;

    select count(*) into vendor_offer_uses
    from public.subscription_payments payment
    where payment.vendor_id = target_vendor_id
      and payment.offer_id = target_offer_id
      and payment.payment_status = 'verified';
    if vendor_offer_uses >= offer.uses_per_vendor then
      raise exception 'This offer has already been used';
    end if;

    promo_discount := case offer.discount_type
      when 'percentage' then round(subtotal * offer.discount_value / 100.0, 2)
      when 'fixed' then least(subtotal, offer.discount_value)
      when 'free' then subtotal
      else 0
    end;
    promo_percentage := case when offer.discount_type = 'percentage' then offer.discount_value else 0 end;
  end if;

  payable := greatest(0, subtotal - promo_discount);

  return query select
    target_vendor_id,
    target_plan_id,
    target_billing_option_id,
    target_offer_id,
    plan.name,
    resolved_interval,
    resolved_currency,
    resolved_base,
    coalesce(billing_option.discount_percentage, 0),
    interval_discount,
    promo_percentage,
    promo_discount,
    resolved_base,
    interval_discount + promo_discount,
    interval_discount + promo_discount,
    payable,
    round(payable * 100)::bigint;
end;
$$;

revoke all on function public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz)
to service_role;

-- Authenticated preview uses the exact checkout resolver. The vendor ID is
-- derived from the session, so a client cannot preview or influence another
-- Vendor's pricing.
create or replace function public.preview_my_subscription_checkout(
  target_plan_id uuid,
  target_billing_option_id uuid default null,
  target_offer_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid;
  result jsonb;
begin
  target_vendor_id := private.subscription_vendor_for_user();
  if target_vendor_id is null then raise exception 'Vendor access required'; end if;

  select to_jsonb(resolved) into result
  from public.resolve_subscription_checkout(
    target_vendor_id,
    target_plan_id,
    target_offer_id,
    target_billing_option_id,
    now()
  ) resolved;
  return result;
end;
$$;

revoke all on function public.preview_my_subscription_checkout(uuid, uuid, uuid)
from public, anon;
grant execute on function public.preview_my_subscription_checkout(uuid, uuid, uuid)
to authenticated;

commit;
