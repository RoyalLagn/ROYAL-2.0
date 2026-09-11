begin;

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

  perform pg_advisory_xact_lock(hashtext(target_vendor_id::text));
  clip_limit := private.vendor_clip_limit(target_vendor_id);

  select * into existing
  from public.clip_upload_reservations reservation
  where reservation.vendor_id = target_vendor_id
    and reservation.idempotency_key = request_idempotency_key
    and reservation.status = 'reserved'
    and reservation.expires_at > now();
  if found then
    select count(*) into active_count from public.clips clip
    where clip.vendor_id = target_vendor_id and clip.deleted_at is null;
    active_count := active_count + (
      select count(*) from public.clip_upload_reservations reservation
      where reservation.vendor_id = target_vendor_id
        and reservation.status = 'reserved' and reservation.expires_at > now()
    );
    return query select existing.id, existing.expires_at, greatest(clip_limit - active_count, 0);
    return;
  end if;

  update public.clip_upload_reservations set status = 'expired'
  where vendor_id = target_vendor_id and status = 'reserved' and expires_at <= now();

  -- A failed queue item keeps the same idempotency key. Remove only its
  -- inactive reservation so the retry can reserve the slot again.
  delete from public.clip_upload_reservations
  where vendor_id = target_vendor_id
    and idempotency_key = request_idempotency_key
    and status in ('cancelled', 'expired');

  select count(*) into active_count from public.clips clip
  where clip.vendor_id = target_vendor_id and clip.deleted_at is null;
  active_count := active_count + (
    select count(*) from public.clip_upload_reservations reservation
    where reservation.vendor_id = target_vendor_id
      and reservation.status = 'reserved' and reservation.expires_at > now()
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

commit;
