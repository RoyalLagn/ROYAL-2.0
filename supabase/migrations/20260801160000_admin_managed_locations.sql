begin;

create table public.supported_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  slug text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supported_cities_name_not_blank check (btrim(name) <> ''),
  constraint supported_cities_state_not_blank check (btrim(state) <> ''),
  constraint supported_cities_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index supported_cities_name_state_unique_idx
  on public.supported_cities (lower(name), lower(state));
create unique index supported_cities_slug_unique_idx
  on public.supported_cities (lower(slug));
create index supported_cities_active_order_idx
  on public.supported_cities (is_active, display_order, name);

create table public.supported_areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.supported_cities(id) on delete restrict,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supported_areas_name_not_blank check (btrim(name) <> ''),
  constraint supported_areas_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index supported_areas_city_name_unique_idx
  on public.supported_areas (city_id, lower(name));
create unique index supported_areas_city_slug_unique_idx
  on public.supported_areas (city_id, lower(slug));
create index supported_areas_city_active_order_idx
  on public.supported_areas (city_id, is_active, display_order, name);

create table public.supported_pincodes (
  pincode text primary key,
  city_id uuid not null references public.supported_cities(id) on delete restrict,
  area_id uuid references public.supported_areas(id) on delete restrict,
  office_name text,
  district text,
  state text not null,
  provider text not null default 'admin',
  is_active boolean not null default true,
  verified_at timestamptz not null default now(),
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supported_pincodes_format check (pincode ~ '^[1-9][0-9]{5}$'),
  constraint supported_pincodes_state_not_blank check (btrim(state) <> '')
);

create index supported_pincodes_city_area_idx
  on public.supported_pincodes (city_id, area_id, is_active);

alter table public.profiles
  add column if not exists preferred_city_id uuid references public.supported_cities(id) on delete restrict,
  add column if not exists preferred_area_id uuid references public.supported_areas(id) on delete restrict;

create index if not exists profiles_preferred_city_idx
  on public.profiles (preferred_city_id) where preferred_city_id is not null;
create index if not exists profiles_preferred_area_idx
  on public.profiles (preferred_area_id) where preferred_area_id is not null;

alter table public.vendor_applications
  add column if not exists city_id uuid references public.supported_cities(id) on delete restrict,
  add column if not exists area_id uuid references public.supported_areas(id) on delete restrict,
  add column if not exists service_area_ids uuid[] not null default array[]::uuid[];

create index if not exists vendor_applications_city_area_idx
  on public.vendor_applications (city_id, area_id);

alter table public.vendors
  add column if not exists primary_city_id uuid references public.supported_cities(id) on delete restrict,
  add column if not exists primary_area_id uuid references public.supported_areas(id) on delete restrict;

create index if not exists vendors_primary_location_idx
  on public.vendors (primary_city_id, primary_area_id);

create table public.vendor_service_locations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  city_id uuid not null references public.supported_cities(id) on delete restrict,
  area_id uuid references public.supported_areas(id) on delete restrict,
  pincode text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_service_locations_pincode_format check (
    pincode is null or pincode ~ '^[1-9][0-9]{5}$'
  )
);

create unique index vendor_service_locations_primary_unique_idx
  on public.vendor_service_locations (vendor_id) where is_primary;
create unique index vendor_service_locations_city_only_unique_idx
  on public.vendor_service_locations (vendor_id, city_id) where area_id is null;
create unique index vendor_service_locations_area_unique_idx
  on public.vendor_service_locations (vendor_id, city_id, area_id) where area_id is not null;
create index vendor_service_locations_ranking_idx
  on public.vendor_service_locations (city_id, area_id, vendor_id);
create index vendor_service_locations_vendor_idx
  on public.vendor_service_locations (vendor_id, is_primary desc);

create table public.location_settings (
  id boolean primary key default true check (id),
  strict_city_only boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.location_settings (id, strict_city_only)
values (true, false)
on conflict (id) do nothing;

insert into public.supported_cities (name, state, slug, display_order)
values
  ('Pune', 'Maharashtra', 'pune-maharashtra', 10),
  ('Mumbai', 'Maharashtra', 'mumbai-maharashtra', 20),
  ('Lonavala', 'Maharashtra', 'lonavala-maharashtra', 30),
  ('Nashik', 'Maharashtra', 'nashik-maharashtra', 40)
on conflict (lower(name), lower(state)) do nothing;

update public.vendor_applications application
set city_id = city.id
from public.supported_cities city
where application.city_id is null
  and lower(btrim(application.city)) = lower(city.name)
  and (
    lower(btrim(application.state)) = lower(city.state)
    or lower(btrim(application.state)) = 'not provided'
  );

update public.vendors vendor
set primary_city_id = city.id
from public.supported_cities city
where vendor.primary_city_id is null
  and lower(btrim(vendor.city)) = lower(city.name)
  and lower(btrim(vendor.state)) = lower(city.state);

insert into public.vendor_service_locations (vendor_id, city_id, pincode, is_primary)
select vendor.id, vendor.primary_city_id,
       case when vendor.pincode ~ '^[1-9][0-9]{5}$' then vendor.pincode end,
       true
from public.vendors vendor
where vendor.primary_city_id is not null
on conflict do nothing;

create or replace function private.validate_managed_location_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_city_id uuid;
  selected_area_id uuid;
  service_area_id uuid;
begin
  if tg_table_name = 'profiles' then
    selected_city_id := new.preferred_city_id;
    selected_area_id := new.preferred_area_id;
  elsif tg_table_name = 'vendor_applications' then
    selected_city_id := new.city_id;
    selected_area_id := new.area_id;
    if tg_op = 'INSERT' then
      if selected_city_id is null then
        raise exception 'Choose a supported RoyalLagn city';
      end if;
      if new.pincode !~ '^[1-9][0-9]{5}$' then
        raise exception 'Enter a valid six-digit Indian PIN code';
      end if;
    end if;
    foreach service_area_id in array coalesce(new.service_area_ids, array[]::uuid[])
    loop
      if not exists (
        select 1 from public.supported_areas service_area
        where service_area.id = service_area_id
          and service_area.city_id = selected_city_id
          and service_area.is_active
      ) then
        raise exception 'A selected service area is not active in the selected city';
      end if;
    end loop;
  elsif tg_table_name = 'vendors' then
    selected_city_id := new.primary_city_id;
    selected_area_id := new.primary_area_id;
    if selected_city_id is null
       and tg_op = 'UPDATE'
       and auth.uid() is not null
       and not private.is_admin()
       and (new.city is distinct from old.city or new.state is distinct from old.state) then
      raise exception 'Choose a supported service location before changing city or state';
    end if;
  else
    selected_city_id := new.city_id;
    selected_area_id := new.area_id;
  end if;

  if selected_area_id is not null and selected_city_id is null then
    raise exception 'An area must belong to a selected city';
  end if;
  if selected_city_id is null then return new; end if;

  if not exists (
    select 1 from public.supported_cities city
    where city.id = selected_city_id and city.is_active
  ) then
    raise exception 'This city is not currently supported by RoyalLagn';
  end if;
  if selected_area_id is not null and not exists (
    select 1 from public.supported_areas area
    where area.id = selected_area_id
      and area.city_id = selected_city_id
      and area.is_active
  ) then
    raise exception 'This area is not active in the selected city';
  end if;
  if tg_table_name = 'vendors' and not exists (
    select 1 from public.supported_cities city
    where city.id = selected_city_id
      and lower(btrim(new.city)) = lower(city.name)
      and lower(btrim(new.state)) = lower(city.state)
  ) then
    raise exception 'Vendor city and state must match the managed primary location';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_managed_location
before insert or update of preferred_city_id, preferred_area_id on public.profiles
for each row execute function private.validate_managed_location_selection();
create trigger vendor_applications_validate_managed_location
before insert or update of city_id, area_id, service_area_ids, pincode on public.vendor_applications
for each row execute function private.validate_managed_location_selection();
create trigger vendors_validate_managed_location
before insert or update of primary_city_id, primary_area_id, city, state on public.vendors
for each row execute function private.validate_managed_location_selection();
create trigger vendor_service_locations_validate_managed_location
before insert or update of city_id, area_id on public.vendor_service_locations
for each row execute function private.validate_managed_location_selection();

create trigger supported_cities_set_updated_at
before update on public.supported_cities
for each row execute function private.set_updated_at();
create trigger supported_areas_set_updated_at
before update on public.supported_areas
for each row execute function private.set_updated_at();
create trigger supported_pincodes_set_updated_at
before update on public.supported_pincodes
for each row execute function private.set_updated_at();
create trigger vendor_service_locations_set_updated_at
before update on public.vendor_service_locations
for each row execute function private.set_updated_at();

create or replace function public.set_customer_location_preference(
  target_city_id uuid,
  target_area_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles
  set preferred_city_id = target_city_id,
      preferred_area_id = target_area_id
  where id = auth.uid()
    and role::text = 'public_user'
    and is_active
  returning jsonb_build_object(
    'city_id', preferred_city_id,
    'area_id', preferred_area_id
  ) into result;
  if result is null then raise exception 'Active customer profile not found'; end if;
  return result;
end;
$$;

create or replace function public.replace_vendor_service_locations(
  target_vendor_id uuid,
  target_primary_city_id uuid,
  target_primary_area_id uuid default null,
  target_service_area_ids uuid[] default array[]::uuid[],
  target_pincode text default null
)
returns setof public.vendor_service_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_city public.supported_cities%rowtype;
  selected_area_id uuid;
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'You cannot manage service locations for this Vendor';
  end if;
  if target_pincode is not null and target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;

  select * into selected_city
  from public.supported_cities
  where id = target_primary_city_id and is_active;
  if not found then raise exception 'This city is not currently supported by RoyalLagn'; end if;

  if target_primary_area_id is not null and not exists (
    select 1 from public.supported_areas
    where id = target_primary_area_id
      and city_id = target_primary_city_id
      and is_active
  ) then raise exception 'The primary area is not active in the selected city'; end if;

  foreach selected_area_id in array coalesce(target_service_area_ids, array[]::uuid[])
  loop
    if not exists (
      select 1 from public.supported_areas
      where id = selected_area_id
        and city_id = target_primary_city_id
        and is_active
    ) then raise exception 'A selected service area is not active in the primary city'; end if;
  end loop;

  delete from public.vendor_service_locations where vendor_id = target_vendor_id;
  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, pincode, is_primary
  ) values (
    target_vendor_id, target_primary_city_id, target_primary_area_id,
    nullif(target_pincode, ''), true
  );

  insert into public.vendor_service_locations (vendor_id, city_id, area_id, is_primary)
  select target_vendor_id, target_primary_city_id, area_id, false
  from unnest(coalesce(target_service_area_ids, array[]::uuid[])) area_id
  where area_id is distinct from target_primary_area_id
  on conflict do nothing;

  update public.vendors
  set primary_city_id = target_primary_city_id,
      primary_area_id = target_primary_area_id,
      city = selected_city.name,
      state = selected_city.state,
      pincode = coalesce(nullif(target_pincode, ''), pincode)
  where id = target_vendor_id;

  return query
  select * from public.vendor_service_locations
  where vendor_id = target_vendor_id
  order by is_primary desc, created_at;
end;
$$;

create or replace function private.sync_approved_vendor_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.vendor_applications%rowtype;
begin
  if new.application_id is null then return new; end if;
  select * into application from public.vendor_applications where id = new.application_id;
  if application.city_id is null then return new; end if;

  update public.vendors
  set primary_city_id = application.city_id,
      primary_area_id = application.area_id
  where id = new.id;

  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, pincode, is_primary
  ) values (
    new.id, application.city_id, application.area_id, application.pincode, true
  )
  on conflict do nothing;
  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, is_primary
  )
  select new.id, application.city_id, service_area_id, false
  from unnest(coalesce(application.service_area_ids, array[]::uuid[])) service_area_id
  where service_area_id is distinct from application.area_id
  on conflict do nothing;
  return new;
end;
$$;

create trigger vendors_sync_approved_location
after insert or update of application_id on public.vendors
for each row execute function private.sync_approved_vendor_location();

create or replace function public.get_location_usage_counts()
returns table (
  location_kind text,
  location_id uuid,
  vendor_count bigint,
  customer_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  return query
    select 'city'::text, city.id,
      (select count(distinct service.vendor_id) from public.vendor_service_locations service where service.city_id = city.id),
      (select count(*) from public.profiles profile where profile.preferred_city_id = city.id)
    from public.supported_cities city
    union all
    select 'area'::text, area.id,
      (select count(distinct service.vendor_id) from public.vendor_service_locations service where service.area_id = area.id),
      (select count(*) from public.profiles profile where profile.preferred_area_id = area.id)
    from public.supported_areas area;
end;
$$;

alter table public.supported_cities enable row level security;
alter table public.supported_areas enable row level security;
alter table public.supported_pincodes enable row level security;
alter table public.vendor_service_locations enable row level security;
alter table public.location_settings enable row level security;

revoke all on public.supported_cities, public.supported_areas,
  public.supported_pincodes, public.vendor_service_locations,
  public.location_settings from anon, authenticated;

grant select on public.supported_cities, public.supported_areas,
  public.vendor_service_locations, public.location_settings to anon, authenticated;
grant select, insert, update, delete on public.supported_cities,
  public.supported_areas, public.supported_pincodes,
  public.vendor_service_locations, public.location_settings to authenticated;
grant execute on function public.set_customer_location_preference(uuid, uuid) to authenticated;
grant execute on function public.replace_vendor_service_locations(uuid, uuid, uuid, uuid[], text) to authenticated;
grant execute on function public.get_location_usage_counts() to authenticated;

create policy supported_cities_active_or_admin_read
on public.supported_cities for select to anon, authenticated
using (is_active or private.is_admin());
create policy supported_cities_admin_insert
on public.supported_cities for insert to authenticated
with check (private.is_admin());
create policy supported_cities_admin_update
on public.supported_cities for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy supported_cities_admin_delete
on public.supported_cities for delete to authenticated
using (private.is_admin());

create policy supported_areas_active_or_admin_read
on public.supported_areas for select to anon, authenticated
using (
  (is_active and exists (
    select 1 from public.supported_cities city
    where city.id = city_id and city.is_active
  )) or private.is_admin()
);
create policy supported_areas_admin_insert
on public.supported_areas for insert to authenticated
with check (private.is_admin());
create policy supported_areas_admin_update
on public.supported_areas for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy supported_areas_admin_delete
on public.supported_areas for delete to authenticated
using (private.is_admin());

create policy supported_pincodes_admin_all
on public.supported_pincodes for all to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy vendor_service_locations_public_owner_admin_read
on public.vendor_service_locations for select to anon, authenticated
using (
  private.vendor_is_public(vendor_id)
  or private.owns_vendor(vendor_id)
  or private.is_admin()
);
create policy vendor_service_locations_owner_admin_insert
on public.vendor_service_locations for insert to authenticated
with check (private.owns_vendor(vendor_id) or private.is_admin());
create policy vendor_service_locations_owner_admin_update
on public.vendor_service_locations for update to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin())
with check (private.owns_vendor(vendor_id) or private.is_admin());
create policy vendor_service_locations_owner_admin_delete
on public.vendor_service_locations for delete to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());

create policy location_settings_public_read
on public.location_settings for select to anon, authenticated using (true);
create policy location_settings_admin_update
on public.location_settings for update to authenticated
using (private.is_admin()) with check (private.is_admin());

revoke all on function private.validate_managed_location_selection() from public, anon, authenticated;
revoke all on function private.sync_approved_vendor_location() from public, anon, authenticated;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'supported_cities',
      'supported_areas',
      'vendor_service_locations',
      'location_settings'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end
$$;

commit;
