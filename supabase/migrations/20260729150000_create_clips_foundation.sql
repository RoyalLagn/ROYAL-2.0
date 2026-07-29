begin;

create type public.clip_status as enum (
  'draft', 'pending', 'approved', 'hidden', 'rejected', 'deleted'
);
create type public.clip_visibility as enum ('public', 'unlisted', 'private');
create type public.clip_report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null,
  caption text,
  video_url text not null,
  thumbnail_url text not null,
  duration_seconds numeric(6,3) not null,
  width integer not null,
  height integer not null,
  file_size_bytes bigint not null,
  cloudinary_public_id text not null unique,
  views_count bigint not null default 0,
  likes_count bigint not null default 0,
  saves_count bigint not null default 0,
  status public.clip_status not null default 'draft',
  visibility public.clip_visibility not null default 'public',
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  constraint clips_title_valid check (char_length(btrim(title)) between 1 and 120),
  constraint clips_caption_valid check (caption is null or char_length(caption) <= 2200),
  constraint clips_duration_valid check (duration_seconds > 0 and duration_seconds <= 30),
  constraint clips_resolution_valid check (width > 0 and height > 0 and width <= 1080 and height <= 1920),
  constraint clips_file_size_valid check (file_size_bytes > 0 and file_size_bytes <= 54525952),
  constraint clips_urls_valid check (
    video_url ~* '^https://res\.cloudinary\.com/'
    and thumbnail_url ~* '^https://res\.cloudinary\.com/'
    and btrim(cloudinary_public_id) <> ''
  ),
  constraint clips_counts_nonnegative check (
    views_count >= 0 and likes_count >= 0 and saves_count >= 0
  ),
  constraint clips_publication_state_valid check (
    (status = 'approved' and published_at is not null and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
    or status in ('draft', 'pending', 'hidden', 'rejected')
  )
);

create table public.clip_likes (
  clip_id uuid not null references public.clips(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, profile_id)
);

create table public.clip_saves (
  clip_id uuid not null references public.clips(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, profile_id)
);

create table public.clip_views (
  id bigint generated always as identity primary key,
  clip_id uuid not null references public.clips(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  session_hash text,
  watch_duration_seconds numeric(7,3) not null default 0,
  completed boolean not null default false,
  viewed_at timestamptz not null default now(),
  constraint clip_views_identity_required check (
    viewer_id is not null or nullif(btrim(session_hash), '') is not null
  ),
  constraint clip_views_watch_duration_valid check (watch_duration_seconds >= 0)
);

create table public.clip_reports (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status public.clip_report_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clip_reports_reason_valid check (char_length(btrim(reason)) between 3 and 100),
  constraint clip_reports_details_valid check (details is null or char_length(details) <= 2000),
  unique (clip_id, reporter_id)
);

-- Feed and moderation indexes are partial to keep hot indexes compact.
create index clips_public_feed_cursor_idx
  on public.clips (published_at desc, id desc)
  where status = 'approved' and visibility = 'public' and deleted_at is null;
create index clips_category_feed_cursor_idx
  on public.clips (category_id, published_at desc, id desc)
  where status = 'approved' and visibility = 'public' and deleted_at is null;
create index clips_vendor_cursor_idx
  on public.clips (vendor_id, created_at desc, id desc)
  where deleted_at is null;
create index clips_moderation_queue_idx
  on public.clips (status, created_at, id)
  where status in ('pending', 'hidden');
create index clip_likes_profile_idx on public.clip_likes (profile_id, created_at desc);
create index clip_saves_profile_idx on public.clip_saves (profile_id, created_at desc);
create index clip_views_clip_time_idx on public.clip_views (clip_id, viewed_at desc);
create index clip_views_viewer_time_idx on public.clip_views (viewer_id, viewed_at desc)
  where viewer_id is not null;
create unique index clip_views_authenticated_once_idx
  on public.clip_views (clip_id, viewer_id)
  where viewer_id is not null;
create unique index clip_views_session_once_idx
  on public.clip_views (clip_id, session_hash)
  where viewer_id is null;
create index clip_reports_queue_idx on public.clip_reports (status, created_at);

create function private.touch_clip_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create function private.protect_clip_moderation_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() = 1 and not private.is_admin() and (
    new.vendor_id is distinct from old.vendor_id
    or new.views_count is distinct from old.views_count
    or new.likes_count is distinct from old.likes_count
    or new.saves_count is distinct from old.saves_count
    or new.moderation_reason is distinct from old.moderation_reason
    or new.published_at is distinct from old.published_at
    or new.deleted_at is distinct from old.deleted_at
    or new.status not in ('draft', 'pending')
  ) then
    raise exception 'Protected clip fields may only be changed by an administrator';
  end if;
  return new;
end;
$$;

create function private.sync_clip_engagement_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_clip_id uuid := coalesce(new.clip_id, old.clip_id);
  delta bigint := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'clip_likes' then
    update public.clips set likes_count = greatest(0, likes_count + delta) where id = target_clip_id;
  elsif tg_table_name = 'clip_saves' then
    update public.clips set saves_count = greatest(0, saves_count + delta) where id = target_clip_id;
  elsif tg_table_name = 'clip_views' and tg_op = 'INSERT' then
    update public.clips set views_count = views_count + 1 where id = target_clip_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger clips_touch_updated_at before update on public.clips
for each row execute function private.touch_clip_updated_at();
create trigger clips_protect_moderation before update on public.clips
for each row execute function private.protect_clip_moderation_fields();
create trigger clip_reports_touch_updated_at before update on public.clip_reports
for each row execute function private.touch_clip_updated_at();
create trigger clip_likes_sync_count after insert or delete on public.clip_likes
for each row execute function private.sync_clip_engagement_count();
create trigger clip_saves_sync_count after insert or delete on public.clip_saves
for each row execute function private.sync_clip_engagement_count();
create trigger clip_views_sync_count after insert on public.clip_views
for each row execute function private.sync_clip_engagement_count();

create function public.moderate_clip(
  target_clip_id uuid,
  decision public.clip_status,
  reason text default null
)
returns public.clips
language plpgsql security definer set search_path = '' as $$
declare result public.clips;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'hidden', 'rejected') then
    raise exception 'Invalid moderation decision';
  end if;
  if decision in ('hidden', 'rejected') and nullif(btrim(reason), '') is null then
    raise exception 'A moderation reason is required';
  end if;
  update public.clips
  set status = decision,
      moderation_reason = case when decision = 'approved' then null else btrim(reason) end,
      published_at = case when decision = 'approved' then coalesce(published_at, clock_timestamp()) else published_at end
  where id = target_clip_id and deleted_at is null
  returning * into result;
  if result.id is null then raise exception 'Clip not found'; end if;
  return result;
end;
$$;

alter table public.clips enable row level security;
alter table public.clip_likes enable row level security;
alter table public.clip_saves enable row level security;
alter table public.clip_views enable row level security;
alter table public.clip_reports enable row level security;

grant select on public.clips to anon, authenticated;
grant insert, update on public.clips to authenticated;
grant select, insert, delete on public.clip_likes, public.clip_saves to authenticated;
grant insert on public.clip_views to anon, authenticated;
grant select on public.clip_views to authenticated;
grant select, insert on public.clip_reports to authenticated;
grant update on public.clip_reports to authenticated;
grant usage, select on sequence public.clip_views_id_seq to anon, authenticated;
revoke all on function public.moderate_clip(uuid, public.clip_status, text) from public, anon;
grant execute on function public.moderate_clip(uuid, public.clip_status, text) to authenticated;

create policy clips_read on public.clips for select to anon, authenticated using (
  (status = 'approved' and visibility in ('public', 'unlisted') and deleted_at is null)
  or private.owns_vendor(vendor_id)
  or private.is_admin()
);
create policy clips_vendor_insert on public.clips for insert to authenticated with check (
  private.owns_vendor(vendor_id)
  and status in ('draft', 'pending')
  and published_at is null and deleted_at is null
);
create policy clips_vendor_update on public.clips for update to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin())
with check (private.owns_vendor(vendor_id) or private.is_admin());

create policy clip_likes_read_own on public.clip_likes for select to authenticated
using (profile_id = auth.uid() or private.is_admin());
create policy clip_likes_insert_own on public.clip_likes for insert to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.clips c
    where c.id = clip_id and c.status = 'approved'
      and c.visibility = 'public' and c.deleted_at is null
  )
);
create policy clip_likes_delete_own on public.clip_likes for delete to authenticated
using (profile_id = auth.uid() or private.is_admin());

create policy clip_saves_read_own on public.clip_saves for select to authenticated
using (profile_id = auth.uid() or private.is_admin());
create policy clip_saves_insert_own on public.clip_saves for insert to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.clips c
    where c.id = clip_id and c.status = 'approved'
      and c.visibility in ('public', 'unlisted') and c.deleted_at is null
  )
);
create policy clip_saves_delete_own on public.clip_saves for delete to authenticated
using (profile_id = auth.uid() or private.is_admin());

create policy clip_views_insert_visible on public.clip_views for insert to anon, authenticated
with check (
  (viewer_id is null or viewer_id = auth.uid())
  and exists (
    select 1 from public.clips c
    where c.id = clip_id and c.status = 'approved'
      and c.visibility in ('public', 'unlisted') and c.deleted_at is null
  )
);
create policy clip_views_read_owner on public.clip_views for select to authenticated using (
  viewer_id = auth.uid()
  or private.is_admin()
  or exists (
    select 1 from public.clips c
    where c.id = clip_id and private.owns_vendor(c.vendor_id)
  )
);

create policy clip_reports_insert_own on public.clip_reports for insert to authenticated
with check (reporter_id = auth.uid());
create policy clip_reports_read on public.clip_reports for select to authenticated
using (reporter_id = auth.uid() or private.is_admin());
create policy clip_reports_admin_update on public.clip_reports for update to authenticated
using (private.is_admin()) with check (private.is_admin());

-- Tables are intentionally not added to supabase_realtime in Phase 1.
-- Their primary keys and immutable event rows are compatible with enabling
-- Realtime later without a schema change.

commit;
