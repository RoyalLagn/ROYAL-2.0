begin;

-- Shared snapshot-aware feature/limit resolver ------------------------
--
-- Today private.vendor_clip_limit() (added in
-- 20260805120000_atomic_clip_upload_reservations.sql) always joins the
-- *live* subscription_plan_features for the vendor's current plan_id. That
-- means editing a plan's limit_value instantly changes it for every vendor
-- on that plan, including someone who already paid for the old numbers.
-- This function is the single place that decides whether a feature/limit
-- comes from the vendor's purchased plan_snapshot (paid, currently
-- active/past_due/grace_period) or from the live plan configuration
-- (everyone else: free, trial, launch_offer, admin_grant, free_fallback,
-- or a paid row with no snapshot yet from before this migration).
create or replace function private.subscription_effective_feature(
  target_vendor_id uuid,
  requested_feature_key text,
  evaluated_at timestamptz default now()
) returns table (is_enabled boolean, limit_value integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access record;
  current_subscription public.vendor_subscriptions%rowtype;
  snapshot_feature jsonb;
begin
  select * into access
  from public.subscription_effective_access(target_vendor_id, evaluated_at)
  limit 1;

  if access.subscription_id is not null then
    select * into current_subscription
    from public.vendor_subscriptions
    where id = access.subscription_id;
  end if;

  if access.has_access
    and current_subscription.id is not null
    and current_subscription.access_source = 'paid_subscription'
    and current_subscription.status in ('active', 'past_due', 'grace_period', 'cancelled')
    and current_subscription.plan_snapshot is not null
  then
    snapshot_feature := current_subscription.plan_snapshot #> array['features', requested_feature_key];
    if snapshot_feature is not null then
      return query select
        coalesce((snapshot_feature->>'is_enabled')::boolean, false),
        nullif(snapshot_feature->>'limit_value', '')::integer;
      return;
    end if;
  end if;

  if not access.has_access or access.plan_id is null then
    return query select false, null::integer;
    return;
  end if;

  return query
  select coalesce(plan_feature.is_enabled, false), plan_feature.limit_value
  from public.subscription_feature_definitions feature
  left join public.subscription_plan_features plan_feature
    on plan_feature.plan_id = access.plan_id and plan_feature.feature_id = feature.id
  where feature.feature_key = requested_feature_key and feature.is_active
  limit 1;
end;
$$;

revoke all on function private.subscription_effective_feature(uuid, text, timestamptz) from public, anon, authenticated;

-- vendor_has_subscription_feature now delegates its is_enabled check
-- through the snapshot-aware resolver above instead of joining live
-- features directly, so every RLS policy and RPC that already calls it
-- (vendors, vendor_services, albums, media, clips policies from
-- 20260801122000_enforce_subscription_feature_access.sql) becomes
-- snapshot-aware for free.
create or replace function private.vendor_has_subscription_feature(
  target_vendor_id uuid,
  requested_feature_key text,
  evaluated_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or coalesce((
    select feature.is_enabled
    from private.subscription_effective_feature(target_vendor_id, requested_feature_key, evaluated_at) feature
    limit 1
  ), false);
$$;

-- vendor_clip_limit is redefined to use the same resolver instead of its
-- own live-only join, so it now honors a purchased Silver/Premium clip
-- limit even after the admin changes the live plan's numbers.
create or replace function private.vendor_clip_limit(target_vendor_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select feature.limit_value
      from private.subscription_effective_feature(target_vendor_id, 'upload_clips') feature
      where feature.is_enabled
      limit 1
    ),
    -- Matches DEFAULT_CLIP_PLAN_LIMITS.maximumClips in clips/constants,
    -- used by the client when a plan feature has no configured
    -- limit_value.
    10
  );
$$;

revoke all on function private.vendor_clip_limit(uuid) from public, anon, authenticated;

-- Total-photos-across-all-albums limit, the photo equivalent of
-- vendor_clip_limit above.
create or replace function private.vendor_photo_limit(target_vendor_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select feature.limit_value
      from private.subscription_effective_feature(target_vendor_id, 'upload_gallery') feature
      where feature.is_enabled
      limit 1
    ),
    10
  );
$$;

revoke all on function private.vendor_photo_limit(uuid) from public, anon, authenticated;

-- Photo upload reservations --------------------------------------------
--
-- Line-for-line the same shape and locking strategy as
-- clip_upload_reservations / reserve_clip_upload_slot / finalize_clip_upload
-- / cancel_clip_upload_reservation (20260805120000), applied to
-- vendor_portfolio_media instead of clips, and counting active media
-- across *all* of a vendor's albums (the existing per-album cap of 15 in
-- the cloudinary-sign edge function is unrelated and untouched).

create table public.photo_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  idempotency_key text not null,
  resource_type text not null default 'image' check (resource_type in ('image', 'video')),
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'cancelled', 'expired')),
  media_id uuid references public.vendor_portfolio_media(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  constraint photo_upload_reservations_unique_key unique (vendor_id, idempotency_key)
);

create index photo_upload_reservations_vendor_active_idx
  on public.photo_upload_reservations (vendor_id)
  where status = 'reserved';

alter table public.photo_upload_reservations enable row level security;
revoke all on public.photo_upload_reservations from anon, authenticated;
grant select on public.photo_upload_reservations to authenticated;

create policy photo_upload_reservations_owner_read
on public.photo_upload_reservations for select to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());

create or replace function public.reserve_photo_upload_slot(
  target_vendor_id uuid,
  request_idempotency_key text,
  upload_resource_type text default 'image'
) returns table (reservation_id uuid, reservation_expires_at timestamptz, remaining_slots integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_limit integer;
  active_count integer;
  existing public.photo_upload_reservations;
  new_id uuid;
  new_expires timestamptz;
begin
  if target_vendor_id is null then
    raise exception 'target_vendor_id is required' using errcode = '22023';
  end if;
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;
  if coalesce(btrim(request_idempotency_key), '') = '' then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  if upload_resource_type not in ('image', 'video') then
    raise exception 'Unsupported portfolio resource type' using errcode = '22023';
  end if;
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_gallery') then
    raise exception 'An active subscription is required to upload photos'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;

  -- Serialize concurrent reservation attempts for the same vendor so two
  -- browser tabs (or a retried request) can never both read the count
  -- under the limit before either commits its reservation.
  perform pg_advisory_xact_lock(hashtext('photo:' || target_vendor_id::text));

  photo_limit := private.vendor_photo_limit(target_vendor_id);

  select * into existing
  from public.photo_upload_reservations reservation
  where reservation.vendor_id = target_vendor_id
    and reservation.idempotency_key = request_idempotency_key
    and reservation.resource_type = upload_resource_type
    and reservation.status = 'reserved'
    and reservation.expires_at > now();
  if found then
    select count(*) into active_count
    from public.vendor_portfolio_media media
    where media.vendor_id = target_vendor_id and media.resource_type = 'image';
    active_count := active_count + (
      select count(*) from public.photo_upload_reservations reservation
      where reservation.vendor_id = target_vendor_id
        and reservation.resource_type = 'image'
        and reservation.status = 'reserved'
        and reservation.expires_at > now()
    );
    return query select existing.id, existing.expires_at, greatest(photo_limit - active_count, 0);
    return;
  end if;

  update public.photo_upload_reservations
  set status = 'expired'
  where vendor_id = target_vendor_id and status = 'reserved' and expires_at <= now();

  select count(*) into active_count
  from public.vendor_portfolio_media media
  where media.vendor_id = target_vendor_id and media.resource_type = 'image';

  active_count := active_count + (
    select count(*) from public.photo_upload_reservations reservation
    where reservation.vendor_id = target_vendor_id
      and reservation.resource_type = 'image'
      and reservation.status = 'reserved'
      and reservation.expires_at > now()
  );

  if upload_resource_type = 'image' and active_count >= photo_limit then
    raise exception 'You have reached your limit of % photos.', photo_limit
      using errcode = 'P0001', hint = 'LIMIT_REACHED';
  end if;

  insert into public.photo_upload_reservations (vendor_id, idempotency_key, resource_type)
  values (target_vendor_id, request_idempotency_key, upload_resource_type)
  returning id, expires_at into new_id, new_expires;

  return query select new_id, new_expires,
    greatest(photo_limit - active_count - case when upload_resource_type = 'image' then 1 else 0 end, 0);
end;
$$;

revoke all on function public.reserve_photo_upload_slot(uuid, text, text) from public, anon;
grant execute on function public.reserve_photo_upload_slot(uuid, text, text) to authenticated;

create or replace function public.finalize_photo_upload(
  target_reservation_id uuid,
  media_row jsonb
) returns public.vendor_portfolio_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.photo_upload_reservations;
  inserted public.vendor_portfolio_media;
  target_vendor_id uuid;
  target_album_id uuid;
begin
  select * into reservation
  from public.photo_upload_reservations
  where id = target_reservation_id
  for update;

  if not found then
    raise exception 'Upload reservation not found.' using errcode = 'P0002';
  end if;
  target_vendor_id := reservation.vendor_id;
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;

  if reservation.status = 'completed' and reservation.media_id is not null then
    select * into inserted from public.vendor_portfolio_media where id = reservation.media_id;
    if found then
      return inserted;
    end if;
  end if;

  if reservation.status <> 'reserved' or reservation.expires_at <= now() then
    raise exception 'This upload reservation has expired. Start the upload again.'
      using errcode = 'P0003', hint = 'RESERVATION_EXPIRED';
  end if;

  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_gallery') then
    raise exception 'An active subscription is required to upload photos'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  if coalesce(media_row->>'resource_type', 'image') <> reservation.resource_type then
    raise exception 'Uploaded media type does not match its reservation' using errcode = '22023';
  end if;

  target_album_id := nullif(media_row->>'album_id', '')::uuid;
  if target_album_id is null or not exists (
    select 1 from public.vendor_portfolio_albums album
    where album.id = target_album_id and album.vendor_id = target_vendor_id
  ) then
    raise exception 'A valid owned album is required';
  end if;

  insert into public.vendor_portfolio_media (
    id, vendor_id, album_id, secure_url, public_id, resource_type, format,
    width, height, duration, bytes, original_size_bytes, optimized_size_bytes,
    optimized_url, hero_url, fullscreen_url, video_poster_url, aspect_ratio,
    source_fingerprint, thumbnail_url, display_order, is_cover,
    upload_status, processing_status
  ) values (
    coalesce(nullif(media_row->>'id', '')::uuid, gen_random_uuid()),
    target_vendor_id,
    target_album_id,
    media_row->>'secure_url',
    media_row->>'public_id',
    media_row->>'resource_type',
    media_row->>'format',
    (media_row->>'width')::integer,
    (media_row->>'height')::integer,
    (media_row->>'duration')::numeric,
    (media_row->>'bytes')::bigint,
    (media_row->>'original_size_bytes')::bigint,
    (media_row->>'optimized_size_bytes')::bigint,
    media_row->>'optimized_url',
    media_row->>'hero_url',
    media_row->>'fullscreen_url',
    media_row->>'video_poster_url',
    (media_row->>'aspect_ratio')::numeric,
    media_row->>'source_fingerprint',
    media_row->>'thumbnail_url',
    coalesce((media_row->>'display_order')::integer, 0),
    coalesce((media_row->>'is_cover')::boolean, false),
    coalesce(media_row->>'upload_status', 'completed'),
    coalesce(media_row->>'processing_status', 'ready')
  )
  returning * into inserted;

  update public.photo_upload_reservations
  set status = 'completed', media_id = inserted.id, completed_at = now()
  where id = target_reservation_id;

  return inserted;
end;
$$;

revoke all on function public.finalize_photo_upload(uuid, jsonb) from public, anon;
grant execute on function public.finalize_photo_upload(uuid, jsonb) to authenticated;

create or replace function public.cancel_photo_upload_reservation(target_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.photo_upload_reservations;
begin
  select * into reservation
  from public.photo_upload_reservations
  where id = target_reservation_id
  for update;
  if not found then
    return;
  end if;
  if not private.owns_vendor(reservation.vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;
  if reservation.status = 'reserved' then
    update public.photo_upload_reservations set status = 'cancelled' where id = target_reservation_id;
  end if;
end;
$$;

revoke all on function public.cancel_photo_upload_reservation(uuid) from public, anon;
grant execute on function public.cancel_photo_upload_reservation(uuid) to authenticated;

-- As with clips_vendor_insert in the atomic clip migration, the direct
-- client insert policy on vendor_portfolio_media is superseded by
-- finalize_photo_upload(), which performs the same ownership/feature
-- checks plus the atomic total-photo limit check before inserting. Leaving
-- the old direct-insert policy in place would let a client bypass the
-- reservation/limit system entirely via `.from("vendor_portfolio_media").insert(...)`.
drop policy if exists "media_owner_insert" on public.vendor_portfolio_media;

commit;
