begin;

-- Every approved active Vendor starts on the permanent Free tier. This
-- closes the gap where fallback previously covered only Vendors whose paid
-- subscription had expired, not brand-new Vendors with no subscription row.
create or replace function private.assign_vendor_free_subscription(target_vendor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  fallback_plan_id uuid;
  result_id uuid;
begin
  if not exists (
    select 1 from public.vendors vendor
    where vendor.id = target_vendor_id
      and vendor.is_verified
      and coalesce(vendor.management_status, 'active') = 'active'
  ) then
    return null;
  end if;

  select id into result_id
  from public.vendor_subscriptions
  where vendor_id = target_vendor_id
    and status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended')
  order by updated_at desc
  limit 1;
  if result_id is not null then return result_id; end if;

  select id into fallback_plan_id
  from public.subscription_plans
  where is_permanent and status = 'active' and archived_at is null
  order by display_order, created_at
  limit 1;
  if fallback_plan_id is null then return null; end if;

  insert into public.vendor_subscriptions(
    vendor_id, plan_id, status, access_source, start_date, expiry_date, metadata
  ) values (
    target_vendor_id, fallback_plan_id, 'active', 'free_fallback', now(), null,
    jsonb_build_object('automatic_free_assignment', true)
  )
  returning id into result_id;

  update public.vendors set subscription_status = 'active', updated_at = now()
  where id = target_vendor_id;
  return result_id;
exception when unique_violation then
  select id into result_id from public.vendor_subscriptions
  where vendor_id = target_vendor_id
    and status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended')
  order by updated_at desc limit 1;
  return result_id;
end;
$$;

revoke all on function private.assign_vendor_free_subscription(uuid) from public, anon, authenticated;

create or replace function private.assign_vendor_free_subscription_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assign_vendor_free_subscription(new.id);
  return new;
end;
$$;

drop trigger if exists vendors_assign_free_subscription on public.vendors;
create trigger vendors_assign_free_subscription
after insert or update of is_verified, management_status on public.vendors
for each row execute function private.assign_vendor_free_subscription_trigger();

select private.assign_vendor_free_subscription(vendor.id)
from public.vendors vendor
where vendor.is_verified and coalesce(vendor.management_status, 'active') = 'active';

-- Paid-plan trials now honor the selected Monthly/Yearly option. A Vendor's
-- automatic Free row is promoted into the trial rather than causing the old
-- "a subscription already exists" rejection or violating the one-current-row
-- index. Free itself never offers a trial.
drop function if exists public.claim_my_subscription_trial(uuid);

create or replace function public.claim_my_subscription_trial(
  target_plan_id uuid,
  target_billing_option_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid;
  plan public.subscription_plans%rowtype;
  billing_option public.subscription_plan_billing_options%rowtype;
  current_subscription public.vendor_subscriptions%rowtype;
  resolved_trial_days integer;
  resolved_grace_days integer;
  result_id uuid;
begin
  target_vendor_id := private.subscription_vendor_for_user();
  if target_vendor_id is null then raise exception 'Vendor access required'; end if;
  if not private.subscription_setting_boolean('subscription_free_trial_enabled', false) then
    raise exception 'Free trials are not enabled';
  end if;

  select * into plan from public.subscription_plans
  where id = target_plan_id and status = 'active' and archived_at is null;
  if not found or plan.is_permanent then raise exception 'This plan does not include a free trial'; end if;

  if target_billing_option_id is not null then
    select * into billing_option from public.subscription_plan_billing_options
    where id = target_billing_option_id and plan_id = target_plan_id and is_active;
    if not found then raise exception 'This billing option is not available'; end if;
    if not billing_option.trial_enabled then raise exception 'This billing option does not include a free trial'; end if;
    resolved_trial_days := billing_option.trial_days;
    resolved_grace_days := billing_option.grace_period_days;
  else
    if not plan.trial_enabled then raise exception 'This plan does not include a free trial'; end if;
    resolved_trial_days := plan.trial_days;
    resolved_grace_days := plan.grace_period_days;
  end if;

  if resolved_trial_days <= 0 then raise exception 'Free trial duration is not configured'; end if;
  if exists (
    select 1 from public.vendor_subscriptions
    where vendor_id = target_vendor_id and access_source = 'free_trial'
  ) then raise exception 'A free trial has already been used for this Vendor'; end if;

  select * into current_subscription
  from public.vendor_subscriptions
  where vendor_id = target_vendor_id
    and status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended','deactivated')
  order by updated_at desc limit 1 for update;

  if current_subscription.id is not null
    and current_subscription.access_source not in ('free_fallback','admin_grant')
  then raise exception 'An active subscription already exists for this Vendor'; end if;

  if current_subscription.id is null then
    insert into public.vendor_subscriptions(
      vendor_id, plan_id, billing_option_id, status, access_source, start_date,
      expiry_date, trial_start_date, trial_end_date, grace_period_end_date, metadata
    ) values (
      target_vendor_id, target_plan_id, target_billing_option_id, 'trial', 'free_trial', now(),
      now() + make_interval(days => resolved_trial_days), now(),
      now() + make_interval(days => resolved_trial_days),
      now() + make_interval(days => resolved_trial_days + resolved_grace_days),
      jsonb_build_object('self_claimed', true)
    ) returning id into result_id;
  else
    update public.vendor_subscriptions set
      plan_id = target_plan_id,
      billing_option_id = target_billing_option_id,
      status = 'trial',
      access_source = 'free_trial',
      start_date = now(),
      expiry_date = now() + make_interval(days => resolved_trial_days),
      trial_start_date = now(),
      trial_end_date = now() + make_interval(days => resolved_trial_days),
      grace_period_end_date = now() + make_interval(days => resolved_trial_days + resolved_grace_days),
      metadata = metadata || jsonb_build_object('self_claimed', true),
      updated_at = now()
    where id = current_subscription.id
    returning id into result_id;
  end if;

  insert into public.subscription_events(
    vendor_id, subscription_id, event_type, new_status, performed_by,
    performed_by_role, metadata
  ) values (
    target_vendor_id, result_id, 'trial_started', 'trial', auth.uid(), 'vendor',
    jsonb_build_object('trial_days', resolved_trial_days, 'billing_option_id', target_billing_option_id)
  );
  update public.vendors set subscription_status = 'active', updated_at = now()
  where id = target_vendor_id;
  return result_id;
end;
$$;

revoke all on function public.claim_my_subscription_trial(uuid, uuid) from public, anon;
grant execute on function public.claim_my_subscription_trial(uuid, uuid) to authenticated;

-- Snapshot-aware normalized entitlement map consumed together with
-- get_my_subscription_access. Keeping feature resolution in SQL prevents
-- the client from re-implementing plan rules or reading stale master-plan
-- permissions for an already-paid snapshot.
create or replace function public.get_my_subscription_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with vendor as (
    select private.subscription_vendor_for_user() id
  )
  select coalesce(jsonb_object_agg(
    definition.feature_key,
    jsonb_build_object(
      'enabled', coalesce(resolved.is_enabled, false),
      'limit', resolved.limit_value
    )
  ), '{}'::jsonb)
  from vendor
  join public.subscription_feature_definitions definition on definition.is_active
  left join lateral private.subscription_effective_feature(
    vendor.id, definition.feature_key, now()
  ) resolved on true
  where vendor.id is not null;
$$;

revoke all on function public.get_my_subscription_entitlements() from public, anon;
grant execute on function public.get_my_subscription_entitlements() to authenticated;

commit;
