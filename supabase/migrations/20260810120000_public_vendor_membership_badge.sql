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
    and vendor.public_profile_enabled
    and vendor.management_status = 'active'
    and subscription.access_source = 'paid_subscription'
    and subscription.status in ('active', 'past_due', 'grace_period')
    and (subscription.expiry_date is null or subscription.expiry_date >= now())
    and lower(plan.name) in ('premium', 'elite')
  order by subscription.created_at desc
  limit 1;
$$;

revoke all on function public.get_public_vendor_membership_plan(uuid) from public;
grant execute on function public.get_public_vendor_membership_plan(uuid) to anon, authenticated;
