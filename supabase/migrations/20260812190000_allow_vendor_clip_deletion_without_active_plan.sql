-- Vendors retain the right to remove their own media after a subscription
-- expires. Ownership remains mandatory; only the feature-entitlement check is
-- removed from deletion. Uploading and editing continue to require access.
create or replace function public.vendor_soft_delete_clip(target_clip_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_public_id text;
  target_vendor_id uuid;
begin
  select clip.vendor_id into target_vendor_id
  from public.clips clip
  where clip.id = target_clip_id and clip.deleted_at is null;

  if target_vendor_id is null or not private.owns_vendor(target_vendor_id) then
    raise exception 'Owned Clip not found';
  end if;

  perform set_config('app.clip_vendor_rpc', 'on', true);
  update public.clips clip
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where clip.id = target_clip_id and clip.deleted_at is null
  returning cloudinary_public_id into result_public_id;

  return result_public_id;
end;
$$;

revoke all on function public.vendor_soft_delete_clip(uuid) from public, anon;
grant execute on function public.vendor_soft_delete_clip(uuid) to authenticated;
