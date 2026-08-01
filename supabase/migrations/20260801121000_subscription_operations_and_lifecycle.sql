begin;

create or replace function public.admin_manage_vendor_subscription(
  target_vendor_id uuid,
  requested_action text,
  payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  action text := lower(btrim(requested_action));
  current_subscription public.vendor_subscriptions%rowtype;
  selected_plan public.subscription_plans%rowtype;
  selected_plan_id uuid;
  previous_status text;
  next_status text;
  result_id uuid;
  days_to_apply integer;
  requested_expiry timestamptz;
  requested_start timestamptz := coalesce((payload->>'start_date')::timestamptz, now());
  grant_source text := coalesce(nullif(payload->>'access_source', ''), 'admin_grant');
  note text := nullif(btrim(payload->>'admin_notes'), '');
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendors where id = target_vendor_id) then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;

  select * into current_subscription
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = target_vendor_id
  order by
    case when subscription.status in (
      'pending', 'trial', 'launch_offer', 'active', 'past_due',
      'grace_period', 'suspended'
    ) then 0 else 1 end,
    subscription.updated_at desc
  limit 1
  for update;
  previous_status := current_subscription.status;

  if payload ? 'plan_id' and nullif(payload->>'plan_id', '') is not null then
    selected_plan_id := (payload->>'plan_id')::uuid;
  else
    selected_plan_id := coalesce(
      current_subscription.plan_id,
      private.subscription_setting_uuid('subscription_default_plan_id')
    );
  end if;
  if selected_plan_id is not null then
    select * into selected_plan from public.subscription_plans where id = selected_plan_id;
    if not found then raise exception 'Subscription plan not found'; end if;
  end if;

  if payload ? 'days' then days_to_apply := (payload->>'days')::integer; end if;
  if payload ? 'expiry_date' and nullif(payload->>'expiry_date', '') is not null then
    requested_expiry := (payload->>'expiry_date')::timestamptz;
  end if;

  if action in ('grant_free', 'grant_access') then
    if requested_expiry is null and days_to_apply is not null then
      requested_expiry := requested_start + make_interval(days => greatest(days_to_apply, 1));
    end if;
    if current_subscription.id is null then
      insert into public.vendor_subscriptions(
        vendor_id, plan_id, status, access_source, start_date, expiry_date,
        grace_period_end_date, admin_grant, admin_notes, created_by, updated_by
      ) values (
        target_vendor_id, selected_plan_id, 'active', grant_source,
        requested_start, requested_expiry,
        case when requested_expiry is null then null else requested_expiry
          + make_interval(days => coalesce(selected_plan.grace_period_days, 0)) end,
        true, note, auth.uid(), auth.uid()
      ) returning id into result_id;
    else
      update public.vendor_subscriptions set
        plan_id = selected_plan_id,
        offer_id = null,
        status = 'active',
        access_source = grant_source,
        start_date = requested_start,
        expiry_date = requested_expiry,
        trial_start_date = null,
        trial_end_date = null,
        launch_offer_start_date = null,
        launch_offer_end_date = null,
        grace_period_end_date = case when requested_expiry is null then null else requested_expiry
          + make_interval(days => coalesce(selected_plan.grace_period_days, 0)) end,
        cancelled_at = null,
        cancellation_reason = null,
        suspended_at = null,
        admin_grant = true,
        admin_notes = coalesce(note, admin_notes),
        updated_by = auth.uid()
      where id = current_subscription.id returning id into result_id;
    end if;
    next_status := 'active';

  elsif action in ('grant_trial', 'start_trial') then
    days_to_apply := coalesce(days_to_apply, nullif(selected_plan.trial_days, 0), private.subscription_setting_integer('subscription_free_trial_days', 0));
    if days_to_apply <= 0 then raise exception 'Trial duration must be greater than zero'; end if;
    requested_expiry := requested_start + make_interval(days => days_to_apply);
    if current_subscription.id is null then
      insert into public.vendor_subscriptions(
        vendor_id, plan_id, status, access_source, start_date, expiry_date,
        trial_start_date, trial_end_date, grace_period_end_date,
        admin_notes, created_by, updated_by
      ) values (
        target_vendor_id, selected_plan_id, 'trial', 'free_trial',
        requested_start, requested_expiry, requested_start, requested_expiry,
        requested_expiry + make_interval(days => coalesce(selected_plan.grace_period_days, 0)),
        note, auth.uid(), auth.uid()
      ) returning id into result_id;
    else
      update public.vendor_subscriptions set
        plan_id = selected_plan_id,
        status = 'trial', access_source = 'free_trial',
        start_date = requested_start, expiry_date = requested_expiry,
        trial_start_date = requested_start, trial_end_date = requested_expiry,
        grace_period_end_date = requested_expiry
          + make_interval(days => coalesce(selected_plan.grace_period_days, 0)),
        cancelled_at = null, cancellation_reason = null, suspended_at = null,
        admin_grant = false, admin_notes = coalesce(note, admin_notes),
        updated_by = auth.uid()
      where id = current_subscription.id returning id into result_id;
    end if;
    next_status := 'trial';

  elsif action in ('extend', 'shorten') then
    if current_subscription.id is null then raise exception 'Subscription not found'; end if;
    if days_to_apply is null or days_to_apply = 0 then
      raise exception 'A non-zero day adjustment is required';
    end if;
    if action = 'extend' and days_to_apply < 0 then days_to_apply := abs(days_to_apply); end if;
    if action = 'shorten' and days_to_apply > 0 then days_to_apply := -days_to_apply; end if;
    requested_expiry := coalesce(current_subscription.expiry_date, now())
      + make_interval(days => days_to_apply);
    if requested_expiry <= now() and not coalesce((payload->>'allow_expired')::boolean, false) then
      raise exception 'The adjusted expiry would be in the past';
    end if;
    update public.vendor_subscriptions set
      expiry_date = requested_expiry,
      trial_end_date = case when status = 'trial' then requested_expiry else trial_end_date end,
      launch_offer_end_date = case when status = 'launch_offer' then requested_expiry else launch_offer_end_date end,
      grace_period_end_date = requested_expiry
        + make_interval(days => coalesce(selected_plan.grace_period_days, 0)),
      access_source = 'manual_extension',
      admin_notes = coalesce(note, admin_notes),
      updated_by = auth.uid()
    where id = current_subscription.id returning id, status into result_id, next_status;

  elsif action = 'set_expiry' then
    if current_subscription.id is null then raise exception 'Subscription not found'; end if;
    if requested_expiry is null then raise exception 'An expiry date is required'; end if;
    update public.vendor_subscriptions set
      expiry_date = requested_expiry,
      trial_end_date = case when status = 'trial' then requested_expiry else trial_end_date end,
      launch_offer_end_date = case when status = 'launch_offer' then requested_expiry else launch_offer_end_date end,
      grace_period_end_date = requested_expiry
        + make_interval(days => coalesce(selected_plan.grace_period_days, 0)),
      admin_notes = coalesce(note, admin_notes),
      updated_by = auth.uid()
    where id = current_subscription.id returning id, status into result_id, next_status;

  elsif action = 'change_plan' then
    if current_subscription.id is null then raise exception 'Subscription not found'; end if;
    if selected_plan.id is null then raise exception 'A valid plan is required'; end if;
    update public.vendor_subscriptions set
      plan_id = selected_plan.id,
      admin_notes = coalesce(note, admin_notes),
      updated_by = auth.uid()
    where id = current_subscription.id returning id, status into result_id, next_status;

  elsif action in ('suspend', 'cancel', 'deactivate', 'reactivate') then
    if current_subscription.id is null then raise exception 'Subscription not found'; end if;
    next_status := case action
      when 'suspend' then 'suspended'
      when 'cancel' then 'cancelled'
      when 'deactivate' then 'deactivated'
      else case
        when current_subscription.expiry_date is null or current_subscription.expiry_date > now() then 'active'
        when current_subscription.grace_period_end_date > now() then 'grace_period'
        else 'expired'
      end
    end;
    update public.vendor_subscriptions set
      status = next_status,
      suspended_at = case when action = 'suspend' then now() else null end,
      cancelled_at = case when action in ('cancel', 'deactivate') then now() else null end,
      cancellation_reason = case when action in ('cancel', 'deactivate')
        then coalesce(nullif(payload->>'reason', ''), cancellation_reason)
        else null end,
      admin_notes = coalesce(note, admin_notes),
      updated_by = auth.uid()
    where id = current_subscription.id returning id into result_id;
  else
    raise exception 'Unsupported subscription action';
  end if;

  insert into public.subscription_events(
    vendor_id, subscription_id, event_type, previous_status, new_status,
    performed_by, performed_by_role, reason, metadata
  ) values (
    target_vendor_id, result_id, action, previous_status, next_status,
    auth.uid(), 'admin', coalesce(nullif(payload->>'reason', ''), note), payload
  );

  if action in ('grant_free', 'grant_access', 'grant_trial', 'start_trial', 'extend', 'reactivate') then
    insert into public.vendor_notifications(vendor_id, title, body, kind)
    values (
      target_vendor_id,
      case
        when action in ('grant_trial', 'start_trial') then 'Your RoyalLagn trial is active'
        when action = 'extend' then 'Your RoyalLagn access was extended'
        when action = 'reactivate' then 'Your RoyalLagn access was reactivated'
        else 'RoyalLagn access granted'
      end,
      case when requested_expiry is null
        then 'An administrator granted access to your Vendor subscription features.'
        else 'Your Vendor subscription access is available until ' || to_char(requested_expiry at time zone 'UTC', 'DD Mon YYYY') || '.'
      end,
      'subscription'
    );
  end if;

  update public.vendors set
    subscription_status = case
      when next_status in ('active', 'trial', 'launch_offer', 'grace_period') then 'active'::public.subscription_status
      when next_status = 'cancelled' then 'cancelled'::public.subscription_status
      when next_status in ('expired', 'suspended', 'deactivated') then 'expired'::public.subscription_status
      else subscription_status
    end,
    updated_at = now()
  where id = target_vendor_id;

  return result_id;
end;
$$;

create or replace function public.admin_list_vendor_subscriptions(
  search_text text default null,
  status_filter text default null,
  plan_filter uuid default null,
  page_size integer default 50,
  page_offset integer default 0
) returns table (
  vendor_id uuid,
  business_name text,
  owner_name text,
  email text,
  phone text,
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  status text,
  access_source text,
  start_date timestamptz,
  expiry_date timestamptz,
  days_remaining integer,
  last_payment_status text,
  last_payment_amount numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select
      vendor.id vendor_id,
      vendor.business_name,
      vendor.owner_name,
      coalesce(vendor.contact_email, profile.email) email,
      coalesce(vendor.contact_phone, profile.phone) phone,
      subscription.id subscription_id,
      subscription.plan_id,
      plan.name plan_name,
      coalesce(subscription.status, 'expired') status,
      subscription.access_source,
      subscription.start_date,
      subscription.expiry_date,
      case when subscription.expiry_date is null then null else
        greatest(0, ceil(extract(epoch from (subscription.expiry_date - now())) / 86400.0)::integer)
      end days_remaining,
      payment.payment_status last_payment_status,
      payment.amount last_payment_amount
    from public.vendors vendor
    left join public.profiles profile on profile.id = vendor.profile_id
    left join lateral (
      select candidate.* from public.vendor_subscriptions candidate
      where candidate.vendor_id = vendor.id
      order by
        case when candidate.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended') then 0 else 1 end,
        candidate.updated_at desc
      limit 1
    ) subscription on true
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    left join lateral (
      select candidate.payment_status, candidate.amount
      from public.subscription_payments candidate
      where candidate.vendor_id = vendor.id
      order by candidate.created_at desc limit 1
    ) payment on true
    where private.is_admin()
  ), filtered as (
    select * from rows row
    where (
      nullif(btrim(search_text), '') is null
      or row.business_name ilike '%' || btrim(search_text) || '%'
      or row.owner_name ilike '%' || btrim(search_text) || '%'
      or row.email ilike '%' || btrim(search_text) || '%'
      or row.phone ilike '%' || btrim(search_text) || '%'
      or row.vendor_id::text = btrim(search_text)
    )
    and (status_filter is null or status_filter = 'all' or row.status = status_filter)
    and (plan_filter is null or row.plan_id = plan_filter)
  )
  select filtered.*, count(*) over ()
  from filtered
  order by expiry_date asc nulls last, business_name asc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0);
$$;

create or replace function public.admin_subscription_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_admin() then jsonb_build_object(
    'total_vendors', (select count(*) from public.vendors),
    'active', (select count(*) from public.vendor_subscriptions where status = 'active'),
    'trial', (select count(*) from public.vendor_subscriptions where status = 'trial'),
    'launch_offer', (select count(*) from public.vendor_subscriptions where status = 'launch_offer'),
    'grace_period', (select count(*) from public.vendor_subscriptions where status = 'grace_period'),
    'expired', (select count(*) from public.vendor_subscriptions where status = 'expired'),
    'suspended', (select count(*) from public.vendor_subscriptions where status = 'suspended'),
    'verified_revenue', (select coalesce(sum(amount), 0) from public.subscription_payments where payment_status = 'verified'),
    'failed_payments', (select count(*) from public.subscription_payments where payment_status = 'failed')
  ) else null end;
$$;

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
  renewal_start timestamptz;
  renewal_end timestamptz;
  result_subscription_id uuid;
  event_name text;
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

  if current_subscription.id is null then
    insert into public.vendor_subscriptions(
      vendor_id, plan_id, offer_id, status, access_source,
      start_date, expiry_date, grace_period_end_date,
      last_payment_id, auto_renew, metadata
    ) values (
      payment.vendor_id, payment.plan_id, payment.offer_id, 'active', 'paid_subscription',
      renewal_start, renewal_end,
      renewal_end + make_interval(days => plan.grace_period_days),
      payment.id, false, jsonb_build_object('activated_by', 'verified_payment')
    ) returning id into result_subscription_id;
    event_name := 'subscription_activated';
  else
    update public.vendor_subscriptions set
      plan_id = payment.plan_id,
      offer_id = payment.offer_id,
      status = 'active',
      access_source = 'paid_subscription',
      start_date = case
        when current_subscription.status in ('active', 'grace_period', 'past_due') then current_subscription.start_date
        else renewal_start
      end,
      expiry_date = renewal_end,
      grace_period_end_date = renewal_end + make_interval(days => plan.grace_period_days),
      trial_start_date = null,
      trial_end_date = null,
      launch_offer_start_date = null,
      launch_offer_end_date = null,
      cancelled_at = null,
      cancellation_reason = null,
      suspended_at = null,
      admin_grant = false,
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
    'Your RoyalLagn Vendor access is active until ' || to_char(renewal_end at time zone 'UTC', 'DD Mon YYYY') || '.',
    'subscription'
  );

  update public.vendors set subscription_status = 'active', updated_at = now()
  where id = payment.vendor_id;

  return result_subscription_id;
end;
$$;

create or replace function public.queue_subscription_reminders(
  run_at timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_count integer := 0;
  reminder record;
  log_id uuid;
  reminder_type text;
begin
  for reminder in
    select
      subscription.vendor_id,
      subscription.id subscription_id,
      subscription.status,
      greatest(0, ceil(extract(epoch from ((case subscription.status
        when 'trial' then coalesce(subscription.trial_end_date, subscription.expiry_date)
        when 'launch_offer' then coalesce(subscription.launch_offer_end_date, subscription.expiry_date)
        when 'grace_period' then subscription.grace_period_end_date
        else subscription.expiry_date
      end) - run_at)) / 86400.0)::integer) days_left
    from public.vendor_subscriptions subscription
    where subscription.status in ('trial','launch_offer','active','past_due','grace_period')
      and case subscription.status
        when 'trial' then coalesce(subscription.trial_end_date, subscription.expiry_date)
        when 'launch_offer' then coalesce(subscription.launch_offer_end_date, subscription.expiry_date)
        when 'grace_period' then subscription.grace_period_end_date
        else subscription.expiry_date
      end is not null
  loop
    if reminder.days_left not in (0, 1, 3, 7) then continue; end if;
    reminder_type := case
      when reminder.status = 'trial' then 'trial_ending'
      when reminder.status = 'launch_offer' then 'offer_ending'
      when reminder.status = 'grace_period' then 'grace_period_ending'
      when reminder.days_left = 0 then 'expiry_day'
      else 'expiry_' || reminder.days_left::text || '_days'
    end;
    log_id := null;
    insert into public.subscription_notification_log(
      vendor_id, subscription_id, notification_type, scheduled_for, metadata
    ) values (
      reminder.vendor_id, reminder.subscription_id, reminder_type, run_at::date,
      jsonb_build_object('days_remaining', reminder.days_left, 'status', reminder.status)
    )
    on conflict (vendor_id, notification_type, scheduled_for) do nothing
    returning id into log_id;
    if log_id is null then continue; end if;

    insert into public.vendor_notifications(vendor_id, title, body, kind)
    values (
      reminder.vendor_id,
      case reminder_type
        when 'trial_ending' then 'Your free trial is ending soon'
        when 'offer_ending' then 'Your launch offer is ending soon'
        when 'grace_period_ending' then 'Your grace period is ending soon'
        when 'expiry_day' then 'Your RoyalLagn access expires today'
        else 'Your RoyalLagn subscription expires soon'
      end,
      case
        when reminder.days_left = 0 then 'Review your plans to continue using premium Vendor tools.'
        else 'Your current access ends in ' || reminder.days_left::text || ' day(s). Review your plan to continue without interruption.'
      end,
      'subscription'
    );
    update public.subscription_notification_log set
      delivery_status = 'sent', delivered_at = run_at, updated_at = run_at
    where id = log_id;
    queued_count := queued_count + 1;
  end loop;
  return queued_count;
end;
$$;

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
  launch_start timestamptz;
  launch_end timestamptz;
  launch_plan uuid;
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

  -- Queue the expiry-day message before changing a due subscription to grace
  -- or expired; the notification log keeps repeated scheduler calls safe.
  reminder_count := public.queue_subscription_reminders(run_at);

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
    where subscription.status in ('trial','launch_offer','active','past_due','grace_period')
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
    'grace_periods_started', grace_started,
    'subscriptions_expired', expired_count,
    'stale_payments_failed', stale_payments,
    'reminders_queued', reminder_count,
    'processed_at', run_at
  );
end;
$$;

revoke all on function public.admin_manage_vendor_subscription(uuid, text, jsonb) from public, anon;
revoke all on function public.admin_list_vendor_subscriptions(text, text, uuid, integer, integer) from public, anon;
revoke all on function public.admin_subscription_metrics() from public, anon;
grant execute on function public.admin_manage_vendor_subscription(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_list_vendor_subscriptions(text, text, uuid, integer, integer) to authenticated;
grant execute on function public.admin_subscription_metrics() to authenticated;

revoke all on function public.activate_verified_subscription_payment(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.queue_subscription_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.process_subscription_lifecycle(timestamptz) from public, anon, authenticated;
grant execute on function public.activate_verified_subscription_payment(uuid, text, text, jsonb) to service_role;
grant execute on function public.queue_subscription_reminders(timestamptz) to service_role;
grant execute on function public.process_subscription_lifecycle(timestamptz) to service_role;

commit;
