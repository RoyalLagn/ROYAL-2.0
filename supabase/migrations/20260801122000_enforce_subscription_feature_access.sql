begin;

-- Existing public read policies are intentionally left untouched. These
-- policies only gate vendor mutations and continue to allow administrators.

drop policy if exists "vendors_owner_or_admin_update" on public.vendors;
create policy "vendors_owner_or_admin_update"
on public.vendors for update to authenticated
using (
  private.is_admin()
  or (
    private.owns_vendor(id)
    and private.vendor_has_subscription_feature(id, 'edit_vendor_profile')
  )
)
with check (
  private.is_admin()
  or (
    profile_id = auth.uid()
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid() and profile.is_active
    )
    and private.vendor_has_subscription_feature(id, 'edit_vendor_profile')
  )
);

drop policy if exists "vendor_services_owner_or_admin_insert" on public.vendor_services;
drop policy if exists "vendor_services_owner_or_admin_update" on public.vendor_services;
drop policy if exists "vendor_services_owner_or_admin_delete" on public.vendor_services;

create policy "vendor_services_owner_or_admin_insert"
on public.vendor_services for insert to authenticated
with check (
  private.is_admin()
  or (
    private.owns_vendor(vendor_id)
    and private.vendor_has_subscription_feature(vendor_id, 'edit_vendor_profile')
  )
);

create policy "vendor_services_owner_or_admin_update"
on public.vendor_services for update to authenticated
using (
  private.is_admin()
  or (
    private.owns_vendor(vendor_id)
    and private.vendor_has_subscription_feature(vendor_id, 'edit_vendor_profile')
  )
)
with check (
  private.is_admin()
  or (
    private.owns_vendor(vendor_id)
    and private.vendor_has_subscription_feature(vendor_id, 'edit_vendor_profile')
  )
);

create policy "vendor_services_owner_or_admin_delete"
on public.vendor_services for delete to authenticated
using (
  private.is_admin()
  or (
    private.owns_vendor(vendor_id)
    and private.vendor_has_subscription_feature(vendor_id, 'edit_vendor_profile')
  )
);

drop policy if exists "albums_owner_manage" on public.vendor_portfolio_albums;
create policy "albums_owner_read" on public.vendor_portfolio_albums
for select to authenticated
using (private.workspace_vendor_owned(vendor_id));
create policy "albums_owner_insert" on public.vendor_portfolio_albums
for insert to authenticated
with check (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'manage_albums')
);
create policy "albums_owner_update" on public.vendor_portfolio_albums
for update to authenticated
using (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'manage_albums')
)
with check (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'manage_albums')
);
create policy "albums_owner_delete" on public.vendor_portfolio_albums
for delete to authenticated
using (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'manage_albums')
);

drop policy if exists "media_owner_manage" on public.vendor_portfolio_media;
create policy "media_owner_read" on public.vendor_portfolio_media
for select to authenticated
using (private.workspace_vendor_owned(vendor_id));
create policy "media_owner_insert" on public.vendor_portfolio_media
for insert to authenticated
with check (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
  and exists (
    select 1 from public.vendor_portfolio_albums album
    where album.id = album_id and album.vendor_id = vendor_id
  )
);
create policy "media_owner_update" on public.vendor_portfolio_media
for update to authenticated
using (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
)
with check (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
  and exists (
    select 1 from public.vendor_portfolio_albums album
    where album.id = album_id and album.vendor_id = vendor_id
  )
);
create policy "media_owner_delete" on public.vendor_portfolio_media
for delete to authenticated
using (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
);

drop policy if exists "hero_owner_manage" on public.vendor_portfolio_hero_media;
create policy "hero_owner_read" on public.vendor_portfolio_hero_media
for select to authenticated
using (private.workspace_vendor_owned(vendor_id));
create policy "hero_owner_insert" on public.vendor_portfolio_hero_media
for insert to authenticated
with check (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
);
create policy "hero_owner_update" on public.vendor_portfolio_hero_media
for update to authenticated
using (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
)
with check (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
);
create policy "hero_owner_delete" on public.vendor_portfolio_hero_media
for delete to authenticated
using (
  private.workspace_vendor_owned(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_gallery')
);

create or replace function public.replace_vendor_hero_media(
  target_vendor_id uuid,
  target_media_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_id_item uuid;
  item_order integer := 0;
  selected_count integer := coalesce(array_length(target_media_ids, 1), 0);
  available_count integer;
begin
  if not private.workspace_vendor_owned(target_vendor_id) then
    raise exception 'Not authorized to manage this vendor portfolio';
  end if;
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_gallery') then
    raise exception 'An active subscription is required to manage the hero gallery'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  if selected_count > 8 then
    raise exception 'The hero gallery can contain a maximum of 8 images';
  end if;
  if (
    select count(distinct item)
    from unnest(coalesce(target_media_ids, '{}'::uuid[])) item
  ) <> coalesce(array_length(target_media_ids, 1), 0) then
    raise exception 'Hero gallery images must be unique';
  end if;
  select count(*) into available_count
  from public.vendor_portfolio_media media
  join public.vendor_portfolio_albums album on album.id = media.album_id
  where media.vendor_id = target_vendor_id
    and media.resource_type = 'image'
    and media.upload_status = 'completed'
    and media.processing_status = 'ready'
    and album.is_visible;
  if selected_count > 0 and selected_count < least(5, available_count) then
    raise exception 'Choose at least % ready hero images', least(5, available_count);
  end if;
  delete from public.vendor_portfolio_hero_media where vendor_id = target_vendor_id;
  foreach media_id_item in array coalesce(target_media_ids, '{}'::uuid[]) loop
    insert into public.vendor_portfolio_hero_media(vendor_id, media_id, display_order)
    values (target_vendor_id, media_id_item, item_order);
    item_order := item_order + 1;
  end loop;
end;
$$;

drop policy if exists clips_vendor_insert on public.clips;
create policy clips_vendor_insert
on public.clips for insert to authenticated
with check (
  private.owns_vendor(vendor_id)
  and private.vendor_has_subscription_feature(vendor_id, 'upload_clips')
  and deleted_at is null
  and (
    (status in ('draft', 'pending') and published_at is null)
    or (
      status = 'approved'
      and visibility = 'public'
      and published_at is not null
    )
  )
);

drop policy if exists clips_vendor_update on public.clips;
create policy clips_vendor_update
on public.clips for update to authenticated
using (
  private.is_admin()
  or (
    private.owns_vendor(vendor_id)
    and private.vendor_has_subscription_feature(vendor_id, 'upload_clips')
  )
)
with check (
  private.is_admin()
  or (
    private.owns_vendor(vendor_id)
    and private.vendor_has_subscription_feature(vendor_id, 'upload_clips')
  )
);

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
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_clips') then
    raise exception 'An active subscription is required to manage Clips'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  update public.clips clip
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where clip.id = target_clip_id and clip.deleted_at is null
  returning cloudinary_public_id into result_public_id;
  return result_public_id;
end;
$$;

create or replace function public.vendor_replace_oldest_clip(target_vendor_id uuid)
returns table (clip_id uuid, cloudinary_public_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owns_vendor(target_vendor_id) then
    raise exception 'Vendor ownership required';
  end if;
  if not private.vendor_has_subscription_feature(target_vendor_id, 'upload_clips') then
    raise exception 'An active subscription is required to manage Clips'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  return query
  update public.clips clip
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where clip.id = (
    select candidate.id from public.clips candidate
    where candidate.vendor_id = target_vendor_id
      and candidate.status = 'approved' and candidate.deleted_at is null
    order by candidate.published_at asc nulls last, candidate.created_at asc
    limit 1 for update
  )
  returning clip.id, clip.cloudinary_public_id;
end;
$$;

commit;
