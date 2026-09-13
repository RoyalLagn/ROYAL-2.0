-- Public vendor cards treat a null public_profile_enabled value as visible.
-- Keep the membership lookup aligned with that rule and identify plans by
-- their stable slug rather than their editable display name.
create or replace function public.get_public_vendor_membership_plan(target_vendor_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select plan.name
  from public.vendor_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  join public.vendors vendor on vendor.id = subscription.vendor_id
  where subscription.vendor_id = target_vendor_id
    and vendor.is_verified
    and coalesce(vendor.public_profile_enabled, true)
    and coalesce(vendor.management_status, 'active') = 'active'
    and subscription.access_source = 'paid_subscription'
    and subscription.status in ('active', 'past_due', 'grace_period')
    and (subscription.expiry_date is null or subscription.expiry_date >= now())
    and lower(plan.slug) in ('premium', 'elite')
  order by subscription.created_at desc
  limit 1;
$$;

revoke all on function public.get_public_vendor_membership_plan(uuid) from public;
grant execute on function public.get_public_vendor_membership_plan(uuid) to anon, authenticated;

