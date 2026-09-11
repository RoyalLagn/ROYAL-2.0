begin;

-- Irreversible product-policy cleanup: only vendors with current Elite access
-- may retain Clips. Cascading foreign keys permanently remove the matching
-- likes, saves, views, reports and watch-history rows with each Clip.
do $$
declare
  deleted_clip_count integer;
begin
  delete from public.clips clip
  where not exists (
    select 1
    from public.vendor_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    where subscription.vendor_id = clip.vendor_id
      and lower(plan.slug) = 'elite'
      and (
        (subscription.status = 'active' and (subscription.expiry_date is null or subscription.expiry_date > now()))
        or (subscription.status = 'trial' and subscription.trial_end_date > now())
        or (subscription.status in ('past_due', 'grace_period') and subscription.grace_period_end_date > now())
        or (subscription.status = 'cancelled' and subscription.expiry_date > now())
      )
  );

  get diagnostics deleted_clip_count = row_count;
  raise notice 'Permanently hard-deleted % non-Elite vendor Clips', deleted_clip_count;
end;
$$;

commit;
