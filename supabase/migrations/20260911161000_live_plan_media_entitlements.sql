begin;

-- Media allowances are operational limits, not financial history. Keep them
-- live for every current subscriber when an administrator edits a plan, while
-- leaving price/billing snapshot behavior unchanged.
create or replace function private.reconcile_plan_feature_media_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_plan_id uuid := coalesce(new.plan_id, old.plan_id);
  affected_feature_key text;
  affected_enabled boolean;
  affected_limit integer;
  vendor_record record;
begin
  select feature.feature_key, plan_feature.is_enabled, plan_feature.limit_value
  into affected_feature_key, affected_enabled, affected_limit
  from public.subscription_feature_definitions feature
  left join public.subscription_plan_features plan_feature
    on plan_feature.feature_id = feature.id and plan_feature.plan_id = affected_plan_id
  where feature.id = coalesce(new.feature_id, old.feature_id);

  if affected_feature_key in ('upload_gallery', 'upload_clips') then
    update public.vendor_subscriptions subscription set
      plan_snapshot = jsonb_set(
        coalesce(subscription.plan_snapshot, '{}'::jsonb),
        array['features', affected_feature_key],
        jsonb_build_object(
          'is_enabled', coalesce(affected_enabled, false),
          'limit_value', affected_limit
        ),
        true
      ),
      updated_at = now()
    where subscription.plan_id = affected_plan_id
      and subscription.plan_snapshot is not null
      and subscription.status in ('trial','launch_offer','active','past_due','grace_period','cancelled');
  end if;

  for vendor_record in
    select distinct subscription.vendor_id
    from public.vendor_subscriptions subscription
    where subscription.plan_id = affected_plan_id
      and subscription.status in ('trial','launch_offer','active','past_due','grace_period','cancelled')
  loop
    perform private.reconcile_vendor_subscription_media(vendor_record.vendor_id);
  end loop;
  return null;
end;
$$;

commit;
