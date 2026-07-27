begin;

alter table public.vendor_portfolio_media
  add column if not exists optimized_url text,
  add column if not exists hero_url text,
  add column if not exists fullscreen_url text,
  add column if not exists video_poster_url text,
  add column if not exists aspect_ratio numeric,
  add column if not exists original_size_bytes bigint,
  add column if not exists optimized_size_bytes bigint,
  add column if not exists source_fingerprint text,
  add column if not exists focal_point_x numeric not null default 0.5,
  add column if not exists focal_point_y numeric not null default 0.5,
  add column if not exists processing_status text not null default 'ready';

alter table public.vendor_portfolio_media
  drop constraint if exists vendor_portfolio_media_processing_status_check,
  add constraint vendor_portfolio_media_processing_status_check
    check (processing_status in ('uploading', 'compressing', 'processing', 'ready', 'failed')),
  drop constraint if exists vendor_portfolio_media_focal_point_x_check,
  add constraint vendor_portfolio_media_focal_point_x_check
    check (focal_point_x between 0 and 1),
  drop constraint if exists vendor_portfolio_media_focal_point_y_check,
  add constraint vendor_portfolio_media_focal_point_y_check
    check (focal_point_y between 0 and 1),
  drop constraint if exists vendor_portfolio_media_duration_check,
  add constraint vendor_portfolio_media_duration_check
    check (resource_type <> 'video' or duration is null or duration <= 240),
  drop constraint if exists vendor_portfolio_media_optimized_size_check,
  add constraint vendor_portfolio_media_optimized_size_check
    check (
      optimized_size_bytes is null
      or (resource_type = 'image' and optimized_size_bytes <= 8388608)
      or (resource_type = 'video' and optimized_size_bytes <= 26214400)
    );

update public.vendor_portfolio_media
set
  aspect_ratio = case when coalesce(height, 0) > 0 then width::numeric / height else null end,
  original_size_bytes = coalesce(original_size_bytes, bytes),
  optimized_size_bytes = coalesce(
    optimized_size_bytes,
    case
      when resource_type = 'image' and bytes <= 8388608 then bytes
      when resource_type = 'video' and bytes <= 26214400 then bytes
      else null
    end
  ),
  video_poster_url = case when resource_type = 'video' then coalesce(video_poster_url, thumbnail_url) else video_poster_url end,
  processing_status = case upload_status when 'completed' then 'ready' when 'failed' then 'failed' else 'processing' end
where aspect_ratio is null
   or original_size_bytes is null
   or optimized_size_bytes is null
   or (resource_type = 'video' and video_poster_url is null);

create table if not exists public.vendor_portfolio_hero_media (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  media_id uuid not null references public.vendor_portfolio_media(id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (vendor_id, media_id),
  unique (vendor_id, display_order)
);

create index if not exists vendor_portfolio_hero_order_idx
  on public.vendor_portfolio_hero_media(vendor_id, display_order);
create index if not exists vendor_media_public_album_idx
  on public.vendor_portfolio_media(album_id, processing_status, display_order);
create unique index if not exists vendor_media_source_fingerprint_idx
  on public.vendor_portfolio_media(vendor_id, source_fingerprint)
  where source_fingerprint is not null;

create or replace function private.validate_portfolio_album()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  album_count integer;
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  if char_length(new.title) < 1 or char_length(new.title) > 60 then
    raise exception 'Album name must be between 1 and 60 characters';
  end if;
  if new.description is not null and char_length(new.description) > 300 then
    raise exception 'Album description must not exceed 300 characters';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into album_count
    from public.vendor_portfolio_albums a
    where a.vendor_id = new.vendor_id;
    if album_count >= 5 then
      raise exception 'A vendor can create a maximum of 5 albums';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_album_validate on public.vendor_portfolio_albums;
create trigger vendor_album_validate
before insert or update of title, description, vendor_id
on public.vendor_portfolio_albums
for each row execute function private.validate_portfolio_album();

create or replace function private.validate_portfolio_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  album_vendor uuid;
  current_count integer;
begin
  select a.vendor_id into album_vendor
  from public.vendor_portfolio_albums a
  where a.id = new.album_id
  for update;
  if album_vendor is null or album_vendor <> new.vendor_id then
    raise exception 'Portfolio album does not belong to this vendor';
  end if;
  if tg_op = 'INSERT' or new.album_id is distinct from old.album_id then
    select count(*) into current_count
    from public.vendor_portfolio_media m
    where m.album_id = new.album_id;
    if current_count >= 15 then
      raise exception 'An album can contain a maximum of 15 media items';
    end if;
  end if;
  if new.width is not null and new.height is not null and new.height > 0 then
    new.aspect_ratio := new.width::numeric / new.height;
  end if;
  return new;
end;
$$;

create or replace function private.validate_vendor_hero_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  hero_count integer;
  selected_media public.vendor_portfolio_media%rowtype;
  album_visible boolean;
begin
  select * into selected_media
  from public.vendor_portfolio_media
  where id = new.media_id;
  if selected_media.id is null
    or selected_media.vendor_id <> new.vendor_id
    or selected_media.resource_type <> 'image'
    or selected_media.upload_status <> 'completed'
    or selected_media.processing_status <> 'ready'
  then
    raise exception 'Hero media must be a ready image owned by this vendor';
  end if;
  select is_visible into album_visible
  from public.vendor_portfolio_albums
  where id = selected_media.album_id and vendor_id = new.vendor_id;
  if not coalesce(album_visible, false) then
    raise exception 'Only images from published albums may be used in the hero gallery';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into hero_count
    from public.vendor_portfolio_hero_media h
    where h.vendor_id = new.vendor_id;
    if hero_count >= 8 then
      raise exception 'The hero gallery can contain a maximum of 8 images';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_hero_media_validate on public.vendor_portfolio_hero_media;
create trigger vendor_hero_media_validate
before insert or update of vendor_id, media_id
on public.vendor_portfolio_hero_media
for each row execute function private.validate_vendor_hero_media();

create or replace function public.replace_vendor_hero_media(
  target_vendor_id uuid,
  target_media_ids uuid[]
)
returns void
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
  from public.vendor_portfolio_media m
  join public.vendor_portfolio_albums a on a.id = m.album_id
  where m.vendor_id = target_vendor_id
    and m.resource_type = 'image'
    and m.upload_status = 'completed'
    and m.processing_status = 'ready'
    and a.is_visible;
  if selected_count > 0 and selected_count < least(5, available_count) then
    raise exception 'Choose at least % ready hero images', least(5, available_count);
  end if;

  delete from public.vendor_portfolio_hero_media
  where vendor_id = target_vendor_id;
  foreach media_id_item in array coalesce(target_media_ids, '{}'::uuid[]) loop
    insert into public.vendor_portfolio_hero_media(vendor_id, media_id, display_order)
    values (target_vendor_id, media_id_item, item_order);
    item_order := item_order + 1;
  end loop;
end;
$$;

revoke all on function public.replace_vendor_hero_media(uuid, uuid[]) from public;
grant execute on function public.replace_vendor_hero_media(uuid, uuid[]) to authenticated;
revoke all on function private.validate_portfolio_album() from public, anon, authenticated;
revoke all on function private.validate_vendor_hero_media() from public, anon, authenticated;

alter table public.vendor_portfolio_hero_media enable row level security;
grant select, insert, update, delete on public.vendor_portfolio_hero_media to authenticated;
grant select on public.vendor_portfolio_hero_media to anon;

create policy "hero_public_read" on public.vendor_portfolio_hero_media
for select using (
  private.portfolio_vendor_is_public(vendor_portfolio_hero_media.vendor_id)
  and exists (
    select 1
    from public.vendor_portfolio_media m
    join public.vendor_portfolio_albums a on a.id = m.album_id
    where m.id = vendor_portfolio_hero_media.media_id
      and m.vendor_id = vendor_portfolio_hero_media.vendor_id
      and m.resource_type = 'image'
      and m.upload_status = 'completed'
      and m.processing_status = 'ready'
      and a.is_visible
  )
);
create policy "hero_owner_manage" on public.vendor_portfolio_hero_media
for all to authenticated
using (private.workspace_vendor_owned(vendor_id))
with check (private.workspace_vendor_owned(vendor_id));

drop policy if exists "media_public_read" on public.vendor_portfolio_media;
create policy "media_public_read" on public.vendor_portfolio_media
for select using (
  vendor_portfolio_media.upload_status = 'completed'
  and vendor_portfolio_media.processing_status = 'ready'
  and private.portfolio_vendor_is_public(vendor_portfolio_media.vendor_id)
  and exists (
    select 1 from public.vendor_portfolio_albums a
    where a.id = vendor_portfolio_media.album_id
      and a.vendor_id = vendor_portfolio_media.vendor_id
      and a.is_visible
  )
);

commit;
