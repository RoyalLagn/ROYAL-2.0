-- Rename provider identities without deleting media or audit history.
-- Existing function auth checks, ownership and execute grants are preserved.
begin;
set local lock_timeout = '5s';

alter table public.clips rename column bunny_asset_id to cloudinary_public_id;
alter table public.clip_deletion_log rename column bunny_asset_id to cloudinary_public_id;
alter table private.clip_media_deletion_outbox rename column bunny_asset_id to cloudinary_public_id;

drop function public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text);
drop function public.list_pending_elite_clip_deletions(batch_size integer);
drop function public.vendor_replace_oldest_clip(target_vendor_id uuid);

CREATE OR REPLACE FUNCTION public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text)
 RETURNS TABLE(vendor_id uuid, cloudinary_public_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare clip record; trimmed_reason text := btrim(coalesce(deletion_reason, ''));
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if trimmed_reason = '' then raise exception 'A deletion reason is required'; end if;
  select c.id, c.vendor_id, c.category_id, c.title, c.cloudinary_public_id into clip
  from public.clips c where c.id = target_clip_id for update;
  if clip.id is null then raise exception 'Clip not found'; end if;
  insert into public.clip_deletion_log (
    clip_id, vendor_id, category_id, clip_title, reason, deleted_by, cloudinary_public_id
  ) values (
    clip.id, clip.vendor_id, clip.category_id, clip.title, trimmed_reason, auth.uid(), clip.cloudinary_public_id
  );
  delete from public.clips where id = target_clip_id;
  return query select clip.vendor_id, clip.cloudinary_public_id;
end;
$function$
;
alter function public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text) owner to postgres;
revoke all on function public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text) from public, anon, authenticated, service_role;
grant execute on function public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text) to authenticated;

CREATE OR REPLACE FUNCTION public.finalize_clip_upload(target_reservation_id uuid, clip_row jsonb)
 RETURNS clips
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    duration_seconds, width, height, file_size_bytes, cloudinary_public_id,
    status, visibility, published_at
  ) values (
    coalesce(nullif(clip_row->>'id', '')::uuid, gen_random_uuid()),
    target_vendor_id, vendor_category_id, clip_row->>'title',
    nullif(clip_row->>'caption', ''), clip_row->>'video_url',
    clip_row->>'thumbnail_url', (clip_row->>'duration_seconds')::numeric,
    (clip_row->>'width')::integer, (clip_row->>'height')::integer,
    (clip_row->>'file_size_bytes')::bigint, clip_row->>'cloudinary_public_id',
    'approved', 'public', now()
  ) returning * into inserted;
  update public.clip_upload_reservations
  set status = 'completed', clip_id = inserted.id, completed_at = now()
  where id = target_reservation_id;
  return inserted;
end;
$function$
;
alter function public.finalize_clip_upload(target_reservation_id uuid, clip_row jsonb) owner to postgres;
revoke all on function public.finalize_clip_upload(target_reservation_id uuid, clip_row jsonb) from public, anon, authenticated, service_role;
grant execute on function public.finalize_clip_upload(target_reservation_id uuid, clip_row jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_elite_clip_deletions(batch_size integer DEFAULT 50)
 RETURNS TABLE(clip_id uuid, vendor_id uuid, cloudinary_public_id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select job.clip_id, job.vendor_id, job.cloudinary_public_id
  from private.clip_media_deletion_outbox job
  order by job.created_at limit greatest(1, least(batch_size, 100));
$function$
;
alter function public.list_pending_elite_clip_deletions(batch_size integer) owner to postgres;
revoke all on function public.list_pending_elite_clip_deletions(batch_size integer) from public, anon, authenticated, service_role;
grant execute on function public.list_pending_elite_clip_deletions(batch_size integer) to service_role;

CREATE OR REPLACE FUNCTION public.prepare_elite_expiry_policy(run_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    insert into private.clip_media_deletion_outbox(clip_id, vendor_id, cloudinary_public_id, reason)
    select clip.id, clip.vendor_id, clip.cloudinary_public_id, 'elite_subscription_ended'
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
$function$
;
alter function public.prepare_elite_expiry_policy(run_at timestamp with time zone) owner to postgres;
revoke all on function public.prepare_elite_expiry_policy(run_at timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.prepare_elite_expiry_policy(run_at timestamp with time zone) to service_role;

CREATE OR REPLACE FUNCTION public.vendor_replace_oldest_clip(target_vendor_id uuid)
 RETURNS TABLE(clip_id uuid, cloudinary_public_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ) returning clip.id, clip.cloudinary_public_id;
end;
$function$
;
alter function public.vendor_replace_oldest_clip(target_vendor_id uuid) owner to postgres;
revoke all on function public.vendor_replace_oldest_clip(target_vendor_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.vendor_replace_oldest_clip(target_vendor_id uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.vendor_soft_delete_clip(target_clip_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  returning cloudinary_public_id into result_asset_id;
  return result_asset_id;
end;
$function$
;
alter function public.vendor_soft_delete_clip(target_clip_id uuid) owner to postgres;
revoke all on function public.vendor_soft_delete_clip(target_clip_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.vendor_soft_delete_clip(target_clip_id uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
