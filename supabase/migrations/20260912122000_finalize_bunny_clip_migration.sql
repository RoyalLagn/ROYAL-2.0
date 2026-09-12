create or replace function public.finalize_bunny_clip_migration(
  target_clip_id uuid,
  bunny_video_url text,
  bunny_thumbnail_url text,
  bunny_asset_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if bunny_video_url !~* '^https://[a-z0-9-]+\.b-cdn\.net/[0-9a-f-]+/playlist\.m3u8$'
    or bunny_thumbnail_url !~* '^https://[a-z0-9-]+\.b-cdn\.net/clips/'
    or bunny_asset_id !~* '^bunny:[0-9a-f-]+:[0-9a-f-]+$' then
    raise exception 'Invalid Bunny Clip media references' using errcode = '22023';
  end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  update public.clips set
    video_url = bunny_video_url,
    thumbnail_url = bunny_thumbnail_url,
    cloudinary_public_id = bunny_asset_id
  where id = target_clip_id and deleted_at is null;
  if not found then raise exception 'Clip not found' using errcode = 'P0002'; end if;
end
$$;

revoke all on function public.finalize_bunny_clip_migration(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_bunny_clip_migration(uuid,text,text,text) to service_role;
