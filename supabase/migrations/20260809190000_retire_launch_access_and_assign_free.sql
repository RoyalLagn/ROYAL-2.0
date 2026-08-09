begin;

-- Launch access was a temporary rollout mechanism. Retire it permanently,
-- while retaining its rows as immutable history for audits and reporting.
update public.application_settings
set value = 'false'::jsonb,
    description = 'Retired. Verified Vendors receive the permanent Free tier instead.',
    updated_at = now()
where key in (
  'subscription_launch_offer_enabled',
  'subscription_launch_offer_auto_activation'
);

-- Free is the only default/baseline plan. Paid plans are selected explicitly
-- by checkout or an administrator and are never overwritten by this migration.
update public.application_settings
set value = to_jsonb((
      select plan.id::text
      from public.subscription_plans plan
      where lower(plan.slug) = 'free'
        and plan.status = 'active'
        and plan.archived_at is null
      limit 1
    )),
    description = 'Permanent Free plan automatically assigned to eligible Vendors.',
    updated_at = now()
where key = 'subscription_default_plan_id';

-- Keep the former rows for history, but make sure none can still grant access.
create temporary table launch_access_retired on commit drop as
select subscription.id, subscription.vendor_id, subscription.status as previous_status
from public.vendor_subscriptions subscription
where (
    subscription.status = 'launch_offer'
    or subscription.access_source = 'launch_offer'
  )
  and subscription.status in (
    'pending', 'trial', 'launch_offer', 'active', 'past_due',
    'grace_period', 'cancelled'
  );

update public.vendor_subscriptions subscription
set status = 'expired',
    expiry_date = case
      when subscription.expiry_date is null or subscription.expiry_date > now() then now()
      else subscription.expiry_date
    end,
    grace_period_end_date = null,
    launch_offer_end_date = case
      when subscription.launch_offer_end_date is null or subscription.launch_offer_end_date > now() then now()
      else subscription.launch_offer_end_date
    end,
    metadata = subscription.metadata || jsonb_build_object(
      'launch_access_retired', true,
      'launch_access_retired_at', now()
    ),
    updated_at = now()
from launch_access_retired retired
where subscription.id = retired.id;

insert into public.subscription_events(
  vendor_id, subscription_id, event_type, previous_status, new_status,
  performed_by_role, reason, metadata
)
select
  retired.vendor_id, retired.id, 'launch_access_retired',
  retired.previous_status, 'expired', 'system',
  'Launch access retired; permanent Free tier is now the Vendor baseline.',
  jsonb_build_object('replacement_tier', 'free')
from launch_access_retired retired;

-- A valid paid plan or trial wins over Free. Suspension/deactivation also wins,
-- so the baseline assignment can never bypass an administrative restriction.
-- A cancelled paid plan remains effective until its already-paid period ends.
create or replace function private.assign_vendor_free_subscription(target_vendor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  free_plan_id uuid;
  result_id uuid;
begin
  if not exists (
    select 1
    from public.vendors vendor
    left join public.profiles profile on profile.id = vendor.profile_id
    where vendor.id = target_vendor_id
      and vendor.is_verified
      and coalesce(vendor.management_status, 'active') = 'active'
      and (vendor.profile_id is null or profile.is_active)
  ) then
    return null;
  end if;

  select subscription.id into result_id
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = target_vendor_id
    and (
      subscription.status in (
        'pending', 'trial', 'active', 'past_due', 'grace_period',
        'suspended', 'deactivated'
      )
      or (
        subscription.status = 'cancelled'
        and subscription.expiry_date is not null
        and subscription.expiry_date > now()
      )
    )
  order by subscription.updated_at desc
  limit 1;

  if result_id is not null then
    return result_id;
  end if;

  select plan.id into free_plan_id
  from public.subscription_plans plan
  where lower(plan.slug) = 'free'
    and plan.is_permanent
    and plan.status = 'active'
    and plan.archived_at is null
  limit 1;

  if free_plan_id is null then
    raise exception 'Active permanent Free subscription plan is missing';
  end if;

  insert into public.vendor_subscriptions(
    vendor_id, plan_id, status, access_source, start_date, expiry_date, metadata
  ) values (
    target_vendor_id, free_plan_id, 'active', 'free_fallback', now(), null,
    jsonb_build_object('automatic_free_assignment', true, 'baseline_tier', true)
  )
  returning id into result_id;

  insert into public.subscription_events(
    vendor_id, subscription_id, event_type, new_status, performed_by_role,
    reason, metadata
  ) values (
    target_vendor_id, result_id, 'free_tier_assigned', 'active', 'system',
    'Automatic permanent Free baseline assigned.',
    jsonb_build_object('plan_slug', 'free')
  );

  update public.vendors
  set subscription_status = 'active', updated_at = now()
  where id = target_vendor_id;

  return result_id;
exception
  when unique_violation then
    select subscription.id into result_id
    from public.vendor_subscriptions subscription
    where subscription.vendor_id = target_vendor_id
      and subscription.status in (
        'pending', 'trial', 'active', 'past_due', 'grace_period',
        'suspended', 'deactivated'
      )
    order by subscription.updated_at desc
    limit 1;
    return result_id;
end;
$$;

revoke all on function private.assign_vendor_free_subscription(uuid) from public, anon, authenticated;

-- Do the one-time conversion after retiring launch rows. Existing valid paid,
-- trial, suspended, or deactivated subscriptions are deliberately untouched.
select private.assign_vendor_free_subscription(vendor.id)
from public.vendors vendor
where vendor.is_verified
  and coalesce(vendor.management_status, 'active') = 'active';

-- Guard the business rule at the database boundary. Historical expired launch
-- rows remain readable, but new/reactivated launch entitlements are rejected.
create or replace function private.block_retired_launch_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    and (new.status = 'launch_offer' or new.access_source = 'launch_offer')
  then
    raise exception 'Launch access is retired; assign Free, trial, paid, or admin access instead';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.status = 'launch_offer'
      or (
        new.access_source = 'launch_offer'
        and new.status in (
          'pending', 'trial', 'active', 'past_due', 'grace_period',
          'cancelled', 'suspended'
        )
      )
    )
  then
    raise exception 'Retired launch access cannot be reactivated';
  end if;

  return new;
end;
$$;

drop trigger if exists vendor_subscriptions_block_retired_launch_access
on public.vendor_subscriptions;
create trigger vendor_subscriptions_block_retired_launch_access
before insert or update of status, access_source on public.vendor_subscriptions
for each row execute function private.block_retired_launch_access();

create or replace function private.block_launch_offer_reenable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key in (
      'subscription_launch_offer_enabled',
      'subscription_launch_offer_auto_activation'
    )
    and lower(coalesce(new.value #>> '{}', 'false')) = 'true'
  then
    raise exception 'Launch access is retired; permanent Free is the Vendor baseline';
  end if;
  return new;
end;
$$;

drop trigger if exists application_settings_block_launch_offer_reenable
on public.application_settings;
create trigger application_settings_block_launch_offer_reenable
before insert or update of value on public.application_settings
for each row execute function private.block_launch_offer_reenable();

commit;
