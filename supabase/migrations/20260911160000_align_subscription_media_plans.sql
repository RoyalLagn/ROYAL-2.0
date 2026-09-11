begin;

-- Canonical RoyalLagn media policy. These columns are intentionally part of
-- the plan row so admin, vendor presentation and upload authorization read the
-- same values instead of duplicating constants in three clients.
alter table public.subscription_plans
  add column if not exists max_image_upload_mb integer not null default 5 check (max_image_upload_mb > 0),
  add column if not exists stored_image_target_mb integer not null default 4 check (stored_image_target_mb > 0),
  add column if not exists max_clip_upload_mb integer check (max_clip_upload_mb is null or max_clip_upload_mb > 0),
  add column if not exists stored_clip_target_mb integer check (stored_clip_target_mb is null or stored_clip_target_mb > 0),
  add column if not exists clip_delivery_target_mb integer check (clip_delivery_target_mb is null or clip_delivery_target_mb > 0);

update public.subscription_plans set
  name = 'Free', description = '5 images for a simple RoyalLagn vendor presence.',
  price = 0, discounted_price = null, display_order = 0, status = 'active',
  is_featured = false, is_permanent = true, trial_enabled = false, trial_days = 0,
  max_image_upload_mb = 8, stored_image_target_mb = 4,
  max_clip_upload_mb = null, stored_clip_target_mb = null, clip_delivery_target_mb = null
where lower(slug) = 'free';

update public.subscription_plans set
  name = 'Premium', description = '40 images for vendors who need a larger visual portfolio.',
  price = 499, discounted_price = null, display_order = 10, status = 'active',
  is_featured = false, is_permanent = false, trial_enabled = false, trial_days = 0,
  max_image_upload_mb = 12, stored_image_target_mb = 6,
  max_clip_upload_mb = null, stored_clip_target_mb = null, clip_delivery_target_mb = null
where lower(slug) = 'premium';

update public.subscription_plans set
  name = 'Elite', description = '60 images and 20 Clips for a complete moving portfolio.',
  price = 999, discounted_price = null, display_order = 20, status = 'active',
  is_featured = true, is_permanent = false, trial_enabled = false, trial_days = 0,
  max_image_upload_mb = 20, stored_image_target_mb = 12,
  max_clip_upload_mb = 40, stored_clip_target_mb = 20, clip_delivery_target_mb = 4
where lower(slug) = 'elite';

update public.subscription_plan_billing_options option set
  price = case lower(plan.slug) when 'free' then 0 when 'premium' then 499 when 'elite' then 999 end,
  discounted_price = null, currency = 'INR', trial_enabled = false, trial_days = 0,
  is_active = true
from public.subscription_plans plan
where option.plan_id = plan.id
  and option.billing_interval = 'month'
  and lower(plan.slug) in ('free', 'premium', 'elite');

insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select plan.id, feature.id,
  case
    when feature.feature_key = 'upload_gallery' then true
    when feature.feature_key = 'upload_clips' then lower(plan.slug) = 'elite'
    else coalesce(existing.is_enabled, false)
  end,
  case feature.feature_key
    when 'upload_gallery' then case lower(plan.slug) when 'free' then 5 when 'premium' then 40 when 'elite' then 60 end
    when 'upload_clips' then case lower(plan.slug) when 'elite' then 20 else 0 end
    else existing.limit_value
  end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
left join public.subscription_plan_features existing
  on existing.plan_id = plan.id and existing.feature_id = feature.id
where lower(plan.slug) in ('free', 'premium', 'elite')
on conflict (plan_id, feature_id) do update set
  is_enabled = excluded.is_enabled,
  limit_value = excluded.limit_value;

-- The product requirement is an immediate migration of old subscribers, so
-- refresh paid snapshots as well as live plans. This is deliberately explicit:
-- normally snapshots preserve purchased terms, but this rollout replaces the
-- old three-tier media contract for every current vendor.
update public.vendor_subscriptions subscription set
  plan_snapshot = coalesce(subscription.plan_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'plan_name', plan.name,
      'price', plan.price,
      'media_policy', jsonb_build_object(
        'max_image_upload_mb', plan.max_image_upload_mb,
        'stored_image_target_mb', plan.stored_image_target_mb,
        'max_clip_upload_mb', plan.max_clip_upload_mb,
        'stored_clip_target_mb', plan.stored_clip_target_mb,
        'clip_delivery_target_mb', plan.clip_delivery_target_mb
      ),
      'features', coalesce(subscription.plan_snapshot->'features', '{}'::jsonb)
        || jsonb_build_object(
          'upload_gallery', jsonb_build_object(
            'is_enabled', true,
            'limit_value', case lower(plan.slug) when 'free' then 5 when 'premium' then 40 else 60 end
          ),
          'upload_clips', jsonb_build_object(
            'is_enabled', lower(plan.slug) = 'elite',
            'limit_value', case when lower(plan.slug) = 'elite' then 20 else 0 end
          )
        )
    ),
  updated_at = now()
from public.subscription_plans plan
where subscription.plan_id = plan.id
  and lower(plan.slug) in ('free', 'premium', 'elite');

-- Server-authoritative policy used by both media signing functions. Ownership
-- is checked here and again in each signer.
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
    plan.max_clip_upload_mb, plan.stored_clip_target_mb, plan.clip_delivery_target_mb
  from public.subscription_effective_access(target_vendor_id, now()) access
  join public.subscription_plans plan on plan.id = access.plan_id
  where access.has_access
  limit 1;
end;
$$;

revoke all on function public.get_my_subscription_media_policy(uuid) from public, anon;
grant execute on function public.get_my_subscription_media_policy(uuid) to authenticated;

commit;
