begin;

alter table public.subscription_offers
  add column if not exists applicable_billing_intervals text[] not null default '{}';

-- resolve_subscription_checkout gains an optional billing-option parameter.
-- When provided, price resolves from the billing option (Monthly/Yearly)
-- instead of the plan's legacy price columns, and offers are checked
-- against applicable_billing_intervals the same way they already check
-- applicable_plan_ids (empty array = all intervals eligible).
create or replace function public.resolve_subscription_checkout(
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
  original_amount numeric,
  discount_amount numeric,
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
  discount numeric(12, 2) := 0;
  payable numeric(12, 2);
  resolved_interval text;
  resolved_currency text;
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
    select * into billing_option from public.subscription_plan_billing_options
    where id = target_billing_option_id and plan_id = target_plan_id and is_active;
    if not found then raise exception 'This billing option is not available for the selected plan'; end if;
  end if;

  payable := coalesce(billing_option.discounted_price, billing_option.price, plan.discounted_price, plan.price);
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

    discount := case offer.discount_type
      when 'percentage' then round(payable * offer.discount_value / 100.0, 2)
      when 'fixed' then least(payable, offer.discount_value)
      when 'free' then payable
      else 0
    end;
  end if;
  payable := greatest(0, payable - discount);

  return query select
    target_vendor_id,
    target_plan_id,
    target_billing_option_id,
    target_offer_id,
    plan.name,
    resolved_interval,
    resolved_currency,
    coalesce(billing_option.discounted_price, billing_option.price, plan.discounted_price, plan.price),
    discount,
    payable,
    round(payable * 100)::bigint;
end;
$$;

revoke all on function public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz) to service_role;

-- The previous 4-argument overload (target_vendor_id, target_plan_id,
-- target_offer_id, evaluated_at) is superseded; drop it so PostgREST/RPC
-- callers can't accidentally resolve to the old signature that doesn't
-- know about billing options.
drop function if exists public.resolve_subscription_checkout(uuid, uuid, uuid, timestamptz);

commit;
