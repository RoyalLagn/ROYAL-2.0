begin;

-- ---------------------------------------------------------------------
-- Fix the live 'free' plan in place (safe update, not a delete/recreate).
-- It currently reads name/description "diwali party" test copy, has a
-- 14-day trial and a 10 clip limit. Free should be a permanent, no-trial,
-- 2 clip / 10 photo tier. Any vendor already on this plan keeps their
-- vendor_subscriptions row untouched -- only the plan definition changes,
-- and because Free access is always resolved live (never from a purchase
-- snapshot), every Free vendor sees the corrected limits immediately.
-- ---------------------------------------------------------------------

update public.subscription_plans
set
  name = 'Free',
  description = 'Basic RoyalLagn vendor tools at no cost, for as long as you like.',
  price = 0,
  discounted_price = null,
  trial_enabled = false,
  trial_days = 0,
  is_permanent = true,
  status = 'active',
  is_featured = false,
  display_order = 0
where lower(slug) = 'free';

-- If no 'free' plan exists yet in this environment (a fresh database that
-- never had the manually-created live row), create one so the rest of this
-- migration and the application always have a Free fallback plan to use.
insert into public.subscription_plans(
  name, slug, description, price, currency, billing_interval,
  billing_interval_count, trial_enabled, trial_days, grace_period_days,
  is_active, is_featured, display_order, status, is_permanent, metadata
)
select
  'Free', 'free', 'Basic RoyalLagn vendor tools at no cost, for as long as you like.',
  0, 'INR', 'month', 1, false, 0, 0, true, false, 0, 'active', true,
  jsonb_build_object('seeded', true)
where not exists (select 1 from public.subscription_plans where lower(slug) = 'free');

update public.subscription_plan_billing_options option set
  price = 0,
  discounted_price = null,
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = 0,
  is_active = true
from public.subscription_plans plan
where option.plan_id = plan.id and lower(plan.slug) = 'free';

insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select
  plan.id,
  feature.id,
  feature.feature_key in (
    'vendor_dashboard_actions', 'upload_clips', 'edit_vendor_profile',
    'upload_gallery', 'manage_albums', 'view_analytics', 'receive_enquiries',
    'manage_reviews'
  ),
  case feature.feature_key
    when 'upload_clips' then 2
    when 'upload_gallery' then 10
    else null
  end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
where lower(plan.slug) = 'free'
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value;

-- ---------------------------------------------------------------------
-- Seed Silver and Standard/Premium. Idempotent: safe to re-run.
-- ---------------------------------------------------------------------

insert into public.subscription_plans(
  name, slug, description, price, currency, billing_interval,
  billing_interval_count, trial_enabled, trial_days, grace_period_days,
  is_active, is_featured, display_order, status, is_permanent, metadata
)
select 'Silver', 'silver', 'More Clips and gallery room for growing vendors.',
  499.00, 'INR', 'month', 1, false, 0, 3, true, false, 10, 'active', false,
  jsonb_build_object('seeded', true)
where not exists (select 1 from public.subscription_plans where lower(slug) = 'silver');

insert into public.subscription_plans(
  name, slug, description, price, currency, billing_interval,
  billing_interval_count, trial_enabled, trial_days, grace_period_days,
  is_active, is_featured, display_order, status, is_permanent, metadata
)
select 'Standard/Premium', 'premium', 'Maximum Clips, gallery room, featured placement and priority support.',
  999.00, 'INR', 'month', 1, false, 0, 3, true, true, 20, 'active', false,
  jsonb_build_object('seeded', true)
where not exists (select 1 from public.subscription_plans where lower(slug) = 'premium');

update public.subscription_plans set
  name = 'Silver',
  price = 499.00,
  discounted_price = null,
  currency = 'INR',
  billing_interval = 'month',
  billing_interval_count = 1,
  trial_enabled = false,
  trial_days = 0,
  is_permanent = false,
  status = 'active',
  is_featured = false,
  display_order = 10
where lower(slug) = 'silver';

update public.subscription_plans set
  name = 'Standard/Premium',
  price = 999.00,
  discounted_price = null,
  currency = 'INR',
  billing_interval = 'month',
  billing_interval_count = 1,
  trial_enabled = false,
  trial_days = 0,
  is_permanent = false,
  status = 'active',
  is_featured = true,
  display_order = 20
where lower(slug) = 'premium';

insert into public.subscription_plan_billing_options(
  plan_id, billing_interval, interval_count, price, currency, grace_period_days, is_active, display_order
)
select plan.id, 'month', 1, 499.00, 'INR', 3, true, 0
from public.subscription_plans plan
where lower(plan.slug) = 'silver'
on conflict (plan_id, billing_interval) do update set
  interval_count = excluded.interval_count,
  price = excluded.price,
  discounted_price = null,
  currency = excluded.currency,
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = excluded.grace_period_days,
  is_active = true,
  display_order = excluded.display_order;

insert into public.subscription_plan_billing_options(
  plan_id, billing_interval, interval_count, price, currency, grace_period_days, is_active, display_order
)
select plan.id, 'month', 1, 999.00, 'INR', 3, true, 0
from public.subscription_plans plan
where lower(plan.slug) = 'premium'
on conflict (plan_id, billing_interval) do update set
  interval_count = excluded.interval_count,
  price = excluded.price,
  discounted_price = null,
  currency = excluded.currency,
  trial_enabled = false,
  trial_days = 0,
  grace_period_days = excluded.grace_period_days,
  is_active = true,
  display_order = excluded.display_order;

insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select plan.id, feature.id,
  feature.feature_key in (
    'vendor_dashboard_actions', 'upload_clips', 'edit_vendor_profile',
    'upload_gallery', 'manage_albums', 'view_analytics', 'receive_enquiries',
    'manage_reviews'
  ),
  case feature.feature_key
    when 'upload_clips' then 15
    when 'upload_gallery' then 30
    else null
  end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
where lower(plan.slug) = 'silver'
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value;

insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select plan.id, feature.id,
  feature.feature_key in (
    'vendor_dashboard_actions', 'upload_clips', 'edit_vendor_profile',
    'upload_gallery', 'manage_albums', 'view_analytics', 'receive_enquiries',
    'manage_reviews', 'featured_listing', 'priority_support'
  ),
  case feature.feature_key
    when 'upload_clips' then 30
    when 'upload_gallery' then 60
    else null
  end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
where lower(plan.slug) = 'premium'
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value;

-- Make Free the configured fallback/default plan used by the lifecycle
-- processor (process_subscription_lifecycle, extended in the next
-- migration) and by admin-side "grant free" defaults, without touching any
-- other currently-configured application_settings value.
update public.application_settings
set value = to_jsonb((select id::text from public.subscription_plans where lower(slug) = 'free' limit 1))
where key = 'subscription_default_plan_id'
  and (value is null or value = 'null'::jsonb);

commit;
