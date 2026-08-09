begin;

-- Checkout proration is server-owned. A same-cadence paid upgrade uses the
-- remaining fraction of the current period, credits the same fraction of the
-- amount actually paid, and preserves the existing end date. This prevents
-- client-side price manipulation and prevents upgrades from granting extra days.
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
  current_plan_credit numeric,
  proration_ratio numeric,
  is_prorated_upgrade boolean,
  proration_period_end timestamptz,
  proration_evaluated_at timestamptz,
  full_cycle_payable numeric,
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
  current_subscription public.vendor_subscriptions%rowtype;
  current_plan public.subscription_plans%rowtype;
  current_billing_option public.subscription_plan_billing_options%rowtype;
  current_payment public.subscription_payments%rowtype;
  resolved_base numeric(12, 2);
  interval_discount numeric(12, 2) := 0;
  subtotal numeric(12, 2);
  promo_discount numeric(12, 2) := 0;
  full_payable numeric(12, 2);
  resolved_interval text;
  resolved_currency text;
  promo_percentage numeric(5, 2) := 0;
  vendor_offer_uses integer := 0;
  ratio numeric := 1;
  credit numeric(12, 2) := 0;
  prorated boolean := false;
  period_start timestamptz;
  period_end timestamptz;
  prorated_base numeric(12, 2);
  prorated_interval_discount numeric(12, 2);
  prorated_promo_discount numeric(12, 2);
  payable numeric(12, 2);
begin
  select * into vendor from public.vendors where id = target_vendor_id;
  if not found or not vendor.is_verified or coalesce(vendor.management_status, 'active') <> 'active' then
    raise exception 'An approved active Vendor is required';
  end if;

  select * into current_subscription
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = target_vendor_id
  order by
    case when subscription.status in ('suspended','deactivated') then 0
      when subscription.status in ('active','past_due','grace_period','cancelled') then 1
      else 2 end,
    subscription.updated_at desc
  limit 1;

  if current_subscription.status in ('suspended', 'deactivated') then
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
    where id = target_billing_option_id and plan_id = target_plan_id and is_active;
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
    if vendor_offer_uses >= offer.uses_per_vendor then raise exception 'This offer has already been used'; end if;

    promo_discount := case offer.discount_type
      when 'percentage' then round(subtotal * offer.discount_value / 100.0, 2)
      when 'fixed' then least(subtotal, offer.discount_value)
      when 'free' then subtotal
      else 0
    end;
    promo_percentage := case when offer.discount_type = 'percentage' then offer.discount_value else 0 end;
  end if;
  full_payable := greatest(0, subtotal - promo_discount);

  -- Only an upgrade within the same Monthly/Yearly cadence is prorated.
  -- Downgrades and cadence changes remain renewal-bound operations.
  if current_subscription.id is not null
    and current_subscription.access_source = 'paid_subscription'
    and current_subscription.status in ('active','past_due','grace_period','cancelled')
    and current_subscription.expiry_date > evaluated_at
    and current_subscription.plan_id <> target_plan_id
  then
    select * into current_plan from public.subscription_plans where id = current_subscription.plan_id;
    if current_subscription.billing_option_id is not null then
      select * into current_billing_option
      from public.subscription_plan_billing_options
      where id = current_subscription.billing_option_id;
    end if;

    if plan.display_order > current_plan.display_order
      and resolved_interval = coalesce(
        current_billing_option.billing_interval,
        current_subscription.plan_snapshot->>'billing_interval',
        current_plan.billing_interval
      )
    then
      select * into current_payment
      from public.subscription_payments payment
      where payment.id = current_subscription.last_payment_id
        and payment.payment_status = 'verified';

      period_start := coalesce(current_payment.period_start, current_subscription.start_date);
      period_end := coalesce(current_payment.period_end, current_subscription.expiry_date);
      if period_start is null or period_end is null or period_end <= period_start then
        raise exception 'The current paid period cannot be prorated safely';
      end if;

      ratio := least(1, greatest(0,
        extract(epoch from (period_end - evaluated_at))
        / nullif(extract(epoch from (period_end - period_start)), 0)
      ));
      credit := round(coalesce(current_payment.amount, 0) * ratio, 2);
      prorated := true;
    end if;
  end if;

  prorated_base := round(resolved_base * ratio, 2);
  prorated_interval_discount := round(interval_discount * ratio, 2);
  prorated_promo_discount := round(promo_discount * ratio, 2);
  payable := greatest(0, round(full_payable * ratio, 2) - credit);

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
    prorated_interval_discount,
    promo_percentage,
    prorated_promo_discount,
    credit,
    ratio,
    prorated,
    case when prorated then current_subscription.expiry_date else null end,
    evaluated_at,
    full_payable,
    prorated_base,
    prorated_interval_discount + prorated_promo_discount + credit,
    prorated_interval_discount + prorated_promo_discount + credit,
    payable,
    round(payable * 100)::bigint;
end;
$$;

revoke all on function public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.resolve_subscription_checkout(uuid, uuid, uuid, uuid, timestamptz)
to service_role;

-- Keep the authenticated preview on the same resolver after its return shape
-- changes. The page therefore displays the exact amount checkout will charge.
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
    target_vendor_id, target_plan_id, target_offer_id,
    target_billing_option_id, now()
  ) resolved;
  return result;
end;
$$;

revoke all on function public.preview_my_subscription_checkout(uuid, uuid, uuid) from public, anon;
grant execute on function public.preview_my_subscription_checkout(uuid, uuid, uuid) to authenticated;

-- Payment activation historically extended any active paid subscription.
-- For a verified prorated upgrade, preserve the exact current end date and
-- record an explicit audit event instead.
create or replace function private.preserve_prorated_upgrade_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.subscription_payments%rowtype;
  expected_end timestamptz;
begin
  if new.last_payment_id is null or new.last_payment_id is not distinct from old.last_payment_id then
    return new;
  end if;

  select * into payment from public.subscription_payments where id = new.last_payment_id;
  if not coalesce((payment.metadata->>'is_prorated_upgrade')::boolean, false) then return new; end if;

  expected_end := (payment.metadata->>'proration_period_end')::timestamptz;
  if old.expiry_date is null or expected_end is null
    or abs(extract(epoch from (old.expiry_date - expected_end))) > 2
  then
    raise exception 'Subscription changed during upgrade checkout; start again with refreshed pricing';
  end if;

  new.start_date := old.start_date;
  new.expiry_date := old.expiry_date;
  new.grace_period_end_date := case when old.expiry_date is null then null
    else old.expiry_date + make_interval(days => coalesce(
      (new.plan_snapshot->>'grace_period_days')::integer, 0
    )) end;
  new.metadata := new.metadata || jsonb_build_object(
    'last_prorated_upgrade_payment_id', payment.id,
    'last_prorated_upgrade_at', now(),
    'period_end_preserved', true
  );

  insert into public.subscription_events(
    vendor_id, subscription_id, payment_id, event_type,
    previous_status, new_status, performed_by_role, metadata
  ) values (
    new.vendor_id, new.id, payment.id, 'subscription_prorated_upgrade',
    old.status, 'active', 'system',
    jsonb_build_object(
      'from_plan_id', old.plan_id,
      'to_plan_id', new.plan_id,
      'credit_amount', payment.metadata->'pricing'->'currentPlanCredit',
      'period_end', old.expiry_date
    )
  );

  insert into public.vendor_notifications(vendor_id, title, body, kind)
  values (
    new.vendor_id,
    'Subscription upgraded',
    'Your plan was upgraded immediately. Your current billing period still ends on ' ||
      to_char(old.expiry_date at time zone 'UTC', 'DD Mon YYYY') || '; no extra days were added.',
    'subscription'
  );
  return new;
end;
$$;

drop trigger if exists vendor_subscriptions_preserve_prorated_upgrade
on public.vendor_subscriptions;
create trigger vendor_subscriptions_preserve_prorated_upgrade
before update of plan_id, last_payment_id, expiry_date
on public.vendor_subscriptions
for each row execute function private.preserve_prorated_upgrade_period();

create or replace function private.sync_prorated_payment_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'verified'
    and old.payment_status is distinct from 'verified'
    and coalesce((new.metadata->>'is_prorated_upgrade')::boolean, false)
  then
    new.period_start := coalesce(
      (new.metadata->>'proration_evaluated_at')::timestamptz,
      now()
    );
    new.period_end := (new.metadata->>'proration_period_end')::timestamptz;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_payments_sync_prorated_period
on public.subscription_payments;
create trigger subscription_payments_sync_prorated_period
before update of payment_status, period_start, period_end
on public.subscription_payments
for each row execute function private.sync_prorated_payment_period();

-- Activation and expiry reminders already write Vendor inbox messages. Run
-- lifecycle processing daily so the seven-day reminder is automatic rather
-- than dependent on a Vendor opening the app.
update public.application_settings
set value = '[7,3,1,0]'::jsonb,
    description = 'Automatic Vendor renewal reminders before paid access ends.',
    updated_at = now()
where key = 'subscription_reminder_days';

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when insufficient_privilege then
  raise notice 'pg_cron is unavailable; configure an external daily call to process_subscription_lifecycle.';
end;
$$;

do $$
declare
  existing_job bigint;
  scheduled_job bigint;
begin
  if to_regclass('cron.job') is null then return; end if;
  execute 'select jobid from cron.job where jobname = $1 limit 1'
    into existing_job using 'royallagn-subscription-lifecycle-daily';
  if existing_job is not null then
    execute 'select cron.unschedule($1)' into scheduled_job using existing_job;
  end if;
  execute 'select cron.schedule($1, $2, $3)' into scheduled_job using
    'royallagn-subscription-lifecycle-daily',
    '30 3 * * *',
    'select public.process_subscription_lifecycle(now());';
end;
$$;

commit;
