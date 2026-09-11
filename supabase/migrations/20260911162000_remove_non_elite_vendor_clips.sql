begin;

-- Product policy: Clips are exclusive to vendors with current Elite access.
-- Soft-delete non-Elite Clips so they disappear from both public feeds and
-- vendor management immediately while retaining a recoverable database record.
do $$
declare
  removed_clip_count integer;
begin
  perform set_config('app.subscription_media_reconcile', 'on', true);

  update public.clips clip
  set
    status = 'deleted',
    visibility = 'private',
    deleted_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    subscription_locked = false,
    subscription_locked_at = null
  where clip.deleted_at is null
    and clip.status <> 'deleted'
    and not exists (
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

  get diagnostics removed_clip_count = row_count;
  raise notice 'Soft-deleted % non-Elite vendor Clips', removed_clip_count;
end;
$$;

commit;
