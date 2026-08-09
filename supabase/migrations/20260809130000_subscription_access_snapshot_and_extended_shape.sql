begin;

-- Extends subscription_effective_access() / get_my_subscription_access()
-- with billing/price, clip/photo usage+limit+remaining, trial end date and
-- scheduled-change fields, and makes the resolved plan/price/limits
-- snapshot-aware for an active paid subscription. Postgres cannot
-- CREATE OR REPLACE a function that changes its OUT columns, so both
-- functions are dropped and recreated with the same name and input
-- signature -- existing callers (SubscriptionAccessService.getCurrentAccess,
-- require_vendor_feature_access, private.vendor_has_subscription_feature,
-- private.subscription_effective_feature) keep working unchanged.

drop function if exists public.get_my_subscription_access();
drop function if exists public.subscription_effective_access(uuid, timestamptz);

create or replace function public.subscription_effective_access(
  target_vendor_id uuid,
  evaluated_at timestamptz default now()
) returns table (
  vendor_id uuid,
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  status text,
  access_source text,
  billing_interval text,
  price numeric,
  currency text,
  start_date timestamptz,
  expiry_date timestamptz,
  grace_period_end_date timestamptz,
  trial_end_date timestamptz,
  days_remaining integer,
  has_access boolean,
  access_reason text,
  clip_limit integer,
  clip_usage integer,
  clip_remaining integer,
  photo_limit integer,
  photo_usage integer,
  photo_remaining integer,
  scheduled_plan_id uuid,
  scheduled_plan_name text,
  scheduled_billing_option_id uuid,
  scheduled_change_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_subscription public.vendor_subscriptions%rowtype;
  current_plan public.subscription_plans%rowtype;
  current_billing_option public.subscription_plan_billing_options%rowtype;
  effective_expiry timestamptz;
  effective_status text;
  effective_access boolean := false;
  effective_reason text := 'subscription_required';
  launch_start timestamptz;
  launch_end timestamptz;
  launch_plan_id uuid;
  uses_snapshot boolean := false;
  resolved_billing_interval text;
  resolved_price numeric;
  resolved_currency text;
  resolved_clip_limit integer;
  resolved_photo_limit integer;
  resolved_clip_usage integer := 0;
  resolved_photo_usage integer := 0;
  scheduled_plan_name text;
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor access required' using errcode = '42501';
  end if;

  select * into current_subscription
  from public.vendor_subscriptions candidate
  where candidate.vendor_id = target_vendor_id
  order by
    case candidate.status
      when 'suspended' then 0 when 'deactivated' then 0
      when 'active' then 1 when 'trial' then 1 when 'launch_offer' then 1
      when 'grace_period' then 1 when 'past_due' then 2 when 'pending' then 3
      else 4
    end,
    candidate.updated_at desc,
    candidate.created_at desc
  limit 1;

  if current_subscription.id is not null then
    select * into current_plan from public.subscription_plans where id = current_subscription.plan_id;
    if current_subscription.billing_option_id is not null then
      select * into current_billing_option
      from public.subscription_plan_billing_options where id = current_subscription.billing_option_id;
    end if;
    effective_status := current_subscription.status;
    effective_expiry := case current_subscription.status
      when 'trial' then coalesce(current_subscription.trial_end_date, current_subscription.expiry_date)
      when 'launch_offer' then coalesce(current_subscription.launch_offer_end_date, current_subscription.expiry_date)
      when 'grace_period' then current_subscription.grace_period_end_date
      else current_subscription.expiry_date
    end;

    if current_subscription.status in ('suspended', 'deactivated') then
      effective_reason := current_subscription.status;
    elsif current_subscription.status = 'cancelled' then
      -- Cancellation keeps access until the already-paid period ends
      -- instead of revoking it immediately.
      if current_subscription.expiry_date is not null and current_subscription.expiry_date > evaluated_at then
        effective_access := true;
        effective_expiry := current_subscription.expiry_date;
        effective_reason := 'cancelled_pending_period_end';
      else
        effective_status := 'expired';
        effective_reason := 'cancelled';
      end if;
    elsif current_subscription.status = 'trial' and effective_expiry > evaluated_at then
      effective_access := true; effective_reason := 'free_trial';
    elsif current_subscription.status = 'launch_offer' and effective_expiry > evaluated_at then
      effective_access := true; effective_reason := 'launch_offer';
    elsif current_subscription.status = 'active'
      and (effective_expiry is null or effective_expiry > evaluated_at) then
      effective_access := true; effective_reason := current_subscription.access_source;
    elsif current_subscription.status in ('active', 'past_due', 'grace_period', 'trial', 'launch_offer')
      and current_subscription.grace_period_end_date > evaluated_at then
      effective_status := 'grace_period';
      effective_expiry := current_subscription.grace_period_end_date;
      effective_access := true; effective_reason := 'grace_period';
    else
      effective_status := case
        when current_subscription.status = 'pending' then 'pending'
        else 'expired'
      end;
      effective_reason := effective_status;
    end if;
  end if;

  if not effective_access
    and coalesce(current_subscription.status, '') not in ('suspended', 'deactivated')
    and private.subscription_setting_boolean('subscription_launch_offer_enabled', false)
  then
    launch_start := private.subscription_setting_timestamp('subscription_launch_offer_start_date');
    launch_end := private.subscription_setting_timestamp('subscription_launch_offer_end_date');
    if (launch_start is null or evaluated_at >= launch_start)
      and launch_end is not null and evaluated_at < launch_end
      and exists (
        select 1 from public.vendors vendor
        left join public.profiles profile on profile.id = vendor.profile_id
        where vendor.id = target_vendor_id
          and vendor.is_verified
          and coalesce(vendor.management_status, 'active') = 'active'
          and (vendor.profile_id is null or profile.is_active)
      )
    then
      launch_plan_id := coalesce(
        private.subscription_setting_uuid('subscription_launch_offer_plan_id'),
        private.subscription_setting_uuid('subscription_default_plan_id')
      );
      select * into current_plan from public.subscription_plans where id = launch_plan_id;
      current_billing_option := null;
      current_subscription.id := null;
      current_subscription.plan_id := launch_plan_id;
      current_subscription.access_source := 'launch_offer';
      current_subscription.start_date := coalesce(launch_start, evaluated_at);
      current_subscription.grace_period_end_date := launch_end
        + make_interval(days => private.subscription_setting_integer('subscription_launch_offer_grace_period_days', 0));
      effective_status := 'launch_offer';
      effective_expiry := launch_end;
      effective_access := true;
      effective_reason := 'launch_offer';
    end if;
  end if;

  -- Snapshot-aware plan pricing/limits: a paid subscription that has
  -- already been activated (and has a captured plan_snapshot) keeps what
  -- it purchased even if the admin edits the live plan afterwards.
  uses_snapshot := current_subscription.access_source = 'paid_subscription'
    and current_subscription.status in ('active', 'past_due', 'grace_period', 'cancelled')
    and current_subscription.plan_snapshot is not null;

  if uses_snapshot then
    resolved_billing_interval := current_subscription.plan_snapshot->>'billing_interval';
    resolved_price := nullif(current_subscription.plan_snapshot->>'price', '')::numeric;
    resolved_currency := coalesce(current_subscription.plan_snapshot->>'currency', 'INR');
    resolved_clip_limit := nullif(current_subscription.plan_snapshot #>> '{features,upload_clips,limit_value}', '')::integer;
    resolved_photo_limit := nullif(current_subscription.plan_snapshot #>> '{features,upload_gallery,limit_value}', '')::integer;
  else
    resolved_billing_interval := coalesce(current_billing_option.billing_interval, current_plan.billing_interval);
    resolved_price := coalesce(current_billing_option.discounted_price, current_billing_option.price, current_plan.discounted_price, current_plan.price);
    resolved_currency := coalesce(current_billing_option.currency, current_plan.currency, 'INR');
    if current_plan.id is not null then
      select plan_feature.limit_value into resolved_clip_limit
      from public.subscription_feature_definitions feature
      join public.subscription_plan_features plan_feature
        on plan_feature.plan_id = current_plan.id and plan_feature.feature_id = feature.id
      where feature.feature_key = 'upload_clips' and feature.is_active and plan_feature.is_enabled
      limit 1;
      select plan_feature.limit_value into resolved_photo_limit
      from public.subscription_feature_definitions feature
      join public.subscription_plan_features plan_feature
        on plan_feature.plan_id = current_plan.id and plan_feature.feature_id = feature.id
      where feature.feature_key = 'upload_gallery' and feature.is_active and plan_feature.is_enabled
      limit 1;
    end if;
  end if;

  if effective_access then
    resolved_clip_limit := coalesce(resolved_clip_limit, 10);
    resolved_photo_limit := coalesce(resolved_photo_limit, 10);
    select count(*) into resolved_clip_usage from public.clips where clips.vendor_id = target_vendor_id and deleted_at is null;
    select count(*) into resolved_photo_usage from public.vendor_portfolio_media where vendor_portfolio_media.vendor_id = target_vendor_id and resource_type = 'image';
  else
    resolved_clip_limit := null;
    resolved_photo_limit := null;
  end if;

  if current_subscription.scheduled_plan_id is not null then
    select plan.name into scheduled_plan_name from public.subscription_plans plan where plan.id = current_subscription.scheduled_plan_id;
  end if;

  return query select
    target_vendor_id,
    current_subscription.id,
    current_subscription.plan_id,
    current_plan.name,
    coalesce(effective_status, 'expired'),
    coalesce(current_subscription.access_source, effective_reason),
    resolved_billing_interval,
    resolved_price,
    resolved_currency,
    current_subscription.start_date,
    effective_expiry,
    current_subscription.grace_period_end_date,
    current_subscription.trial_end_date,
    case
      when effective_expiry is null and effective_access then null
      when effective_expiry is null then 0
      else greatest(0, ceil(extract(epoch from (effective_expiry - evaluated_at)) / 86400.0)::integer)
    end,
    effective_access,
    effective_reason,
    resolved_clip_limit,
    resolved_clip_usage,
    case when resolved_clip_limit is null then null else greatest(resolved_clip_limit - resolved_clip_usage, 0) end,
    resolved_photo_limit,
    resolved_photo_usage,
    case when resolved_photo_limit is null then null else greatest(resolved_photo_limit - resolved_photo_usage, 0) end,
    current_subscription.scheduled_plan_id,
    scheduled_plan_name,
    current_subscription.scheduled_billing_option_id,
    current_subscription.scheduled_change_at;
end;
$$;

create or replace function public.get_my_subscription_access()
returns table (
  vendor_id uuid,
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  status text,
  access_source text,
  billing_interval text,
  price numeric,
  currency text,
  start_date timestamptz,
  expiry_date timestamptz,
  grace_period_end_date timestamptz,
  trial_end_date timestamptz,
  days_remaining integer,
  has_access boolean,
  access_reason text,
  clip_limit integer,
  clip_usage integer,
  clip_remaining integer,
  photo_limit integer,
  photo_usage integer,
  photo_remaining integer,
  scheduled_plan_id uuid,
  scheduled_plan_name text,
  scheduled_billing_option_id uuid,
  scheduled_change_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscription_effective_access(
    private.subscription_vendor_for_user(),
    now()
  )
  where private.subscription_vendor_for_user() is not null;
$$;

revoke all on function public.subscription_effective_access(uuid, timestamptz) from public, anon;
revoke all on function public.get_my_subscription_access() from public, anon;
grant execute on function public.subscription_effective_access(uuid, timestamptz) to authenticated;
grant execute on function public.get_my_subscription_access() to authenticated;

-- ---------------------------------------------------------------------
-- Write a plan_snapshot at activation/renewal so an already-active paid
-- subscriber keeps their purchased price/limits/features even if the
-- admin later edits the live plan or billing option.
-- ---------------------------------------------------------------------

create or replace function public.activate_verified_subscription_payment(
  target_payment_id uuid,
  verified_payment_id text,
  verified_payment_method text default null,
  verification_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.subscription_payments%rowtype;
  current_subscription public.vendor_subscriptions%rowtype;
  plan public.subscription_plans%rowtype;
  billing_option public.subscription_plan_billing_options%rowtype;
  renewal_start timestamptz;
  renewal_end timestamptz;
  result_subscription_id uuid;
  event_name text;
  snapshot jsonb;
  features_snapshot jsonb;
begin
  select * into payment
  from public.subscription_payments
  where id = target_payment_id
  for update;
  if not found then raise exception 'Payment not found'; end if;

  if payment.payment_status = 'verified' then
    if payment.razorpay_payment_id = verified_payment_id then
      return payment.subscription_id;
    end if;
    raise exception 'Payment has already been verified with a different transaction';
  end if;
  if payment.payment_status not in ('created', 'pending', 'authorized', 'captured') then
    raise exception 'Payment cannot be activated from its current status';
  end if;
  if verified_payment_id is null or btrim(verified_payment_id) = '' then
    raise exception 'Verified Razorpay payment ID is required';
  end if;

  select * into plan from public.subscription_plans where id = payment.plan_id;
  if not found then raise exception 'Subscription plan not found'; end if;
  if payment.billing_option_id is not null then
    select * into billing_option from public.subscription_plan_billing_options where id = payment.billing_option_id;
  end if;

  select * into current_subscription
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = payment.vendor_id
  order by
    case when subscription.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended','deactivated') then 0 else 1 end,
    subscription.updated_at desc
  limit 1
  for update;

  if current_subscription.status in ('suspended', 'deactivated') then
    raise exception 'Subscription is suspended and requires administrator review';
  end if;

  renewal_start := case
    when current_subscription.expiry_date is not null
      and current_subscription.expiry_date > now()
      and current_subscription.status in ('active', 'grace_period', 'past_due')
      then current_subscription.expiry_date
    else now()
  end;
  renewal_end := private.subscription_plan_expiry(renewal_start, payment.plan_id);
  if billing_option.id is not null then
    renewal_end := case billing_option.billing_interval
      when 'month' then renewal_start + make_interval(months => billing_option.interval_count)
      when 'year' then renewal_start + make_interval(years => billing_option.interval_count)
      else renewal_end
    end;
  end if;
  if plan.is_permanent then
    renewal_end := null;
  end if;

  select jsonb_object_agg(
    feature.feature_key,
    jsonb_build_object('is_enabled', plan_feature.is_enabled, 'limit_value', plan_feature.limit_value)
  ) into features_snapshot
  from public.subscription_plan_features plan_feature
  join public.subscription_feature_definitions feature on feature.id = plan_feature.feature_id
  where plan_feature.plan_id = plan.id;

  snapshot := jsonb_build_object(
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

  -- A paid downgrade is charged and verified now, but its purchased snapshot
  -- replaces the current plan only when the already-paid period ends.
  if coalesce((payment.metadata ->> 'activate_at_period_end')::boolean, false)
    and current_subscription.id is not null
    and current_subscription.expiry_date is not null
    and current_subscription.expiry_date > now()
    and current_subscription.status in ('active', 'grace_period', 'past_due') then
    update public.vendor_subscriptions set
      scheduled_plan_id = payment.plan_id,
      scheduled_billing_option_id = payment.billing_option_id,
      scheduled_plan_snapshot = snapshot,
      scheduled_payment_id = payment.id,
      scheduled_change_at = current_subscription.expiry_date,
      scheduled_reason = 'vendor_paid_downgrade',
      metadata = metadata || jsonb_build_object('scheduled_by', 'verified_payment')
    where id = current_subscription.id
    returning id into result_subscription_id;

    update public.subscription_payments set
      subscription_id = result_subscription_id,
      razorpay_payment_id = verified_payment_id,
      payment_method = verified_payment_method,
      payment_status = 'verified',
      paid_at = coalesce(paid_at, now()),
      verified_at = now(),
      period_start = renewal_start,
      period_end = renewal_end,
      metadata = metadata || verification_metadata
    where id = payment.id;

    if payment.offer_id is not null then
      update public.subscription_offers
      set current_uses = current_uses + 1
      where id = payment.offer_id;
    end if;

    insert into public.subscription_events(
      vendor_id, subscription_id, payment_id, event_type,
      previous_status, new_status, performed_by_role, metadata
    ) values (
      payment.vendor_id, result_subscription_id, payment.id, 'subscription_change_scheduled',
      current_subscription.status, current_subscription.status, 'vendor',
      jsonb_build_object(
        'target_plan_id', payment.plan_id,
        'effective_at', current_subscription.expiry_date,
        'paid', true
      )
    );

    insert into public.vendor_notifications(vendor_id, title, body, kind)
    values (
      payment.vendor_id,
      'Plan change scheduled',
      'Your payment is confirmed. Your new plan starts on ' ||
        to_char(current_subscription.expiry_date at time zone 'UTC', 'DD Mon YYYY') || '.',
      'subscription'
    );

    return result_subscription_id;
  end if;

  if current_subscription.id is null then
    insert into public.vendor_subscriptions(
      vendor_id, plan_id, offer_id, billing_option_id, status, access_source,
      start_date, expiry_date, grace_period_end_date,
      last_payment_id, auto_renew, plan_snapshot, metadata
    ) values (
      payment.vendor_id, payment.plan_id, payment.offer_id, payment.billing_option_id, 'active', 'paid_subscription',
      renewal_start, renewal_end,
      case when renewal_end is null then null else renewal_end + make_interval(days => coalesce(billing_option.grace_period_days, plan.grace_period_days)) end,
      payment.id, false, snapshot, jsonb_build_object('activated_by', 'verified_payment')
    ) returning id into result_subscription_id;
    event_name := 'subscription_activated';
  else
    update public.vendor_subscriptions set
      plan_id = payment.plan_id,
      offer_id = payment.offer_id,
      billing_option_id = payment.billing_option_id,
      status = 'active',
      access_source = 'paid_subscription',
      start_date = case
        when current_subscription.status in ('active', 'grace_period', 'past_due') then current_subscription.start_date
        else renewal_start
      end,
      expiry_date = renewal_end,
      grace_period_end_date = case when renewal_end is null then null else renewal_end + make_interval(days => coalesce(billing_option.grace_period_days, plan.grace_period_days)) end,
      trial_start_date = null,
      trial_end_date = null,
      launch_offer_start_date = null,
      launch_offer_end_date = null,
      cancelled_at = null,
      cancellation_reason = null,
      suspended_at = null,
      admin_grant = false,
      plan_snapshot = snapshot,
      scheduled_plan_id = null,
      scheduled_billing_option_id = null,
      scheduled_plan_snapshot = null,
      scheduled_payment_id = null,
      scheduled_change_at = null,
      scheduled_reason = null,
      last_payment_id = payment.id,
      metadata = metadata || jsonb_build_object('renewed_by', 'verified_payment')
    where id = current_subscription.id
    returning id into result_subscription_id;
    event_name := case
      when current_subscription.expiry_date is not null then 'subscription_renewed'
      else 'subscription_activated'
    end;
  end if;

  update public.subscription_payments set
    subscription_id = result_subscription_id,
    razorpay_payment_id = verified_payment_id,
    payment_method = verified_payment_method,
    payment_status = 'verified',
    paid_at = coalesce(paid_at, now()),
    verified_at = now(),
    period_start = renewal_start,
    period_end = renewal_end,
    metadata = metadata || verification_metadata
  where id = payment.id;

  if payment.offer_id is not null then
    update public.subscription_offers
    set current_uses = current_uses + 1
    where id = payment.offer_id;
  end if;

  insert into public.subscription_events(
    vendor_id, subscription_id, payment_id, event_type,
    previous_status, new_status, performed_by_role, metadata
  ) values (
    payment.vendor_id, result_subscription_id, payment.id, event_name,
    current_subscription.status, 'active', 'system',
    jsonb_build_object('razorpay_order_id', payment.razorpay_order_id)
  );

  insert into public.vendor_notifications(vendor_id, title, body, kind)
  values (
    payment.vendor_id,
    case when event_name = 'subscription_renewed'
      then 'Subscription renewed successfully'
      else 'Subscription activated successfully'
    end,
    case when renewal_end is null
      then 'Your RoyalLagn Vendor access is now active.'
      else 'Your RoyalLagn Vendor access is active until ' || to_char(renewal_end at time zone 'UTC', 'DD Mon YYYY') || '.'
    end,
    'subscription'
  );

  update public.vendors set subscription_status = 'active', updated_at = now()
  where id = payment.vendor_id;

  return result_subscription_id;
end;
$$;

revoke all on function public.activate_verified_subscription_payment(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_verified_subscription_payment(uuid, text, text, jsonb) to service_role;

commit;
