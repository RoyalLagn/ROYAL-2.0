begin;

-- App-facing vendor ids are stable text keys (for example "c1").  This catalog
-- bridges those keys to a database vendor when one exists, without inventing
-- UUIDs or weakening the existing vendors foreign key.
create table public.review_vendor_catalog (
  vendor_key text primary key,
  vendor_id uuid unique references public.vendors(id) on delete set null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_vendor_catalog_key_valid
    check (vendor_key = btrim(vendor_key) and char_length(vendor_key) between 1 and 120)
);

insert into public.review_vendor_catalog (vendor_key, vendor_id, display_name)
select id::text, id, business_name from public.vendors
on conflict (vendor_key) do update
set vendor_id = excluded.vendor_id, display_name = excluded.display_name,
    is_active = true, updated_at = now();

insert into public.review_vendor_catalog (vendor_key)
select prefix || n::text
from unnest(array['p','v','c','d','m','me','dj','bw','gw','ja','pan','ic','pw','md']) prefix
cross join generate_series(1, 10) n
on conflict (vendor_key) do nothing;

alter table public.reviews alter column vendor_id drop not null;
alter table public.reviews
  add column vendor_key text references public.review_vendor_catalog(vendor_key)
    on update cascade on delete restrict,
  add column title text,
  add column image_urls text[] not null default '{}',
  add column status text not null default 'published',
  add column helpful_count integer not null default 0,
  add column is_verified_customer boolean not null default false,
  add column updated_at timestamptz not null default now();

update public.reviews set vendor_key = vendor_id::text where vendor_key is null;
alter table public.reviews alter column vendor_key set not null;

alter table public.reviews
  add constraint reviews_title_length
    check (title is null or char_length(btrim(title)) between 1 and 120),
  add constraint reviews_body_length
    check (char_length(btrim(review)) between 1 and 5000),
  add constraint reviews_images_limit check (cardinality(image_urls) <= 8),
  add constraint reviews_image_urls_nonnull check (array_position(image_urls, null) is null),
  add constraint reviews_status_valid
    check (status in ('pending', 'published', 'rejected')),
  add constraint reviews_helpful_nonnegative check (helpful_count >= 0),
  add constraint reviews_vendor_identity_present check (vendor_key is not null);

alter table public.reviews
  drop constraint if exists reviews_profile_vendor_unique;
create unique index reviews_profile_vendor_key_uidx
  on public.reviews(profile_id, vendor_key);
create index reviews_vendor_key_status_created_idx
  on public.reviews(vendor_key, status, created_at desc);
create index reviews_vendor_key_status_rating_idx
  on public.reviews(vendor_key, status, rating);
create index reviews_vendor_key_helpful_idx
  on public.reviews(vendor_key, helpful_count desc, created_at desc)
  where status = 'published';

create table public.review_helpful_votes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, profile_id)
);
create index review_helpful_votes_profile_idx
  on public.review_helpful_votes(profile_id, created_at desc);

create table public.review_aggregates (
  vendor_key text primary key references public.review_vendor_catalog(vendor_key)
    on update cascade on delete cascade,
  average_rating numeric(3,2) not null default 0
    check (average_rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  rating_5_count integer not null default 0 check (rating_5_count >= 0),
  rating_4_count integer not null default 0 check (rating_4_count >= 0),
  rating_3_count integer not null default 0 check (rating_3_count >= 0),
  rating_2_count integer not null default 0 check (rating_2_count >= 0),
  rating_1_count integer not null default 0 check (rating_1_count >= 0),
  updated_at timestamptz not null default now()
);

create or replace function private.is_active_customer()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'public_user' and is_active
  )
$$;

create or replace function private.can_review_vendor(target_vendor_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_active_customer()
    and exists (
      select 1 from public.review_vendor_catalog c
      where c.vendor_key = target_vendor_key and c.is_active
        and not exists (
          select 1 from public.vendors v
          where v.id = c.vendor_id and v.profile_id = auth.uid()
        )
    )
$$;

create or replace function private.sanitize_review_text(value text)
returns text language sql immutable set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(regexp_replace(coalesce(value, ''), '<[^>]*>', '', 'g'),
                         '[[:cntrl:]]+', ' ', 'g')),
    ''
  )
$$;

create or replace function private.review_image_urls_valid(value text[])
returns boolean language plpgsql immutable set search_path = ''
as $$
declare image_url text;
begin
  if cardinality(coalesce(value, '{}')) > 8 then return false; end if;
  foreach image_url in array coalesce(value, '{}') loop
    if image_url is null
      or image_url !~ '^https://res\.cloudinary\.com/' then return false;
    end if;
  end loop;
  return true;
end
$$;

alter table public.reviews
  add constraint reviews_cloudinary_images_valid
  check (private.review_image_urls_valid(image_urls));

create or replace function private.sync_vendor_review_catalog()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.review_vendor_catalog
  set display_name = new.business_name, is_active = true, updated_at = now()
  where vendor_id = new.id;
  if found then return new; end if;
  insert into public.review_vendor_catalog(vendor_key, vendor_id, display_name, is_active)
  values (new.id::text, new.id, new.business_name, true)
  on conflict (vendor_key) do update
    set vendor_id = excluded.vendor_id, display_name = excluded.display_name,
        is_active = true, updated_at = now();
  return new;
end
$$;

create or replace function private.prepare_review()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.profile_id := coalesce(new.profile_id, auth.uid());
  new.review := private.sanitize_review_text(new.review);
  new.title := private.sanitize_review_text(new.title);
  new.image_urls := coalesce(new.image_urls, '{}');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.helpful_count := 0;
    new.status := 'published';
    select exists (
      select 1 from public.vendor_enquiries e
      join public.review_vendor_catalog c on c.vendor_id = e.vendor_id
      where c.vendor_key = new.vendor_key
        and e.customer_id = new.profile_id
        and e.status in ('booked', 'closed')
    ) into new.is_verified_customer;
    select vendor_id into new.vendor_id
    from public.review_vendor_catalog where vendor_key = new.vendor_key;
  else
    new.vendor_key := old.vendor_key;
    new.vendor_id := old.vendor_id;
    new.profile_id := old.profile_id;
    new.helpful_count := old.helpful_count;
    new.is_verified_customer := old.is_verified_customer;
    new.status := old.status;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

create or replace function private.refresh_review_aggregate(target_vendor_key text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.review_aggregates (
    vendor_key, average_rating, review_count,
    rating_5_count, rating_4_count, rating_3_count, rating_2_count, rating_1_count,
    updated_at
  )
  select target_vendor_key,
    coalesce(round(avg(rating)::numeric, 2), 0),
    count(*)::integer,
    count(*) filter (where rating = 5)::integer,
    count(*) filter (where rating = 4)::integer,
    count(*) filter (where rating = 3)::integer,
    count(*) filter (where rating = 2)::integer,
    count(*) filter (where rating = 1)::integer,
    now()
  from public.reviews
  where vendor_key = target_vendor_key and status = 'published'
  on conflict (vendor_key) do update set
    average_rating = excluded.average_rating,
    review_count = excluded.review_count,
    rating_5_count = excluded.rating_5_count,
    rating_4_count = excluded.rating_4_count,
    rating_3_count = excluded.rating_3_count,
    rating_2_count = excluded.rating_2_count,
    rating_1_count = excluded.rating_1_count,
    updated_at = excluded.updated_at
$$;

create or replace function private.review_changed_refresh_aggregate()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_review_aggregate(old.vendor_key);
  elsif tg_op = 'UPDATE' and old.vendor_key is distinct from new.vendor_key then
    perform private.refresh_review_aggregate(old.vendor_key);
    perform private.refresh_review_aggregate(new.vendor_key);
  else
    perform private.refresh_review_aggregate(new.vendor_key);
  end if;
  return null;
end
$$;

create or replace function private.sync_helpful_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.reviews
  set helpful_count = (
    select count(*)::integer from public.review_helpful_votes
    where review_id = coalesce(new.review_id, old.review_id)
  )
  where id = coalesce(new.review_id, old.review_id);
  return null;
end
$$;

create trigger reviews_prepare_insert
before insert on public.reviews
for each row execute function private.prepare_review();
create trigger reviews_prepare_update
before update of rating, title, review, image_urls, status, vendor_key, profile_id, vendor_id
on public.reviews
for each row execute function private.prepare_review();
create trigger reviews_refresh_aggregate_insert
after insert on public.reviews
for each row execute function private.review_changed_refresh_aggregate();
create trigger reviews_refresh_aggregate_update
after update of rating, status, vendor_key on public.reviews
for each row execute function private.review_changed_refresh_aggregate();
create trigger reviews_refresh_aggregate_delete
after delete on public.reviews
for each row execute function private.review_changed_refresh_aggregate();
create trigger review_helpful_votes_sync
after insert or delete on public.review_helpful_votes
for each row execute function private.sync_helpful_count();
create trigger review_vendor_catalog_set_updated_at
before update on public.review_vendor_catalog
for each row execute function private.set_updated_at();
create trigger vendors_sync_review_catalog
after insert or update of business_name on public.vendors
for each row execute function private.sync_vendor_review_catalog();

insert into public.review_aggregates (vendor_key)
select vendor_key from public.review_vendor_catalog on conflict do nothing;
do $$
declare catalog_row record;
begin
  for catalog_row in select vendor_key from public.review_vendor_catalog loop
    perform private.refresh_review_aggregate(catalog_row.vendor_key);
  end loop;
end $$;

-- Stable RPC boundary used by mobile/web clients. RLS remains the final guard.
create or replace function public.upsert_vendor_review(
  target_vendor_key text,
  rating smallint,
  title text,
  review text,
  image_urls text[] default '{}'
) returns public.reviews
language plpgsql security invoker set search_path = ''
as $$
declare
  result public.reviews;
  p_rating smallint := rating;
  p_title text := title;
  p_review text := review;
  p_image_urls text[] := image_urls;
begin
  if not private.can_review_vendor(target_vendor_key) then
    raise exception 'Only active customers may review this vendor'
      using errcode = '42501';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be an integer from 1 to 5'
      using errcode = '22023';
  end if;
  if private.sanitize_review_text(p_title) is null then
    raise exception 'Review title is required' using errcode = '22023';
  end if;
  if private.sanitize_review_text(p_review) is null then
    raise exception 'Review text is required' using errcode = '22023';
  end if;
  if not private.review_image_urls_valid(coalesce(p_image_urls, '{}')) then
    raise exception 'Review photos must be secure Cloudinary URLs'
      using errcode = '22023';
  end if;
  insert into public.reviews
    (vendor_key, profile_id, rating, title, review, image_urls)
  values
    (target_vendor_key, auth.uid(), p_rating, p_title, p_review,
     coalesce(p_image_urls, '{}'))
  on conflict (profile_id, vendor_key) do update set
    rating = excluded.rating, title = excluded.title, review = excluded.review,
    image_urls = excluded.image_urls
  returning * into result;
  return result;
end
$$;

create or replace function public.delete_own_review(target_review_id uuid)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.reviews
  where id = target_review_id and profile_id = auth.uid();
  return found;
end
$$;

create or replace function public.toggle_review_helpful(target_review_id uuid)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.is_active_customer() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from public.review_helpful_votes
  where review_id = target_review_id and profile_id = auth.uid();
  if found then return false; end if;
  insert into public.review_helpful_votes(review_id, profile_id)
  values (target_review_id, auth.uid());
  return true;
end
$$;

create or replace function public.get_vendor_review_summary(target_vendor_key text)
returns setof public.review_aggregates
language sql stable security invoker set search_path = ''
as $$
  select * from public.review_aggregates where vendor_key = target_vendor_key
$$;

create or replace function public.link_review_vendor_key(
  target_vendor_key text,
  target_vendor_id uuid,
  target_display_name text default null
) returns public.review_vendor_catalog
language plpgsql security definer set search_path = ''
as $$
declare result public.review_vendor_catalog;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendors where id = target_vendor_id) then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;
  update public.review_vendor_catalog
  set vendor_id = null, is_active = false, updated_at = now()
  where vendor_id = target_vendor_id and vendor_key <> btrim(target_vendor_key);
  insert into public.review_vendor_catalog(vendor_key, vendor_id, display_name)
  values (btrim(target_vendor_key), target_vendor_id, target_display_name)
  on conflict (vendor_key) do update
    set vendor_id = excluded.vendor_id,
        display_name = coalesce(excluded.display_name,
          public.review_vendor_catalog.display_name),
        is_active = true, updated_at = now()
  returning * into result;
  return result;
end
$$;

create or replace function public.list_vendor_reviews(
  target_vendor_key text,
  sort_by text default 'most_recent',
  star_filter smallint default null,
  page_size integer default 10,
  page_offset integer default 0
) returns table (
  id uuid, vendor_key text, vendor_id uuid, profile_id uuid, customer_name text,
  customer_profile_image text, rating smallint, title text, review text,
  image_urls text[], status text, is_verified_customer boolean, helpful_count integer,
  created_at timestamptz, updated_at timestamptz, viewer_has_voted boolean,
  is_owner boolean, total_count bigint
) language sql stable security definer set search_path = ''
as $$
  select r.id, r.vendor_key, r.vendor_id, r.profile_id, p.full_name, p.profile_image,
    r.rating, r.title, r.review, r.image_urls, r.status, r.is_verified_customer,
    r.helpful_count, r.created_at, r.updated_at,
    exists (
      select 1 from public.review_helpful_votes h
      where h.review_id = r.id and h.profile_id = auth.uid()
    ),
    r.profile_id = auth.uid(),
    count(*) over ()
  from public.reviews r
  join public.profiles p on p.id = r.profile_id
  where r.vendor_key = target_vendor_key
    and r.status = 'published'
    and (star_filter is null or r.rating = star_filter)
  order by
    case when sort_by = 'highest_rated' then r.rating end desc,
    case when sort_by = 'lowest_rated' then r.rating end asc,
    case when sort_by = 'most_helpful' then r.helpful_count end desc,
    r.created_at desc
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_offset, 0)
$$;

alter table public.review_vendor_catalog enable row level security;
alter table public.review_helpful_votes enable row level security;
alter table public.review_aggregates enable row level security;

drop policy if exists "reviews_public_read" on public.reviews;
drop policy if exists "reviews_user_insert" on public.reviews;
drop policy if exists "reviews_owner_or_admin_update" on public.reviews;
drop policy if exists "reviews_owner_or_admin_delete" on public.reviews;
create policy "reviews_published_or_owner_read" on public.reviews for select
to anon, authenticated
using (status = 'published' or profile_id = auth.uid() or private.is_admin());
create policy "reviews_customer_insert" on public.reviews for insert
to authenticated
with check (
  profile_id = auth.uid() and private.can_review_vendor(vendor_key)
);
create policy "reviews_customer_update_own" on public.reviews for update
to authenticated
using (profile_id = auth.uid() and private.is_active_customer())
with check (profile_id = auth.uid() and private.can_review_vendor(vendor_key));
create policy "reviews_customer_delete_own" on public.reviews for delete
to authenticated
using (profile_id = auth.uid() and private.is_active_customer());

create policy "review_catalog_public_read" on public.review_vendor_catalog
for select to anon, authenticated using (is_active or private.is_admin());
create policy "review_aggregates_public_read" on public.review_aggregates
for select to anon, authenticated using (true);
create policy "helpful_votes_read_own" on public.review_helpful_votes
for select to authenticated using (profile_id = auth.uid());
create policy "helpful_votes_customer_insert" on public.review_helpful_votes
for insert to authenticated
with check (profile_id = auth.uid() and private.is_active_customer());
create policy "helpful_votes_customer_delete" on public.review_helpful_votes
for delete to authenticated
using (profile_id = auth.uid() and private.is_active_customer());

revoke all on public.review_vendor_catalog, public.review_helpful_votes,
  public.review_aggregates from anon, authenticated;
grant select on public.review_vendor_catalog, public.review_aggregates to anon, authenticated;
grant select, insert, delete on public.review_helpful_votes to authenticated;
grant select, insert, delete on public.reviews to authenticated;
revoke update on public.reviews from authenticated;
grant update (rating, title, review, image_urls) on public.reviews to authenticated;
grant select on public.reviews to anon;

revoke all on function public.upsert_vendor_review(text,smallint,text,text,text[]) from public, anon;
revoke all on function public.delete_own_review(uuid) from public, anon;
revoke all on function public.toggle_review_helpful(uuid) from public, anon;
revoke all on function public.link_review_vendor_key(text,uuid,text) from public, anon;
grant execute on function public.upsert_vendor_review(text,smallint,text,text,text[]) to authenticated;
grant execute on function public.delete_own_review(uuid) to authenticated;
grant execute on function public.toggle_review_helpful(uuid) to authenticated;
grant execute on function public.link_review_vendor_key(text,uuid,text) to authenticated;
grant execute on function public.get_vendor_review_summary(text) to anon, authenticated;
grant execute on function public.list_vendor_reviews(text,text,smallint,integer,integer)
  to anon, authenticated;
grant execute on function private.is_active_customer() to authenticated;
grant execute on function private.can_review_vendor(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'reviews'
  ) then alter publication supabase_realtime add table public.reviews; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'review_aggregates'
  ) then alter publication supabase_realtime add table public.review_aggregates; end if;
end $$;

comment on table public.review_vendor_catalog is
  'Stable app vendor keys mapped to optional database vendor UUIDs.';
comment on column public.reviews.image_urls is
  'Cloudinary secure URLs. Asset deletion is performed by the trusted Cloudinary edge function after ownership verification.';

commit;
