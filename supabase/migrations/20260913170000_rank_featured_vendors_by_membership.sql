-- Keep featured placement eligibility scoped to the requested PIN code, but
-- promote paid membership within that sponsored rail. Vendors on the same
-- plan retain the existing stable daily rotation.
create or replace function public.get_featured_vendor_ids_for_pincode(target_pincode text)
returns table(vendor_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select placement.vendor_id
  from public.featured_vendor_placements placement
  join public.vendors vendor on vendor.id = placement.vendor_id
  left join lateral (
    select lower(subscription_plan.name) as plan_name
    from public.vendor_subscriptions vendor_subscription
    join public.subscription_plans subscription_plan
      on subscription_plan.id = vendor_subscription.plan_id
    where vendor_subscription.vendor_id = placement.vendor_id
      and vendor_subscription.access_source = 'paid_subscription'
      and vendor_subscription.status in ('active', 'past_due', 'grace_period')
      and (
        vendor_subscription.expiry_date is null
        or vendor_subscription.expiry_date >= now()
      )
      and lower(subscription_plan.name) in ('premium', 'elite')
    order by vendor_subscription.created_at desc
    limit 1
  ) membership on true
  where placement.pincode = btrim(target_pincode)
    and placement.status = 'active'
    and placement.starts_at <= now()
    and placement.ends_at > now()
    and vendor.is_verified
    and coalesce(vendor.public_profile_enabled, true)
    and coalesce(vendor.management_status, 'active') = 'active'
  order by
    case membership.plan_name
      when 'elite' then 2
      when 'premium' then 1
      else 0
    end desc,
    md5(placement.vendor_id::text || current_date::text);
$$;

