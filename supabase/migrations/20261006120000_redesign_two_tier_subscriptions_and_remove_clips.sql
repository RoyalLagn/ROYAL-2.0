begin;

-- =====================================================================
-- Redesign Subscription Platform to exactly 2 active tiers:
-- 1. Free: Rs 0/mo, 15 photos (3 albums, 5 photos per album)
-- 2. Premium: Rs 499/mo, 50 photos (5 albums, 10 photos per album)
-- Disable/remove clips across all tiers.
-- =====================================================================

-- 1. Ensure Free plan exists and is configured for 15 photos
insert into public.subscription_plans(
  name, slug, description, price, currency, billing_interval,
  billing_interval_count, trial_enabled, trial_days, grace_period_days,
  is_active, is_featured, display_order, status, is_permanent, metadata,
  max_image_upload_mb, stored_image_target_mb, max_clip_upload_mb, stored_clip_target_mb, clip_delivery_target_mb
)
select
  'Free', 'free', '15 photos across 3 albums (5 photos per album) for essential vendor presence.',
  0, 'INR', 'month', 1, false, 0, 0, true, false, 0, 'active', true,
  jsonb_build_object('seeded', true),
  8, 4, null, null, null
where not exists (select 1 from public.subscription_plans where lower(slug) = 'free');

update public.subscription_plans
set
  name = 'Free',
  description = '15 photos across 3 albums (5 photos per album) for essential vendor presence.',
  price = 0,
  discounted_price = null,
  currency = 'INR',
  billing_interval = 'month',
  billing_interval_count = 1,
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = 0,
  is_active = true,
  is_featured = false,
  display_order = 0,
  status = 'active',
  is_permanent = true,
  archived_at = null,
  max_image_upload_mb = 8,
  stored_image_target_mb = 4,
  max_clip_upload_mb = null,
  stored_clip_target_mb = null,
  clip_delivery_target_mb = null
where lower(slug) = 'free';

-- 2. Ensure Premium plan exists and is configured for 50 photos at Rs 499
insert into public.subscription_plans(
  name, slug, description, price, currency, billing_interval,
  billing_interval_count, trial_enabled, trial_days, grace_period_days,
  is_active, is_featured, display_order, status, is_permanent, metadata,
  max_image_upload_mb, stored_image_target_mb, max_clip_upload_mb, stored_clip_target_mb, clip_delivery_target_mb
)
select
  'Premium', 'premium', '50 photos across 5 albums (10 photos per album) with featured marketplace visibility.',
  499.00, 'INR', 'month', 1, false, 0, 3, true, true, 10, 'active', false,
  jsonb_build_object('seeded', true),
  15, 6, null, null, null
where not exists (select 1 from public.subscription_plans where lower(slug) = 'premium');

update public.subscription_plans
set
  name = 'Premium',
  description = '50 photos across 5 albums (10 photos per album) with featured marketplace visibility.',
  price = 499.00,
  discounted_price = null,
  currency = 'INR',
  billing_interval = 'month',
  billing_interval_count = 1,
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = 3,
  is_active = true,
  is_featured = true,
  display_order = 10,
  status = 'active',
  is_permanent = false,
  archived_at = null,
  max_image_upload_mb = 15,
  stored_image_target_mb = 6,
  max_clip_upload_mb = null,
  stored_clip_target_mb = null,
  clip_delivery_target_mb = null
where lower(slug) = 'premium';

-- 3. Archive/hide any other plans (e.g. silver, elite, etc.)
update public.subscription_plans
set
  is_active = false,
  status = 'archived',
  archived_at = coalesce(archived_at, now())
where lower(slug) not in ('free', 'premium');

-- 4. Set up billing options for Free (Rs 0/mo) and Premium (Rs 499/mo)
insert into public.subscription_plan_billing_options(
  plan_id, billing_interval, interval_count, price, discounted_price, discount_percentage,
  currency, trial_enabled, trial_days, grace_period_days, is_active, display_order
)
select
  plan.id, 'month', 1, 0, null, 0, 'INR', false, 0, 0, true, 0
from public.subscription_plans plan
where lower(plan.slug) = 'free'
  and not exists (
    select 1 from public.subscription_plan_billing_options opt
    where opt.plan_id = plan.id and opt.billing_interval = 'month'
  );

update public.subscription_plan_billing_options option
set
  price = 0,
  discounted_price = null,
  discount_percentage = 0,
  currency = 'INR',
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = 0,
  is_active = true
from public.subscription_plans plan
where option.plan_id = plan.id and lower(plan.slug) = 'free';

insert into public.subscription_plan_billing_options(
  plan_id, billing_interval, interval_count, price, discounted_price, discount_percentage,
  currency, trial_enabled, trial_days, grace_period_days, is_active, display_order
)
select
  plan.id, 'month', 1, 499.00, null, 0, 'INR', false, 0, 3, true, 0
from public.subscription_plans plan
where lower(plan.slug) = 'premium'
  and not exists (
    select 1 from public.subscription_plan_billing_options opt
    where opt.plan_id = plan.id and opt.billing_interval = 'month'
  );

update public.subscription_plan_billing_options option
set
  price = 499.00,
  discounted_price = null,
  discount_percentage = 0,
  currency = 'INR',
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = 3,
  is_active = true
from public.subscription_plans plan
where option.plan_id = plan.id and lower(plan.slug) = 'premium' and option.billing_interval = 'month';

-- Deactivate billing options for non-active plans
update public.subscription_plan_billing_options option
set is_active = false
from public.subscription_plans plan
where option.plan_id = plan.id and lower(plan.slug) not in ('free', 'premium');

-- 5. Set plan features
-- Free: 15 photos (upload_gallery limit = 15), upload_clips disabled
-- Premium: 50 photos (upload_gallery limit = 50), upload_clips disabled
insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select
  plan.id,
  feature.id,
  case
    when feature.feature_key = 'upload_clips' then false
    when feature.feature_key in (
      'vendor_dashboard_actions', 'edit_vendor_profile', 'upload_gallery',
      'manage_albums', 'view_analytics', 'receive_enquiries', 'manage_reviews'
    ) then true
    when feature.feature_key in ('featured_listing', 'priority_support') then lower(plan.slug) = 'premium'
    else coalesce(existing.is_enabled, false)
  end,
  case feature.feature_key
    when 'upload_gallery' then case lower(plan.slug) when 'free' then 15 when 'premium' then 50 end
    when 'upload_clips' then 0
    else existing.limit_value
  end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
left join public.subscription_plan_features existing
  on existing.plan_id = plan.id and existing.feature_id = feature.id
where lower(plan.slug) in ('free', 'premium')
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value;

-- Disable clips feature on all plans
update public.subscription_plan_features pf
set
  is_enabled = false,
  limit_value = 0
from public.subscription_feature_definitions fd
where pf.feature_id = fd.id and fd.feature_key = 'upload_clips';

-- 6. Migrate existing vendor subscriptions from Elite/Silver to Premium,
-- and refresh snapshots for Free and Premium.
do $$
declare
  premium_plan_id uuid;
  premium_billing_id uuid;
  free_plan_id uuid;
  free_billing_id uuid;
begin
  select id into premium_plan_id from public.subscription_plans where lower(slug) = 'premium' limit 1;
  select id into premium_billing_id from public.subscription_plan_billing_options where plan_id = premium_plan_id and billing_interval = 'month' limit 1;
  select id into free_plan_id from public.subscription_plans where lower(slug) = 'free' limit 1;
  select id into free_billing_id from public.subscription_plan_billing_options where plan_id = free_plan_id and billing_interval = 'month' limit 1;

  -- 6a. Reassign all vendors currently on Elite, Silver, or non-active plans to Premium
  update public.vendor_subscriptions
  set
    plan_id = premium_plan_id,
    billing_option_id = premium_billing_id,
    scheduled_plan_id = null,
    scheduled_billing_option_id = null,
    scheduled_change_at = null,
    plan_snapshot = jsonb_build_object(
      'plan_id', premium_plan_id,
      'plan_name', 'Premium',
      'price', 499,
      'currency', 'INR',
      'billing_interval', 'month',
      'billing_option_id', premium_billing_id,
      'trial_days', 0,
      'grace_period_days', 3,
      'media_policy', jsonb_build_object(
        'max_image_upload_mb', 15,
        'stored_image_target_mb', 6,
        'max_clip_upload_mb', null,
        'stored_clip_target_mb', null,
        'clip_delivery_target_mb', null
      ),
      'features', jsonb_build_object(
        'upload_gallery', jsonb_build_object('is_enabled', true, 'limit_value', 50),
        'upload_clips', jsonb_build_object('is_enabled', false, 'limit_value', 0),
        'manage_albums', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'manage_reviews', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'view_analytics', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'featured_listing', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'priority_support', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'receive_enquiries', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'edit_vendor_profile', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'vendor_dashboard_actions', jsonb_build_object('is_enabled', true, 'limit_value', null)
      )
    ),
    updated_at = now()
  where plan_id not in (free_plan_id, premium_plan_id)
     or lower(coalesce(plan_snapshot->>'plan_name', '')) not in ('free', 'premium');

  -- 6b. Update existing Premium vendor subscriptions' snapshots to 50 photos
  update public.vendor_subscriptions
  set
    plan_snapshot = jsonb_build_object(
      'plan_id', premium_plan_id,
      'plan_name', 'Premium',
      'price', 499,
      'currency', 'INR',
      'billing_interval', coalesce(plan_snapshot->>'billing_interval', 'month'),
      'billing_option_id', coalesce(billing_option_id, premium_billing_id),
      'trial_days', 0,
      'grace_period_days', 3,
      'media_policy', jsonb_build_object(
        'max_image_upload_mb', 15,
        'stored_image_target_mb', 6,
        'max_clip_upload_mb', null,
        'stored_clip_target_mb', null,
        'clip_delivery_target_mb', null
      ),
      'features', jsonb_build_object(
        'upload_gallery', jsonb_build_object('is_enabled', true, 'limit_value', 50),
        'upload_clips', jsonb_build_object('is_enabled', false, 'limit_value', 0),
        'manage_albums', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'manage_reviews', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'view_analytics', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'featured_listing', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'priority_support', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'receive_enquiries', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'edit_vendor_profile', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'vendor_dashboard_actions', jsonb_build_object('is_enabled', true, 'limit_value', null)
      )
    ),
    updated_at = now()
  where plan_id = premium_plan_id;

  -- 6c. Update Free vendor subscriptions' snapshots to 15 photos
  update public.vendor_subscriptions
  set
    plan_snapshot = jsonb_build_object(
      'plan_id', free_plan_id,
      'plan_name', 'Free',
      'price', 0,
      'currency', 'INR',
      'billing_interval', 'month',
      'billing_option_id', coalesce(billing_option_id, free_billing_id),
      'trial_days', 0,
      'grace_period_days', 0,
      'media_policy', jsonb_build_object(
        'max_image_upload_mb', 8,
        'stored_image_target_mb', 4,
        'max_clip_upload_mb', null,
        'stored_clip_target_mb', null,
        'clip_delivery_target_mb', null
      ),
      'features', jsonb_build_object(
        'upload_gallery', jsonb_build_object('is_enabled', true, 'limit_value', 15),
        'upload_clips', jsonb_build_object('is_enabled', false, 'limit_value', 0),
        'manage_albums', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'manage_reviews', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'view_analytics', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'featured_listing', jsonb_build_object('is_enabled', false, 'limit_value', null),
        'priority_support', jsonb_build_object('is_enabled', false, 'limit_value', null),
        'receive_enquiries', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'edit_vendor_profile', jsonb_build_object('is_enabled', true, 'limit_value', null),
        'vendor_dashboard_actions', jsonb_build_object('is_enabled', true, 'limit_value', null)
      )
    ),
    updated_at = now()
  where plan_id = free_plan_id;
end;
$$;

-- 7. Update subscription_effective_access and get_my_subscription_access to reflect 2-tier limits
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
  resolved_clip_limit integer := 0;
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

  uses_snapshot := current_subscription.access_source = 'paid_subscription'
    and current_subscription.status in ('active', 'past_due', 'grace_period', 'cancelled')
    and current_subscription.plan_snapshot is not null;

  if uses_snapshot then
    resolved_billing_interval := current_subscription.plan_snapshot->>'billing_interval';
    resolved_price := nullif(current_subscription.plan_snapshot->>'price', '')::numeric;
    resolved_currency := coalesce(current_subscription.plan_snapshot->>'currency', 'INR');
    resolved_photo_limit := nullif(current_subscription.plan_snapshot #>> '{features,upload_gallery,limit_value}', '')::integer;
  else
    resolved_billing_interval := coalesce(current_billing_option.billing_interval, current_plan.billing_interval);
    resolved_price := coalesce(current_billing_option.discounted_price, current_billing_option.price, current_plan.discounted_price, current_plan.price);
    resolved_currency := coalesce(current_billing_option.currency, current_plan.currency, 'INR');
    if current_plan.id is not null then
      select plan_feature.limit_value into resolved_photo_limit
      from public.subscription_feature_definitions feature
      join public.subscription_plan_features plan_feature
        on plan_feature.plan_id = current_plan.id and plan_feature.feature_id = feature.id
      where feature.feature_key = 'upload_gallery' and feature.is_active and plan_feature.is_enabled
      limit 1;
    end if;
  end if;

  resolved_clip_limit := 0;
  resolved_clip_usage := 0;

  if effective_access then
    resolved_photo_limit := coalesce(
      resolved_photo_limit,
      case when lower(coalesce(current_plan.slug, '')) = 'free' then 15 else 50 end
    );
    select count(*) into resolved_photo_usage
    from public.vendor_portfolio_media
    where vendor_portfolio_media.vendor_id = target_vendor_id and resource_type = 'image';
  else
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
    0::integer,
    0::integer,
    0::integer,
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
  );
$$;

revoke all on function public.subscription_effective_access(uuid, timestamptz) from public, anon;
grant execute on function public.subscription_effective_access(uuid, timestamptz) to authenticated;
revoke all on function public.get_my_subscription_access() from public, anon;
grant execute on function public.get_my_subscription_access() to authenticated;

-- 8. Update media policy function to exclude clips
create or replace function public.get_my_subscription_media_policy(target_vendor_id uuid)
returns table (
  max_image_upload_mb integer,
  stored_image_target_mb integer,
  max_clip_upload_mb integer,
  stored_clip_target_mb integer,
  clip_delivery_target_mb integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_vendor_id is null or target_vendor_id is distinct from private.subscription_vendor_for_user() then
    raise exception 'Vendor access required';
  end if;

  return query
  select plan.max_image_upload_mb, plan.stored_image_target_mb,
    null::integer, null::integer, null::integer
  from public.subscription_effective_access(target_vendor_id, now()) access
  join public.subscription_plans plan on plan.id = access.plan_id
  where access.has_access
  limit 1;
end;
$$;

revoke all on function public.get_my_subscription_media_policy(uuid) from public, anon;
grant execute on function public.get_my_subscription_media_policy(uuid) to authenticated;

-- 9. Reconcile all active vendors
do $$
declare
  v record;
begin
  for v in select distinct vendor_id from public.vendor_subscriptions loop
    perform private.reconcile_vendor_subscription_media(v.vendor_id);
  end loop;
end;
$$;

commit;
