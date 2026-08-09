begin;

alter table public.clips
  add column if not exists subscription_locked boolean not null default false,
  add column if not exists subscription_locked_at timestamptz;

alter table public.vendor_portfolio_media
  add column if not exists subscription_locked boolean not null default false,
  add column if not exists subscription_locked_at timestamptz;

create index if not exists clips_public_subscription_unlocked_idx
  on public.clips (published_at desc, id desc)
  where status = 'approved' and visibility = 'public' and deleted_at is null and not subscription_locked;
create index if not exists portfolio_media_public_subscription_unlocked_idx
  on public.vendor_portfolio_media (vendor_id, album_id, display_order, created_at)
  where upload_status = 'completed' and processing_status = 'ready' and not subscription_locked;

create or replace function private.protect_clip_moderation_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() = 1
    and not private.is_admin()
    and coalesce(current_setting('app.subscription_media_reconcile', true), '') <> 'on'
    and (
      new.vendor_id is distinct from old.vendor_id
      or new.views_count is distinct from old.views_count
      or new.likes_count is distinct from old.likes_count
      or new.saves_count is distinct from old.saves_count
      or new.moderation_reason is distinct from old.moderation_reason
      or new.published_at is distinct from old.published_at
      or new.deleted_at is distinct from old.deleted_at
      or new.subscription_locked is distinct from old.subscription_locked
      or new.subscription_locked_at is distinct from old.subscription_locked_at
      or new.status not in ('draft', 'pending')
    )
  then
    raise exception 'Protected Clip fields may only be changed by the subscription system or an administrator';
  end if;
  return new;
end;
$$;

create or replace function private.protect_portfolio_subscription_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin()
    and coalesce(current_setting('app.subscription_media_reconcile', true), '') <> 'on'
    and (
      new.subscription_locked is distinct from old.subscription_locked
      or new.subscription_locked_at is distinct from old.subscription_locked_at
    )
  then
    raise exception 'Subscription media locks may only be changed by the subscription system';
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_protect_subscription_lock on public.vendor_portfolio_media;
create trigger portfolio_protect_subscription_lock
before update of subscription_locked, subscription_locked_at on public.vendor_portfolio_media
for each row execute function private.protect_portfolio_subscription_lock();

create or replace function private.prevent_locked_hero_selection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() and exists (
    select 1 from public.vendor_portfolio_media media
    where media.id = new.media_id and media.subscription_locked
  ) then
    raise exception 'This photo is locked by the current subscription. Upgrade to use it publicly.'
      using errcode = '42501', hint = 'SUBSCRIPTION_MEDIA_LOCKED';
  end if;
  return new;
end;
$$;
drop trigger if exists hero_prevent_locked_selection on public.vendor_portfolio_hero_media;
create trigger hero_prevent_locked_selection
before insert or update of media_id on public.vendor_portfolio_hero_media
for each row execute function private.prevent_locked_hero_selection();

create or replace function private.subscription_media_limit(
  target_vendor_id uuid,
  requested_feature_key text
) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  current_subscription public.vendor_subscriptions%rowtype;
  snapshot_limit integer;
  live_enabled boolean;
  live_limit integer;
begin
  select * into current_subscription
  from public.vendor_subscriptions subscription
  where subscription.vendor_id = target_vendor_id
    and subscription.status in ('trial','launch_offer','active','past_due','grace_period','cancelled')
  order by
    case subscription.status
      when 'active' then 0 when 'trial' then 0 when 'launch_offer' then 0
      when 'grace_period' then 0 when 'past_due' then 1 when 'cancelled' then 2
      else 3
    end,
    subscription.updated_at desc, subscription.created_at desc
  limit 1;

  if current_subscription.id is null then return 0; end if;
  if current_subscription.access_source = 'paid_subscription'
    and current_subscription.plan_snapshot is not null
  then
    if not coalesce((current_subscription.plan_snapshot #>> array['features', requested_feature_key, 'is_enabled'])::boolean, false) then
      return 0;
    end if;
    snapshot_limit := nullif(current_subscription.plan_snapshot #>> array['features', requested_feature_key, 'limit_value'], '')::integer;
    return coalesce(snapshot_limit, 2147483647);
  end if;

  select plan_feature.is_enabled, plan_feature.limit_value
  into live_enabled, live_limit
  from public.subscription_feature_definitions definition
  left join public.subscription_plan_features plan_feature
    on plan_feature.feature_id = definition.id and plan_feature.plan_id = current_subscription.plan_id
  where definition.feature_key = requested_feature_key and definition.is_active
  limit 1;
  if not coalesce(live_enabled, false) then return 0; end if;
  return coalesce(live_limit, 2147483647);
end;
$$;
revoke all on function private.subscription_media_limit(uuid, text) from public, anon, authenticated;

create or replace function private.reconcile_vendor_subscription_media(target_vendor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clip_limit integer := greatest(private.subscription_media_limit(target_vendor_id, 'upload_clips'), 0);
  photo_limit integer := greatest(private.subscription_media_limit(target_vendor_id, 'upload_gallery'), 0);
  clip_total integer;
  clip_active integer;
  photo_total integer;
  photo_active integer;
begin
  if target_vendor_id is null then raise exception 'Vendor ID is required'; end if;
  perform pg_advisory_xact_lock(hashtext('subscription-media:' || target_vendor_id::text));
  perform set_config('app.subscription_media_reconcile', 'on', true);

  with ranked as (
    select clip.id,
      row_number() over (order by
        case when clip.status = 'approved' and clip.visibility = 'public' then 0 else 1 end,
        clip.published_at desc nulls last,
        clip.created_at desc,
        clip.id desc
      ) position
    from public.clips clip
    where clip.vendor_id = target_vendor_id and clip.deleted_at is null and clip.status <> 'deleted'
  )
  update public.clips clip set
    subscription_locked = ranked.position > clip_limit,
    subscription_locked_at = case
      when ranked.position > clip_limit then coalesce(clip.subscription_locked_at, now())
      else null
    end
  from ranked
  where clip.id = ranked.id
    and clip.subscription_locked is distinct from (ranked.position > clip_limit);

  with ranked as (
    select media.id,
      row_number() over (order by
        case when hero.media_id is not null then 0 else 1 end,
        case when album.is_visible and media.is_cover then 0 else 1 end,
        case when album.is_visible then 0 else 1 end,
        album.display_order,
        media.display_order,
        media.created_at desc,
        media.id desc
      ) position
    from public.vendor_portfolio_media media
    join public.vendor_portfolio_albums album on album.id = media.album_id
    left join public.vendor_portfolio_hero_media hero on hero.media_id = media.id
    where media.vendor_id = target_vendor_id
      and media.resource_type = 'image'
      and media.upload_status = 'completed'
      and media.processing_status = 'ready'
  )
  update public.vendor_portfolio_media media set
    subscription_locked = ranked.position > photo_limit,
    subscription_locked_at = case
      when ranked.position > photo_limit then coalesce(media.subscription_locked_at, now())
      else null
    end
  from ranked
  where media.id = ranked.id
    and media.subscription_locked is distinct from (ranked.position > photo_limit);

  -- Gallery videos do not consume the plan's photo allowance.
  update public.vendor_portfolio_media set subscription_locked = false, subscription_locked_at = null
  where vendor_id = target_vendor_id and resource_type <> 'image' and subscription_locked;

  select count(*), count(*) filter (where not subscription_locked)
  into clip_total, clip_active
  from public.clips
  where vendor_id = target_vendor_id and deleted_at is null and status <> 'deleted';

  select count(*), count(*) filter (where not subscription_locked)
  into photo_total, photo_active
  from public.vendor_portfolio_media
  where vendor_id = target_vendor_id and resource_type = 'image'
    and upload_status = 'completed' and processing_status = 'ready';

  return jsonb_build_object(
    'clip_limit', clip_limit,
    'clip_total', clip_total,
    'clip_active', clip_active,
    'clip_locked', clip_total - clip_active,
    'clip_remaining', greatest(clip_limit - clip_total, 0),
    'photo_limit', photo_limit,
    'photo_total', photo_total,
    'photo_active', photo_active,
    'photo_locked', photo_total - photo_active,
    'photo_remaining', greatest(photo_limit - photo_total, 0)
  );
end;
$$;

revoke all on function private.reconcile_vendor_subscription_media(uuid) from public, anon, authenticated;

create or replace function public.refresh_my_subscription_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid := private.subscription_vendor_for_user();
begin
  if target_vendor_id is null then raise exception 'Vendor access required' using errcode = '42501'; end if;
  perform public.process_subscription_lifecycle(now());
  return private.reconcile_vendor_subscription_media(target_vendor_id);
end;
$$;
revoke all on function public.refresh_my_subscription_access() from public, anon;
grant execute on function public.refresh_my_subscription_access() to authenticated;

create or replace function public.admin_subscription_media_usage()
returns table (
  vendor_id uuid,
  clip_total bigint,
  clip_active bigint,
  clip_locked bigint,
  photo_total bigint,
  photo_active bigint,
  photo_locked bigint
)
language sql stable security definer set search_path = '' as $$
  select vendor.id,
    count(distinct clip.id),
    count(distinct clip.id) filter (where not clip.subscription_locked),
    count(distinct clip.id) filter (where clip.subscription_locked),
    count(distinct media.id),
    count(distinct media.id) filter (where not media.subscription_locked),
    count(distinct media.id) filter (where media.subscription_locked)
  from public.vendors vendor
  left join public.clips clip on clip.vendor_id = vendor.id
    and clip.deleted_at is null and clip.status <> 'deleted'
  left join public.vendor_portfolio_media media on media.vendor_id = vendor.id
    and media.resource_type = 'image' and media.upload_status = 'completed' and media.processing_status = 'ready'
  where private.is_admin()
  group by vendor.id;
$$;
revoke all on function public.admin_subscription_media_usage() from public, anon;
grant execute on function public.admin_subscription_media_usage() to authenticated;

create or replace function private.reconcile_subscription_media_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.reconcile_vendor_subscription_media(new.vendor_id);
  return new;
end;
$$;
drop trigger if exists vendor_subscription_reconcile_media on public.vendor_subscriptions;
create trigger vendor_subscription_reconcile_media
after insert or update of plan_id, billing_option_id, status, access_source, plan_snapshot
on public.vendor_subscriptions for each row
execute function private.reconcile_subscription_media_trigger();

create or replace function private.reconcile_plan_feature_media_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  affected_plan_id uuid := coalesce(new.plan_id, old.plan_id);
  vendor_record record;
begin
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
drop trigger if exists subscription_plan_feature_reconcile_media on public.subscription_plan_features;
create trigger subscription_plan_feature_reconcile_media
after insert or update of is_enabled, limit_value or delete on public.subscription_plan_features
for each row execute function private.reconcile_plan_feature_media_trigger();

create or replace function private.reconcile_inserted_media_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.reconcile_vendor_subscription_media(new.vendor_id);
  return new;
end;
$$;
drop trigger if exists clip_reconcile_after_insert on public.clips;
create trigger clip_reconcile_after_insert after insert on public.clips
for each row execute function private.reconcile_inserted_media_trigger();
drop trigger if exists portfolio_reconcile_after_insert on public.vendor_portfolio_media;
create trigger portfolio_reconcile_after_insert after insert on public.vendor_portfolio_media
for each row execute function private.reconcile_inserted_media_trigger();

drop policy if exists clips_read on public.clips;
create policy clips_read on public.clips for select to anon, authenticated using (
  (
    status = 'approved' and visibility in ('public', 'unlisted')
    and deleted_at is null and not subscription_locked
  )
  or private.owns_vendor(vendor_id)
  or private.is_admin()
);

drop policy if exists clip_likes_insert_own on public.clip_likes;
create policy clip_likes_insert_own on public.clip_likes for insert to authenticated with check (
  profile_id = auth.uid() and exists (
    select 1 from public.clips clip where clip.id = clip_id
      and clip.status = 'approved' and clip.visibility = 'public'
      and clip.deleted_at is null and not clip.subscription_locked
  )
);
drop policy if exists clip_saves_insert_own on public.clip_saves;
create policy clip_saves_insert_own on public.clip_saves for insert to authenticated with check (
  profile_id = auth.uid() and exists (
    select 1 from public.clips clip where clip.id = clip_id
      and clip.status = 'approved' and clip.visibility in ('public', 'unlisted')
      and clip.deleted_at is null and not clip.subscription_locked
  )
);
drop policy if exists clip_views_insert_visible on public.clip_views;
create policy clip_views_insert_visible on public.clip_views for insert to anon, authenticated with check (
  (viewer_id is null or viewer_id = auth.uid()) and exists (
    select 1 from public.clips clip where clip.id = clip_id
      and clip.status = 'approved' and clip.visibility in ('public', 'unlisted')
      and clip.deleted_at is null and not clip.subscription_locked
  )
);

drop policy if exists "media_public_read" on public.vendor_portfolio_media;
create policy "media_public_read" on public.vendor_portfolio_media for select using (
  not vendor_portfolio_media.subscription_locked
  and vendor_portfolio_media.upload_status = 'completed'
  and vendor_portfolio_media.processing_status = 'ready'
  and private.portfolio_vendor_is_public(vendor_portfolio_media.vendor_id)
  and exists (
    select 1 from public.vendor_portfolio_albums album
    where album.id = vendor_portfolio_media.album_id
      and album.vendor_id = vendor_portfolio_media.vendor_id and album.is_visible
  )
);

drop policy if exists "hero_public_read" on public.vendor_portfolio_hero_media;
create policy "hero_public_read" on public.vendor_portfolio_hero_media for select using (
  private.portfolio_vendor_is_public(vendor_portfolio_hero_media.vendor_id)
  and exists (
    select 1 from public.vendor_portfolio_media media
    join public.vendor_portfolio_albums album on album.id = media.album_id
    where media.id = vendor_portfolio_hero_media.media_id
      and media.vendor_id = vendor_portfolio_hero_media.vendor_id
      and media.resource_type = 'image' and not media.subscription_locked
      and media.upload_status = 'completed' and media.processing_status = 'ready'
      and album.is_visible
  )
);

-- Existing rows are reconciled once; repeated runs remain deterministic.
select private.reconcile_vendor_subscription_media(vendor.id)
from public.vendors vendor where vendor.is_verified;

commit;
