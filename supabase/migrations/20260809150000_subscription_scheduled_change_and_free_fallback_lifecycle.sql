begin;

-- Shared snapshot builder used by the lifecycle processor below. The
-- payment activation path (activate_verified_subscription_payment,
-- previous migration) keeps its own inline copy so this migration does not
-- need to touch that already-defined function.
create or replace function private.build_plan_snapshot(
  target_plan_id uuid,
  target_billing_option_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan public.subscription_plans%rowtype;
  billing_option public.subscription_plan_billing_options%rowtype;
  features_snapshot jsonb;
begin
  select * into plan from public.subscription_plans where id = target_plan_id;
  if not found then raise exception 'Subscription plan not found'; end if;
  if target_billing_option_id is not null then
    select * into billing_option from public.subscription_plan_billing_options where id = target_billing_option_id;
  end if;

  select jsonb_object_agg(
    feature.feature_key,
    jsonb_build_object('is_enabled', plan_feature.is_enabled, 'limit_value', plan_feature.limit_value)
  ) into features_snapshot
  from public.subscription_plan_features plan_feature
  join public.subscription_feature_definitions feature on feature.id = plan_feature.feature_id
  where plan_feature.plan_id = plan.id;

  return jsonb_build_object(
    'plan_id', plan.id,
    'plan_name', plan.name,
    'billing_option_id', billing_option.id,
    'billing_interval', coalesce(billing_option.billing_interval, plan.billing_interval),
    'price', coalesce(billing_option.discounted_price, billing_option.price, plan.discounted_price, plan.price),
    'currency', coalesce(billing_option.currency, plan.currency, 'INR'),
    'trial_days', coalesce(billing_option.trial_days, plan.trial_days),
    'grace_period_days', coalesce(billing_option.grace_period_days, plan.grace_period_days),
    'features', coalesce(features_snapshot, '{}'::jsonb),
    'captured_at', now()
  );
end;
$$;

revoke all on function private.build_plan_snapshot(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Vendor self-service: schedule a plan/billing-option change.
--
-- An upgrade (higher payable amount) is rejected here and must go through
-- the existing Razorpay checkout (SubscriptionPaymentService.subscribe ->
-- activate_verified_subscription_payment), which activates immediately, no
-- proration, per the "immediate upgrade is fine" requirement. A downgrade
-- (lower or equal payable amount), or any change with an explicit
-- effective_at, only records the intent -- current entitlements are
-- untouched until process_subscription_lifecycle applies it at the
-- scheduled time.
-- ---------------------------------------------------------------------

create or replace function public.schedule_subscription_change(
  target_vendor_id uuid,
  target_plan_id uuid,
  target_billing_option_id uuid default null,
  effective_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription public.vendor_subscriptions%rowtype;
  current_access record;
  new_plan public.subscription_plans%rowtype;
  new_billing_option public.subscription_plan_billing_options%rowtype;
  current_price numeric := 0;
  new_price numeric := 0;
  apply_at timestamptz;
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;

  select * into new_plan from public.subscription_plans
  where id = target_plan_id and status in ('active', 'coming_soon') and archived_at is null;
  if not found then raise exception 'This subscription plan is not available'; end if;
  if target_billing_option_id is not null then
    select * into new_billing_option from public.subscription_plan_billing_options
    where id = target_billing_option_id and plan_id = target_plan_id and is_active;
    if not found then raise exception 'This billing option is not available for the selected plan'; end if;
  end if;

  select * into current_subscription
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = target_vendor_id
    and subscription.status in ('active', 'past_due', 'grace_period', 'trial', 'launch_offer', 'cancelled')
  order by subscription.updated_at desc
  limit 1
  for update;
  if not found then raise exception 'An active subscription is required before scheduling a plan change'; end if;

  select * into current_access from public.subscription_effective_access(target_vendor_id, now()) limit 1;
  current_price := coalesce(current_access.price, 0);
  new_price := coalesce(new_billing_option.discounted_price, new_billing_option.price, new_plan.discounted_price, new_plan.price, 0);

  if effective_at is null and new_price > current_price then
    raise exception 'Upgrading takes effect immediately through checkout, not scheduling'
      using errcode = 'P0001', hint = 'USE_CHECKOUT_FOR_UPGRADE';
  end if;

  apply_at := coalesce(effective_at, current_subscription.expiry_date, now());

  update public.vendor_subscriptions set
    scheduled_plan_id = target_plan_id,
    scheduled_billing_option_id = target_billing_option_id,
    scheduled_plan_snapshot = null,
    scheduled_payment_id = null,
    scheduled_change_at = apply_at,
    scheduled_reason = 'vendor_requested',
    updated_by = auth.uid()
  where id = current_subscription.id;

  insert into public.subscription_events(
    vendor_id, subscription_id, event_type, previous_status, new_status,
    performed_by, performed_by_role, metadata
  ) values (
    target_vendor_id, current_subscription.id, 'change_scheduled', current_subscription.status, current_subscription.status,
    auth.uid(), case when private.is_admin() and not private.owns_vendor(target_vendor_id) then 'admin' else 'vendor' end,
    jsonb_build_object('scheduled_plan_id', target_plan_id, 'scheduled_billing_option_id', target_billing_option_id, 'scheduled_change_at', apply_at)
  );

  insert into public.vendor_notifications(vendor_id, title, body, kind)
  values (
    target_vendor_id, 'Plan change scheduled',
    'Your Vendor plan will change to ' || new_plan.name || ' on ' || to_char(apply_at at time zone 'UTC', 'DD Mon YYYY') || '. Your current plan stays active until then.',
    'subscription'
  );

  return current_subscription.id;
end;
$$;

revoke all on function public.schedule_subscription_change(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.schedule_subscription_change(uuid, uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Vendor self-service cancellation: keeps access until the paid period
-- ends (subscription_effective_access's 'cancelled' branch, previous
-- migration), never deletes anything, never changes expiry_date.
-- ---------------------------------------------------------------------

create or replace function public.cancel_my_subscription(reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid;
  current_subscription public.vendor_subscriptions%rowtype;
begin
  target_vendor_id := private.subscription_vendor_for_user();
  if target_vendor_id is null then raise exception 'Vendor access required'; end if;

  select * into current_subscription
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = target_vendor_id
    and subscription.status in ('active', 'past_due', 'grace_period', 'trial', 'launch_offer')
  order by subscription.updated_at desc
  limit 1
  for update;
  if not found then raise exception 'No active subscription to cancel'; end if;

  update public.vendor_subscriptions set
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = coalesce(nullif(btrim(reason), ''), cancellation_reason),
    scheduled_plan_id = null,
    scheduled_billing_option_id = null,
    scheduled_change_at = null,
    scheduled_reason = null,
    updated_by = auth.uid()
  where id = current_subscription.id;

  insert into public.subscription_events(
    vendor_id, subscription_id, event_type, previous_status, new_status,
    performed_by, performed_by_role, reason
  ) values (
    target_vendor_id, current_subscription.id, 'cancel', current_subscription.status, 'cancelled',
    auth.uid(), 'vendor', reason
  );

  insert into public.vendor_notifications(vendor_id, title, body, kind)
  values (
    target_vendor_id, 'Subscription cancelled',
    case when current_subscription.expiry_date is not null
      then 'Your Vendor plan is cancelled. You keep full access until ' || to_char(current_subscription.expiry_date at time zone 'UTC', 'DD Mon YYYY') || '.'
      else 'Your Vendor plan is cancelled.'
    end,
    'subscription'
  );

  return current_subscription.id;
end;
$$;

revoke all on function public.cancel_my_subscription(text) from public, anon;
grant execute on function public.cancel_my_subscription(text) to authenticated;

-- ---------------------------------------------------------------------
-- process_subscription_lifecycle: apply due scheduled changes, and fall
-- back newly-expired vendors onto the permanent Free plan instead of
-- leaving them with zero entitlements. Everything before the two new
-- steps below is unchanged from 20260801121000.
-- ---------------------------------------------------------------------

create or replace function public.process_subscription_lifecycle(
  run_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch_inserted integer := 0;
  grace_started integer := 0;
  expired_count integer := 0;
  stale_payments integer := 0;
  reminder_count integer := 0;
  scheduled_applied integer := 0;
  free_fallback_count integer := 0;
  launch_start timestamptz;
  launch_end timestamptz;
  launch_plan uuid;
  fallback_plan_id uuid;
begin
  launch_start := private.subscription_setting_timestamp('subscription_launch_offer_start_date');
  launch_end := private.subscription_setting_timestamp('subscription_launch_offer_end_date');
  launch_plan := coalesce(
    private.subscription_setting_uuid('subscription_launch_offer_plan_id'),
    private.subscription_setting_uuid('subscription_default_plan_id')
  );

  if private.subscription_setting_boolean('subscription_launch_offer_enabled', false)
    and private.subscription_setting_boolean('subscription_launch_offer_auto_activation', true)
    and (launch_start is null or run_at >= launch_start)
    and launch_end is not null and run_at < launch_end
    and launch_plan is not null
  then
    with inserted as (
      insert into public.vendor_subscriptions(
        vendor_id, plan_id, status, access_source, start_date, expiry_date,
        launch_offer_start_date, launch_offer_end_date, grace_period_end_date,
        metadata
      )
      select
        vendor.id, launch_plan, 'launch_offer', 'launch_offer',
        coalesce(launch_start, run_at), launch_end,
        coalesce(launch_start, run_at), launch_end,
        launch_end + make_interval(days => private.subscription_setting_integer('subscription_launch_offer_grace_period_days', 0)),
        jsonb_build_object('auto_activated', true)
      from public.vendors vendor
      left join public.profiles profile on profile.id = vendor.profile_id
      where vendor.is_verified
        and coalesce(vendor.management_status, 'active') = 'active'
        and (vendor.profile_id is null or profile.is_active)
        and not exists (
          select 1 from public.vendor_subscriptions current
          where current.vendor_id = vendor.id
            and current.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended')
        )
      returning id, vendor_id
    ), events as (
      insert into public.subscription_events(
        vendor_id, subscription_id, event_type, new_status, performed_by_role,
        metadata
      )
      select vendor_id, id, 'launch_offer_started', 'launch_offer', 'system',
        jsonb_build_object('auto_activated', true)
      from inserted returning id
    )
    select count(*) into launch_inserted from inserted;
    update public.vendors vendor set subscription_status = 'active', updated_at = run_at
    where exists (
      select 1 from public.vendor_subscriptions subscription
      where subscription.vendor_id = vendor.id and subscription.status = 'launch_offer'
    );
  end if;

  reminder_count := public.queue_subscription_reminders(run_at);

  -- Apply scheduled plan/billing-option changes whose effective date has
  -- arrived (deferred downgrades, and any admin-forced scheduled change).
  -- The vendor's current period is left completely alone until this point.
  with due as (
    select subscription.id, subscription.vendor_id, subscription.scheduled_plan_id, subscription.scheduled_billing_option_id
    from public.vendor_subscriptions subscription
    where subscription.status in ('active', 'past_due', 'grace_period', 'cancelled')
      and subscription.scheduled_plan_id is not null
      and subscription.scheduled_change_at is not null
      and subscription.scheduled_change_at <= run_at
    for update of subscription
  ), applied as (
    update public.vendor_subscriptions subscription set
      plan_id = due.scheduled_plan_id,
      billing_option_id = due.scheduled_billing_option_id,
      status = 'active',
      access_source = 'paid_subscription',
      start_date = run_at,
      expiry_date = case when plan.is_permanent then null
        else coalesce(
          case billing_option.billing_interval
            when 'month' then run_at + make_interval(months => billing_option.interval_count)
            when 'year' then run_at + make_interval(years => billing_option.interval_count)
            else null
          end,
          private.subscription_plan_expiry(run_at, due.scheduled_plan_id)
        )
      end,
      grace_period_end_date = null,
      plan_snapshot = coalesce(subscription.scheduled_plan_snapshot, private.build_plan_snapshot(due.scheduled_plan_id, due.scheduled_billing_option_id)),
      scheduled_plan_id = null,
      scheduled_billing_option_id = null,
      scheduled_plan_snapshot = null,
      scheduled_payment_id = null,
      scheduled_change_at = null,
      scheduled_reason = null,
      cancelled_at = null,
      cancellation_reason = null
    from due
    join public.subscription_plans plan on plan.id = due.scheduled_plan_id
    left join public.subscription_plan_billing_options billing_option on billing_option.id = due.scheduled_billing_option_id
    where subscription.id = due.id
    returning subscription.id, subscription.vendor_id, subscription.expiry_date, subscription.grace_period_end_date
  ), regrace as (
    update public.vendor_subscriptions subscription set
      grace_period_end_date = case when subscription.expiry_date is null then null
        else subscription.expiry_date + make_interval(days => coalesce(
          (subscription.plan_snapshot->>'grace_period_days')::integer,
          (select grace_period_days from public.subscription_plans where id = subscription.plan_id),
          0
        ))
      end
    from applied
    where subscription.id = applied.id
    returning subscription.id
  ), events as (
    insert into public.subscription_events(vendor_id, subscription_id, event_type, new_status, performed_by_role)
    select vendor_id, id, 'scheduled_change_applied', 'active', 'system' from applied returning id
  )
  select count(*) into scheduled_applied from applied;

  with candidates as (
    select subscription.id, subscription.vendor_id, subscription.status,
      case subscription.status
        when 'trial' then coalesce(subscription.trial_end_date, subscription.expiry_date)
        when 'launch_offer' then coalesce(subscription.launch_offer_end_date, subscription.expiry_date)
        else subscription.expiry_date
      end effective_expiry,
      case when subscription.status = 'launch_offer'
        then private.subscription_setting_integer('subscription_launch_offer_grace_period_days', 0)
        else coalesce(plan.grace_period_days, private.subscription_setting_integer('subscription_grace_period_days', 0))
      end grace_days
    from public.vendor_subscriptions subscription
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    where subscription.status in ('trial','launch_offer','active','past_due')
  ), updated as (
    update public.vendor_subscriptions subscription set
      status = 'grace_period',
      grace_period_end_date = candidate.effective_expiry + make_interval(days => candidate.grace_days),
      updated_at = run_at
    from candidates candidate
    where subscription.id = candidate.id
      and candidate.effective_expiry <= run_at
      and candidate.grace_days > 0
      and candidate.effective_expiry + make_interval(days => candidate.grace_days) > run_at
    returning subscription.id, subscription.vendor_id, candidate.status previous_status
  ), events as (
    insert into public.subscription_events(
      vendor_id, subscription_id, event_type, previous_status, new_status,
      performed_by_role
    )
    select vendor_id, id, 'grace_period_started', previous_status, 'grace_period', 'system'
    from updated returning id
  )
  select count(*) into grace_started from updated;

  with candidates as (
    select subscription.id, subscription.vendor_id, subscription.status,
      case subscription.status
        when 'trial' then coalesce(subscription.trial_end_date, subscription.expiry_date)
        when 'launch_offer' then coalesce(subscription.launch_offer_end_date, subscription.expiry_date)
        when 'grace_period' then subscription.grace_period_end_date
        else subscription.expiry_date
      end effective_expiry
    from public.vendor_subscriptions subscription
    where subscription.status in ('trial','launch_offer','active','past_due','grace_period','cancelled')
  ), updated as (
    update public.vendor_subscriptions subscription set
      status = 'expired', updated_at = run_at
    from candidates candidate
    where subscription.id = candidate.id
      and candidate.effective_expiry is not null
      and candidate.effective_expiry <= run_at
      and not (
        subscription.status <> 'grace_period'
        and subscription.grace_period_end_date is not null
        and subscription.grace_period_end_date > run_at
      )
    returning subscription.id, subscription.vendor_id, candidate.status previous_status
  ), events as (
    insert into public.subscription_events(
      vendor_id, subscription_id, event_type, previous_status, new_status,
      performed_by_role
    )
    select vendor_id, id, 'subscription_expired', previous_status, 'expired', 'system'
    from updated returning id
  )
  select count(*) into expired_count from updated;

  -- Safety net: a vendor who just lost paid/trial/launch/cancelled access
  -- and has no other current subscription row always falls back onto the
  -- permanent Free plan rather than being left with zero entitlements.
  select id into fallback_plan_id
  from public.subscription_plans
  where is_permanent and status = 'active' and archived_at is null
  order by display_order, created_at
  limit 1;

  if fallback_plan_id is not null then
    with needing_fallback as (
      select distinct subscription.vendor_id
      from public.vendor_subscriptions subscription
      where subscription.status = 'expired'
        and not exists (
          select 1 from public.vendor_subscriptions current
          where current.vendor_id = subscription.vendor_id
            and current.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended')
        )
    ), inserted as (
      insert into public.vendor_subscriptions(
        vendor_id, plan_id, status, access_source, start_date, expiry_date,
        grace_period_end_date, metadata
      )
      select vendor_id, fallback_plan_id, 'active', 'free_fallback', run_at, null, null,
        jsonb_build_object('fallback_from_expiry', true)
      from needing_fallback
      returning id, vendor_id
    ), events as (
      insert into public.subscription_events(vendor_id, subscription_id, event_type, new_status, performed_by_role)
      select vendor_id, id, 'free_fallback_activated', 'active', 'system' from inserted returning id
    )
    select count(*) into free_fallback_count from inserted;

    update public.vendors vendor set subscription_status = 'active', updated_at = run_at
    where exists (
      select 1 from public.vendor_subscriptions subscription
      where subscription.vendor_id = vendor.id and subscription.access_source = 'free_fallback'
        and subscription.status = 'active' and subscription.start_date >= run_at - interval '1 minute'
    );
  end if;

  update public.vendors vendor set subscription_status = 'expired', updated_at = run_at
  where exists (
    select 1 from public.vendor_subscriptions subscription
    where subscription.vendor_id = vendor.id and subscription.status = 'expired'
  ) and not exists (
    select 1 from public.vendor_subscriptions current
    where current.vendor_id = vendor.id
      and current.status in ('trial','launch_offer','active','past_due','grace_period')
  );

  with updated as (
    update public.subscription_payments set
      payment_status = 'failed',
      failure_code = 'stale_pending',
      failure_reason = 'Payment order expired before verification.',
      updated_at = run_at
    where payment_status in ('created','pending')
      and created_at < run_at - make_interval(
        mins => private.subscription_setting_integer('subscription_pending_payment_ttl_minutes', 30)
      )
    returning id
  ) select count(*) into stale_payments from updated;

  return jsonb_build_object(
    'launch_offers_created', launch_inserted,
    'scheduled_changes_applied', scheduled_applied,
    'grace_periods_started', grace_started,
    'subscriptions_expired', expired_count,
    'free_fallbacks_activated', free_fallback_count,
    'stale_payments_failed', stale_payments,
    'reminders_queued', reminder_count,
    'processed_at', run_at
  );
end;
$$;

revoke all on function public.process_subscription_lifecycle(timestamptz) from public, anon, authenticated;
grant execute on function public.process_subscription_lifecycle(timestamptz) to service_role;

commit;
