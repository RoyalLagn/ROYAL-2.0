begin;

-- =========================================================================
-- Home Hero Section slides
-- Admin-managed carousel (max 5). Public users read active slides ordered
-- by display_order. Only admins may insert / update / delete.
--
-- A slide is just a background image plus one CTA button. The button's
-- destination is derived from the linked category's slug, so no headline,
-- eyebrow or hand-typed URL is stored.
--
-- Written idempotently so it can be re-applied over a partially migrated
-- project (for example one that received the earlier draft of this file).
-- =========================================================================

create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  image_public_id text,
  category_id uuid not null references public.categories (id) on delete restrict,
  category_slug text not null default '',
  category_name text not null,
  cta_label text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns the earlier draft created and the UI no longer renders.
alter table public.hero_slides drop column if exists eyebrow;
alter table public.hero_slides drop column if exists title;
alter table public.hero_slides drop column if exists highlighted_text;

alter table public.hero_slides
  add column if not exists category_slug text not null default '';

-- Backfill the slug for any row created before the column existed.
update public.hero_slides as slide
set category_slug = category.slug
from public.categories as category
where category.id = slide.category_id
  and btrim(slide.category_slug) = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_slides'::regclass
      and conname = 'hero_slides_image_url_not_blank'
  ) then
    alter table public.hero_slides
      add constraint hero_slides_image_url_not_blank check (btrim(image_url) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_slides'::regclass
      and conname = 'hero_slides_category_slug_not_blank'
  ) then
    alter table public.hero_slides
      add constraint hero_slides_category_slug_not_blank check (btrim(category_slug) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_slides'::regclass
      and conname = 'hero_slides_category_name_not_blank'
  ) then
    alter table public.hero_slides
      add constraint hero_slides_category_name_not_blank check (btrim(category_name) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_slides'::regclass
      and conname = 'hero_slides_cta_label_not_blank'
  ) then
    alter table public.hero_slides
      add constraint hero_slides_cta_label_not_blank check (btrim(cta_label) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_slides'::regclass
      and conname = 'hero_slides_display_order_nonnegative'
  ) then
    alter table public.hero_slides
      add constraint hero_slides_display_order_nonnegative check (display_order >= 0);
  end if;
end $$;

create index if not exists hero_slides_active_order_idx
  on public.hero_slides (is_active, display_order, created_at);

create index if not exists hero_slides_category_id_idx
  on public.hero_slides (category_id);

create index if not exists hero_slides_category_slug_idx
  on public.hero_slides (category_slug);

drop trigger if exists hero_slides_set_updated_at on public.hero_slides;
create trigger hero_slides_set_updated_at
before update on public.hero_slides
for each row execute function private.set_updated_at();

-- Cap at 5 slides total (active + inactive).
create or replace function private.enforce_hero_slides_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slide_count integer;
begin
  select count(*)::integer into slide_count from public.hero_slides;
  if tg_op = 'INSERT' and slide_count >= 5 then
    raise exception 'Hero Section supports a maximum of 5 slides.';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hero_slides_limit() from public, anon, authenticated;

drop trigger if exists hero_slides_enforce_limit on public.hero_slides;
create trigger hero_slides_enforce_limit
before insert on public.hero_slides
for each row execute function private.enforce_hero_slides_limit();

alter table public.hero_slides enable row level security;

revoke all on table public.hero_slides from public, anon, authenticated;
grant select on table public.hero_slides to anon, authenticated;
grant insert, update, delete on table public.hero_slides to authenticated;

-- Public (and authenticated) users may only read active slides.
-- Admins can read every slide, including disabled ones.
drop policy if exists hero_slides_public_active_or_admin_read on public.hero_slides;
create policy hero_slides_public_active_or_admin_read
on public.hero_slides
for select
to anon, authenticated
using (is_active or private.is_admin());

drop policy if exists hero_slides_admin_insert on public.hero_slides;
create policy hero_slides_admin_insert
on public.hero_slides
for insert
to authenticated
with check (private.is_admin());

drop policy if exists hero_slides_admin_update on public.hero_slides;
create policy hero_slides_admin_update
on public.hero_slides
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists hero_slides_admin_delete on public.hero_slides;
create policy hero_slides_admin_delete
on public.hero_slides
for delete
to authenticated
using (private.is_admin());

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hero_slides'
  ) then
    alter publication supabase_realtime add table public.hero_slides;
  end if;
end $$;

-- Make the new table visible to PostgREST immediately instead of waiting for
-- the schema cache to expire (this is what produces the 404 / PGRST205).
notify pgrst, 'reload schema';

commit;
