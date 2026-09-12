begin;

-- Remove the only remaining legacy Clip row. It was already soft-deleted and
-- had no public visibility; keeping it would preserve obsolete provider URLs.
delete from public.clips
where status = 'deleted'
  and (
    video_url ~* '^https://res\.cloudinary\.com/'
    or thumbnail_url ~* '^https://res\.cloudinary\.com/'
    or cloudinary_public_id !~* '^bunny:'
  );

-- Review text remains intact if an old managed photo is encountered; only the
-- provider URL is removed from the attachment array.
update public.reviews review
set image_urls = coalesce((
  select array_agg(url order by ordinal)
  from unnest(review.image_urls) with ordinality item(url, ordinal)
  where url !~* '^https://res\.cloudinary\.com/'
), '{}'::text[])
where exists (
  select 1 from unnest(review.image_urls) url
  where url ~* '^https://res\.cloudinary\.com/'
);

update public.profiles set profile_image = null
where profile_image ~* '^https://res\.cloudinary\.com/';
update public.vendors set logo_url = null
where logo_url ~* '^https://res\.cloudinary\.com/';
update public.categories set icon_url = null
where icon_url ~* '^https://res\.cloudinary\.com/';
update public.categories set fallback_image_url = null
where fallback_image_url ~* '^https://res\.cloudinary\.com/';
update public.categories set home_image_url = null
where home_image_url ~* '^https://res\.cloudinary\.com/';
update public.vendor_applications set logo_url = null
where logo_url ~* '^https://res\.cloudinary\.com/';
update public.vendor_applications set cover_image_url = null
where cover_image_url ~* '^https://res\.cloudinary\.com/';
update public.vendor_applications application
set business_documents = coalesce((
  select jsonb_agg(document)
  from jsonb_array_elements(application.business_documents) document
  where coalesce(document->>'url', '') !~* '^https://res\.cloudinary\.com/'
), '[]'::jsonb)
where jsonb_typeof(business_documents) = 'array'
  and business_documents::text ~* 'res\.cloudinary\.com';

do $$
begin
  if exists (
    select 1 from public.clips
    where video_url ~* 'cloudinary'
       or thumbnail_url ~* 'cloudinary'
       or cloudinary_public_id !~* '^bunny:[0-9a-f-]+:[0-9a-f-]+$'
  ) then
    raise exception 'Cloudinary decommission blocked: a non-Bunny Clip still exists';
  end if;
  if exists (
    select 1 from public.vendor_portfolio_media
    where secure_url ~* 'cloudinary'
       or coalesce(thumbnail_url, '') ~* 'cloudinary'
       or coalesce(video_poster_url, '') ~* 'cloudinary'
  ) then
    raise exception 'Cloudinary decommission blocked: portfolio media still requires migration';
  end if;
end $$;

alter table public.clips
  rename column cloudinary_public_id to bunny_asset_id;
alter table public.clip_deletion_log
  rename column cloudinary_public_id to bunny_asset_id;
alter table private.clip_media_deletion_outbox
  rename column cloudinary_public_id to bunny_asset_id;
alter table public.finance_cloudinary_usage
  rename to finance_bunny_usage;
alter trigger finance_cloudinary_usage_closed_month_guard on public.finance_bunny_usage
  rename to finance_bunny_usage_closed_month_guard;

alter table public.clips drop constraint if exists clips_urls_valid;
alter table public.clips add constraint clips_urls_valid check (
  video_url ~* '^https://[a-z0-9-]+\.b-cdn\.net/[0-9a-f-]+/playlist\.m3u8$'
  and thumbnail_url ~* '^https://[a-z0-9-]+\.b-cdn\.net/'
  and bunny_asset_id ~* '^bunny:[0-9a-f-]+:[0-9a-f-]+$'
);

create or replace function public.finalize_clip_upload(
  target_reservation_id uuid,
  clip_row jsonb
) returns public.clips
language plpgsql security definer set search_path = '' as $$
declare
  reservation public.clip_upload_reservations;
  inserted public.clips;
  target_vendor_id uuid;
  vendor_category_id uuid;
begin
  select * into reservation from public.clip_upload_reservations
  where id = target_reservation_id for update;
  if not found then raise exception 'Upload reservation not found.' using errcode = 'P0002'; end if;
  target_vendor_id := reservation.vendor_id;
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;
  if reservation.status = 'completed' and reservation.clip_id is not null then
    select * into inserted from public.clips where id = reservation.clip_id;
    if found then return inserted; end if;
  end if;
  if reservation.status <> 'reserved' or reservation.expires_at <= now() then
    raise exception 'This upload reservation has expired. Start the upload again.'
      using errcode = 'P0003', hint = 'RESERVATION_EXPIRED';
  end if;
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_clips') then
    raise exception 'An active subscription is required to upload Clips'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  select vendor.category_id into vendor_category_id from public.vendors vendor
  where vendor.id = target_vendor_id;
  if vendor_category_id is null then
    raise exception 'Complete your Business information before uploading a Clip.'
      using errcode = '23502', hint = 'VENDOR_CATEGORY_REQUIRED';
  end if;
  insert into public.clips (
    id, vendor_id, category_id, title, caption, video_url, thumbnail_url,
    duration_seconds, width, height, file_size_bytes, bunny_asset_id,
    status, visibility, published_at
  ) values (
    coalesce(nullif(clip_row->>'id', '')::uuid, gen_random_uuid()),
    target_vendor_id, vendor_category_id, clip_row->>'title',
    nullif(clip_row->>'caption', ''), clip_row->>'video_url',
    clip_row->>'thumbnail_url', (clip_row->>'duration_seconds')::numeric,
    (clip_row->>'width')::integer, (clip_row->>'height')::integer,
    (clip_row->>'file_size_bytes')::bigint, clip_row->>'bunny_asset_id',
    'approved', 'public', now()
  ) returning * into inserted;
  update public.clip_upload_reservations
  set status = 'completed', clip_id = inserted.id, completed_at = now()
  where id = target_reservation_id;
  return inserted;
end;
$$;

create or replace function public.vendor_soft_delete_clip(target_clip_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare result_asset_id text; target_vendor_id uuid;
begin
  select clip.vendor_id into target_vendor_id from public.clips clip
  where clip.id = target_clip_id and clip.deleted_at is null;
  if target_vendor_id is null or not private.owns_vendor(target_vendor_id) then
    raise exception 'Owned Clip not found';
  end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  update public.clips clip
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where clip.id = target_clip_id and clip.deleted_at is null
  returning bunny_asset_id into result_asset_id;
  return result_asset_id;
end;
$$;

drop function if exists public.vendor_replace_oldest_clip(uuid);
create function public.vendor_replace_oldest_clip(target_vendor_id uuid)
returns table (clip_id uuid, bunny_asset_id text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_vendor(target_vendor_id) then raise exception 'Vendor ownership required'; end if;
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_clips') then
    raise exception 'An active subscription is required to manage Clips'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  return query update public.clips clip
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where clip.id = (
    select candidate.id from public.clips candidate
    where candidate.vendor_id = target_vendor_id
      and candidate.status = 'approved' and candidate.deleted_at is null
    order by candidate.published_at asc nulls last, candidate.created_at asc
    limit 1 for update
  ) returning clip.id, clip.bunny_asset_id;
end;
$$;

drop function if exists public.admin_hard_delete_clip(uuid, text);
create function public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text)
returns table (vendor_id uuid, bunny_asset_id text)
language plpgsql security definer set search_path = '' as $$
declare clip record; trimmed_reason text := btrim(coalesce(deletion_reason, ''));
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if trimmed_reason = '' then raise exception 'A deletion reason is required'; end if;
  select c.id, c.vendor_id, c.category_id, c.title, c.bunny_asset_id into clip
  from public.clips c where c.id = target_clip_id for update;
  if clip.id is null then raise exception 'Clip not found'; end if;
  insert into public.clip_deletion_log (
    clip_id, vendor_id, category_id, clip_title, reason, deleted_by, bunny_asset_id
  ) values (
    clip.id, clip.vendor_id, clip.category_id, clip.title, trimmed_reason, auth.uid(), clip.bunny_asset_id
  );
  delete from public.clips where id = target_clip_id;
  return query select clip.vendor_id, clip.bunny_asset_id;
end;
$$;

create or replace function public.finalize_bunny_clip_migration(
  target_clip_id uuid, bunny_video_url text, bunny_thumbnail_url text, bunny_asset_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if bunny_video_url !~* '^https://[a-z0-9-]+\.b-cdn\.net/[0-9a-f-]+/playlist\.m3u8$'
    or bunny_thumbnail_url !~* '^https://[a-z0-9-]+\.b-cdn\.net/'
    or bunny_asset_id !~* '^bunny:[0-9a-f-]+:[0-9a-f-]+$' then
    raise exception 'Invalid Bunny Clip media references' using errcode = '22023';
  end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  update public.clips set video_url = bunny_video_url,
    thumbnail_url = bunny_thumbnail_url, bunny_asset_id = $4
  where id = target_clip_id and deleted_at is null;
  if not found then raise exception 'Clip not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.prepare_elite_expiry_policy(run_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare warning_count integer := 0; cleanup_count integer := 0;
begin
  update public.vendor_notifications notification
  set is_read = true, read_at = coalesce(read_at, run_at),
      metadata = metadata || jsonb_build_object('resolved_at', run_at)
  where notification.kind = 'elite_expiry_warning' and not notification.is_read
    and not exists (
      select 1 from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.id = (notification.metadata->>'subscription_id')::uuid
        and subscription.vendor_id = notification.vendor_id and lower(plan.slug) = 'elite'
        and subscription.expiry_date is not null and subscription.expiry_date > run_at
        and subscription.expiry_date <= run_at + interval '5 days'
    );
  with candidates as (
    select subscription.id subscription_id, subscription.vendor_id, subscription.expiry_date,
      greatest(1, ceil(extract(epoch from (subscription.expiry_date - run_at)) / 86400.0)::integer) days_remaining
    from public.vendor_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    where lower(plan.slug) = 'elite' and subscription.status in ('active', 'cancelled')
      and subscription.expiry_date > run_at and subscription.expiry_date <= run_at + interval '5 days'
  ), inserted as (
    insert into public.vendor_notifications(vendor_id, title, body, kind, target_path, metadata)
    select vendor_id, 'Your Elite plan ends soon',
      'Your Elite subscription ends in ' || days_remaining || case when days_remaining = 1 then ' day.' else ' days.' end ||
      ' Renew it to keep your Clips. If Elite access ends, all your Clips will be permanently deleted from your dashboard and the public app.',
      'elite_expiry_warning', '/VendorSubscription',
      jsonb_build_object('event_key', 'elite-expiry:' || subscription_id::text || ':' || expiry_date::text,
        'subscription_id', subscription_id, 'expires_at', expiry_date,
        'days_remaining', days_remaining, 'push_status', 'pending')
    from candidates on conflict ((metadata->>'event_key')) where metadata ? 'event_key' do nothing returning id
  ) select count(*) into warning_count from inserted;
  with queued as (
    insert into private.clip_media_deletion_outbox(clip_id, vendor_id, bunny_asset_id, reason)
    select clip.id, clip.vendor_id, clip.bunny_asset_id, 'elite_subscription_ended'
    from public.clips clip where not exists (
      select 1 from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.vendor_id = clip.vendor_id and lower(plan.slug) = 'elite' and (
        (subscription.status = 'active' and (subscription.expiry_date is null or subscription.expiry_date > run_at))
        or (subscription.status = 'trial' and coalesce(subscription.trial_end_date, subscription.expiry_date) > run_at)
        or (subscription.status in ('past_due','grace_period') and subscription.grace_period_end_date > run_at)
        or (subscription.status = 'cancelled' and subscription.expiry_date > run_at)
      )
    ) on conflict (clip_id) do nothing returning clip_id
  ) select count(*) into cleanup_count from queued;
  return jsonb_build_object('warnings_created', warning_count, 'clips_queued', cleanup_count);
end;
$$;

drop function if exists public.list_pending_elite_clip_deletions(integer);
create function public.list_pending_elite_clip_deletions(batch_size integer default 50)
returns table(clip_id uuid, vendor_id uuid, bunny_asset_id text)
language sql security definer set search_path = '' as $$
  select job.clip_id, job.vendor_id, job.bunny_asset_id
  from private.clip_media_deletion_outbox job
  order by job.created_at limit greatest(1, least(batch_size, 100));
$$;

update public.application_settings
set value = jsonb_set(value, '{content}', to_jsonb(replace(value->>'content', 'Cloudinary', 'Bunny.net'))),
    updated_at = now()
where key in ('privacy_policy', 'terms_and_conditions')
  and value->>'content' like '%Cloudinary%';

revoke all on function public.finalize_clip_upload(uuid,jsonb) from public, anon;
grant execute on function public.finalize_clip_upload(uuid,jsonb) to authenticated;
revoke all on function public.vendor_soft_delete_clip(uuid) from public, anon;
grant execute on function public.vendor_soft_delete_clip(uuid) to authenticated;
revoke all on function public.vendor_replace_oldest_clip(uuid) from public, anon;
grant execute on function public.vendor_replace_oldest_clip(uuid) to authenticated;
revoke all on function public.admin_hard_delete_clip(uuid,text) from public, anon;
grant execute on function public.admin_hard_delete_clip(uuid,text) to authenticated;
revoke all on function public.list_pending_elite_clip_deletions(integer) from public, anon, authenticated;
grant execute on function public.list_pending_elite_clip_deletions(integer) to service_role;

notify pgrst, 'reload schema';
commit;
