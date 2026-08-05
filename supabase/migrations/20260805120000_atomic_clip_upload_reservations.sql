begin;

-- Vendor Clip uploads previously enforced the per-plan Clip limit with a
-- client-side "select count(*) ... then insert" sequence
-- (clips/services/ClipUploadOrchestrator.ts). That check-then-act pattern
-- is not atomic: two concurrent uploads (two tabs, a retried request
-- racing the original) can both read a count under the limit and both
-- insert, letting a vendor exceed their plan's Clip limit. This migration
-- moves the authoritative limit check into the database behind a
-- reservation table and two SECURITY DEFINER RPCs, serialized with a
-- per-vendor advisory lock so the count-then-act sequence can no longer
-- race across concurrent transactions.

create table public.clip_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'cancelled', 'expired')),
  clip_id uuid references public.clips(id) on delete set null,
  created_at timestamptz not null default now(),
  -- A slot is only held for 15 minutes. If the Cloudinary upload never
  -- finishes (network loss, app killed mid-upload, browser tab closed),
  -- the reservation stops counting toward the limit once it expires
  -- instead of permanently locking a slot the vendor never used.
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  constraint clip_upload_reservations_unique_key unique (vendor_id, idempotency_key)
);

create index clip_upload_reservations_vendor_active_idx
  on public.clip_upload_reservations (vendor_id)
  where status = 'reserved';

alter table public.clip_upload_reservations enable row level security;

revoke all on public.clip_upload_reservations from anon, authenticated;
grant select on public.clip_upload_reservations to authenticated;

-- Reads are useful for the client to show reservation status; every write
-- happens exclusively through the SECURITY DEFINER functions below so the
-- limit check cannot be bypassed by inserting/updating a reservation row
-- directly.
create policy clip_upload_reservations_owner_read
on public.clip_upload_reservations for select to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());

create or replace function private.vendor_clip_limit(target_vendor_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select plan_feature.limit_value
      from public.subscription_effective_access(target_vendor_id, now()) access
      join public.subscription_feature_definitions feature
        on feature.feature_key = 'upload_clips' and feature.is_active
      join public.subscription_plan_features plan_feature
        on plan_feature.plan_id = access.plan_id and plan_feature.feature_id = feature.id
      where access.has_access and coalesce(plan_feature.is_enabled, false)
      limit 1
    ),
    -- Matches DEFAULT_CLIP_PLAN_LIMITS.maximumClips in clips/constants,
    -- used by the client when a plan feature has no configured
    -- limit_value.
    10
  );
$$;

revoke all on function private.vendor_clip_limit(uuid) from public, anon, authenticated;

-- Phase 1: reserve a slot before spending time/bandwidth on the Cloudinary
-- upload. Called once per queued upload with a stable idempotency key (the
-- queue item's id) so a retry of the same queued item, or a double-tap of
-- the upload button that produced the same queue item, reuses the existing
-- reservation instead of consuming a second slot.
create or replace function public.reserve_clip_upload_slot(
  target_vendor_id uuid,
  request_idempotency_key text
) returns table (reservation_id uuid, reservation_expires_at timestamptz, remaining_slots integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  clip_limit integer;
  active_count integer;
  existing public.clip_upload_reservations;
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
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_clips') then
    raise exception 'An active subscription is required to upload Clips'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;

  -- Serialize concurrent reservation attempts for the same vendor (two
  -- browser tabs, a retried request racing the original) so the count
  -- check below can never be evaluated by two transactions before either
  -- one commits its reservation.
  perform pg_advisory_xact_lock(hashtext(target_vendor_id::text));

  clip_limit := private.vendor_clip_limit(target_vendor_id);

  -- A retry/double-click reusing the same idempotency key returns the
  -- existing reservation instead of consuming another slot.
  select * into existing
  from public.clip_upload_reservations reservation
  where reservation.vendor_id = target_vendor_id
    and reservation.idempotency_key = request_idempotency_key
    and reservation.status = 'reserved'
    and reservation.expires_at > now();
  if found then
    select count(*) into active_count
    from public.clips clip
    where clip.vendor_id = target_vendor_id and clip.deleted_at is null;
    active_count := active_count + (
      select count(*) from public.clip_upload_reservations reservation
      where reservation.vendor_id = target_vendor_id
        and reservation.status = 'reserved'
        and reservation.expires_at > now()
    );
    return query select existing.id, existing.expires_at, greatest(clip_limit - active_count, 0);
    return;
  end if;

  -- Abandoned reservations stop counting once they expire.
  update public.clip_upload_reservations
  set status = 'expired'
  where vendor_id = target_vendor_id and status = 'reserved' and expires_at <= now();

  select count(*) into active_count
  from public.clips clip
  where clip.vendor_id = target_vendor_id and clip.deleted_at is null;

  active_count := active_count + (
    select count(*) from public.clip_upload_reservations reservation
    where reservation.vendor_id = target_vendor_id
      and reservation.status = 'reserved'
      and reservation.expires_at > now()
  );

  if active_count >= clip_limit then
    raise exception 'You have reached your limit of % Clips.', clip_limit
      using errcode = 'P0001', hint = 'LIMIT_REACHED';
  end if;

  insert into public.clip_upload_reservations (vendor_id, idempotency_key)
  values (target_vendor_id, request_idempotency_key)
  returning id, expires_at into new_id, new_expires;

  return query select new_id, new_expires, greatest(clip_limit - active_count - 1, 0);
end;
$$;

revoke all on function public.reserve_clip_upload_slot(uuid, text) from public, anon;
grant execute on function public.reserve_clip_upload_slot(uuid, text) to authenticated;

-- Phase 2: after the Cloudinary upload finishes, atomically insert the
-- Clip row and release the reservation in one transaction. Idempotent: if
-- the client retries after losing the response (upload succeeded on the
-- server, ack lost on the wire), the already-created Clip is returned
-- instead of inserting a duplicate.
create or replace function public.finalize_clip_upload(
  target_reservation_id uuid,
  clip_row jsonb
) returns public.clips
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.clip_upload_reservations;
  inserted public.clips;
  target_vendor_id uuid;
begin
  select * into reservation
  from public.clip_upload_reservations
  where id = target_reservation_id
  for update;

  if not found then
    raise exception 'Upload reservation not found.' using errcode = 'P0002';
  end if;
  target_vendor_id := reservation.vendor_id;
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;

  if reservation.status = 'completed' and reservation.clip_id is not null then
    select * into inserted from public.clips where id = reservation.clip_id;
    if found then
      return inserted;
    end if;
  end if;

  if reservation.status <> 'reserved' or reservation.expires_at <= now() then
    raise exception 'This upload reservation has expired. Start the upload again.'
      using errcode = 'P0003', hint = 'RESERVATION_EXPIRED';
  end if;

  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_clips') then
    raise exception 'An active subscription is required to upload Clips'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;

  insert into public.clips (
    id, vendor_id, category_id, title, caption, video_url, thumbnail_url,
    duration_seconds, width, height, file_size_bytes, cloudinary_public_id,
    status, visibility, published_at
  ) values (
    coalesce(nullif(clip_row->>'id', '')::uuid, gen_random_uuid()),
    target_vendor_id,
    (clip_row->>'category_id')::uuid,
    clip_row->>'title',
    nullif(clip_row->>'caption', ''),
    clip_row->>'video_url',
    clip_row->>'thumbnail_url',
    (clip_row->>'duration_seconds')::numeric,
    (clip_row->>'width')::integer,
    (clip_row->>'height')::integer,
    (clip_row->>'file_size_bytes')::bigint,
    clip_row->>'cloudinary_public_id',
    'approved', 'public', now()
  )
  returning * into inserted;

  update public.clip_upload_reservations
  set status = 'completed', clip_id = inserted.id, completed_at = now()
  where id = target_reservation_id;

  return inserted;
end;
$$;

revoke all on function public.finalize_clip_upload(uuid, jsonb) from public, anon;
grant execute on function public.finalize_clip_upload(uuid, jsonb) to authenticated;

-- Lets the client release a slot immediately when the vendor cancels an
-- in-progress upload, instead of waiting out the 15 minute expiry.
create or replace function public.cancel_clip_upload_reservation(target_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.clip_upload_reservations;
begin
  select * into reservation
  from public.clip_upload_reservations
  where id = target_reservation_id
  for update;
  if not found then
    return;
  end if;
  if not private.owns_vendor(reservation.vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;
  if reservation.status = 'reserved' then
    update public.clip_upload_reservations set status = 'cancelled' where id = target_reservation_id;
  end if;
end;
$$;

revoke all on function public.cancel_clip_upload_reservation(uuid) from public, anon;
grant execute on function public.cancel_clip_upload_reservation(uuid) to authenticated;

-- The direct-insert policy is superseded by finalize_clip_upload(), which
-- performs the same ownership/feature checks plus the atomic limit check
-- before inserting. Keeping the old direct-insert policy around would let
-- a client bypass the reservation/limit system entirely by calling
-- `.from("clips").insert(...)` directly, so it is removed here.
drop policy if exists clips_vendor_insert on public.clips;

commit;
