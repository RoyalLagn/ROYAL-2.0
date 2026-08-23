-- The plan cards count distinct vendors by their current subscription only,
-- so each vendor can appear in at most one active Free/Premium/Elite card.
create or replace function public.admin_subscription_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_subscriptions as (
    select vendor.id vendor_id, subscription.status, lower(coalesce(plan.slug, '')) plan_slug
    from public.vendors vendor
    left join lateral (
      select candidate.* from public.vendor_subscriptions candidate
      where candidate.vendor_id = vendor.id
      order by case when candidate.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended') then 0 else 1 end, candidate.updated_at desc
      limit 1
    ) subscription on true
    left join public.subscription_plans plan on plan.id = subscription.plan_id
  ) select case when private.is_admin() then jsonb_build_object(
    'total_vendors', (select count(*) from public.vendors),
    'active', (select count(*) from current_subscriptions where status = 'active'),
    'active_free', (select count(*) from current_subscriptions where status = 'active' and plan_slug = 'free'),
    'active_premium', (select count(*) from current_subscriptions where status = 'active' and plan_slug = 'premium'),
    'active_elite', (select count(*) from current_subscriptions where status = 'active' and plan_slug = 'elite'),
    'trial', (select count(*) from current_subscriptions where status = 'trial'),
    'launch_offer', (select count(*) from current_subscriptions where status = 'launch_offer'),
    'grace_period', (select count(*) from current_subscriptions where status = 'grace_period'),
    'expired', (select count(*) from current_subscriptions where status = 'expired'),
    'suspended', (select count(*) from current_subscriptions where status = 'suspended'),
    'verified_revenue', (select coalesce(sum(amount), 0) from public.subscription_payments where payment_status = 'verified'),
    'failed_payments', (select count(*) from public.subscription_payments where payment_status = 'failed')
  ) else null end
$$;
