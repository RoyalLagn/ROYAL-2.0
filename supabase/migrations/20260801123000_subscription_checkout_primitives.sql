begin;

create or replace function public.resolve_subscription_checkout(
  target_vendor_id uuid,
  target_plan_id uuid,
  target_offer_id uuid default null,
  evaluated_at timestamptz default now()
) returns table (
  vendor_id uuid,
  plan_id uuid,
  offer_id uuid,
  plan_name text,
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
  offer public.subscription_offers%rowtype;
  discount numeric(12, 2) := 0;
  payable numeric(12, 2);
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
  where id = target_plan_id and is_active and archived_at is null
    and (available_from is null or available_from <= evaluated_at)
    and (available_until is null or available_until > evaluated_at);
  if not found then raise exception 'This subscription plan is not available'; end if;

  payable := coalesce(plan.discounted_price, plan.price);
  if target_offer_id is not null then
    select * into offer from public.subscription_offers
    where id = target_offer_id and is_active and archived_at is null
      and (start_date is null or start_date <= evaluated_at)
      and (end_date is null or end_date > evaluated_at)
      and (maximum_uses is null or current_uses < maximum_uses)
      and (cardinality(applicable_plan_ids) = 0 or target_plan_id = any(applicable_plan_ids))
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
    target_offer_id,
    plan.name,
    plan.currency,
    coalesce(plan.discounted_price, plan.price),
    discount,
    payable,
    round(payable * 100)::bigint;
end;
$$;

create or replace function public.claim_my_subscription_trial(target_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid;
  plan public.subscription_plans%rowtype;
  trial_days integer;
  result_id uuid;
begin
  target_vendor_id := private.subscription_vendor_for_user();
  if target_vendor_id is null then raise exception 'Vendor access required'; end if;
  if not private.subscription_setting_boolean('subscription_free_trial_enabled', false) then
    raise exception 'Free trials are not enabled';
  end if;
  select * into plan from public.subscription_plans
  where id = target_plan_id and is_active and archived_at is null;
  if not found or not plan.trial_enabled then raise exception 'This plan does not include a free trial'; end if;
  if exists (select 1 from public.vendor_subscriptions where vendor_id = target_vendor_id) then
    raise exception 'A subscription or trial has already been used for this Vendor';
  end if;
  trial_days := coalesce(nullif(plan.trial_days, 0), private.subscription_setting_integer('subscription_free_trial_days', 0));
  if trial_days <= 0 then raise exception 'Free trial duration is not configured'; end if;

  insert into public.vendor_subscriptions(
    vendor_id, plan_id, status, access_source, start_date, expiry_date,
    trial_start_date, trial_end_date, grace_period_end_date, metadata
  ) values (
    target_vendor_id, target_plan_id, 'trial', 'free_trial', now(),
    now() + make_interval(days => trial_days), now(),
    now() + make_interval(days => trial_days),
    now() + make_interval(days => trial_days + plan.grace_period_days),
    jsonb_build_object('self_claimed', true)
  ) returning id into result_id;

  insert into public.subscription_events(
    vendor_id, subscription_id, event_type, new_status, performed_by,
    performed_by_role, metadata
  ) values (
    target_vendor_id, result_id, 'trial_started', 'trial', auth.uid(),
    'vendor', jsonb_build_object('trial_days', trial_days)
  );
  update public.vendors set subscription_status = 'active', updated_at = now()
  where id = target_vendor_id;
  return result_id;
end;
$$;

revoke all on function public.resolve_subscription_checkout(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_subscription_checkout(uuid, uuid, uuid, timestamptz) to service_role;
revoke all on function public.claim_my_subscription_trial(uuid) from public, anon;
grant execute on function public.claim_my_subscription_trial(uuid) to authenticated;

commit;
