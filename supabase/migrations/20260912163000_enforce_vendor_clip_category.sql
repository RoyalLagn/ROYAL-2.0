begin;

-- A Clip belongs to the same marketplace category as its vendor. The client
-- still includes category_id for compatibility with older deployed versions,
-- but this authoritative write path deliberately ignores that value.
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
  vendor_category_id uuid;
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

  select vendor.category_id into vendor_category_id
  from public.vendors vendor
  where vendor.id = target_vendor_id;

  if vendor_category_id is null then
    raise exception 'Complete your Business information before uploading a Clip.'
      using errcode = '23502', hint = 'VENDOR_CATEGORY_REQUIRED';
  end if;

  insert into public.clips (
    id, vendor_id, category_id, title, caption, video_url, thumbnail_url,
    duration_seconds, width, height, file_size_bytes, cloudinary_public_id,
    status, visibility, published_at
  ) values (
    coalesce(nullif(clip_row->>'id', '')::uuid, gen_random_uuid()),
    target_vendor_id,
    vendor_category_id,
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

commit;
