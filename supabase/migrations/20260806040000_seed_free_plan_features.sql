begin;

-- Root cause
-- -----------
-- 20260801120000_create_subscription_platform.sql seeds
-- subscription_plan_features only for the plan whose slug is
-- 'royallagn-standard'. That plan does not exist in the live project; the
-- only plan there is 'free', which vendors are actively subscribed to.
--
-- With no feature rows, SubscriptionAccessService.hasFeature() returns false
-- for every key, so useSubscriptionAccess().requireFeature() rejects every
-- gated vendor action: creating albums, uploading gallery media, uploading
-- clips, editing the vendor profile and viewing analytics. On the web build
-- this was completely silent, because react-native-web leaves Alert
-- unimplemented (fixed separately in utils/webAlert.ts).
--
-- Grant the 'free' plan the same feature set 20260801120000 defines for
-- royallagn-standard, including its upload_clips limit of 10. Written as an
-- idempotent upsert so re-running is safe.

insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select
  plan.id,
  feature.id,
  feature.feature_key in (
    'vendor_dashboard_actions', 'upload_clips', 'edit_vendor_profile',
    'upload_gallery', 'manage_albums', 'view_analytics', 'receive_enquiries',
    'manage_reviews'
  ),
  case when feature.feature_key = 'upload_clips' then 10 else null end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
where lower(plan.slug) = 'free'
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value;

commit;
