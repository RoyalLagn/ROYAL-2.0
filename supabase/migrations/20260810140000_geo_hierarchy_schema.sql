begin;

-- ============================================================================
-- Generic, India-wide geographic hierarchy: State -> District -> Taluka.
-- This is additive: the existing City/Area system (supported_cities,
-- supported_areas, supported_pincodes, vendor_service_locations) is left
-- untouched so current vendor onboarding, public listing, and admin flows
-- keep working exactly as they do today. This new hierarchy layers on top,
-- driven by the vendor PIN code, to power the District/Taluka discovery flow.
--
-- Only Maharashtra data is imported for now (see the following data-seed
-- migration), but nothing here is Maharashtra-specific: the same tables and
-- functions work for any Indian state once its districts/talukas are loaded.
-- ============================================================================

create extension if not exists postgis with schema extensions;

create table public.geo_states (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  lgd_code integer,
  country text not null default 'India',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_states_name_not_blank check (btrim(name) <> ''),
  constraint geo_states_code_not_blank check (btrim(code) <> '')
);

create unique index geo_states_name_unique_idx on public.geo_states (lower(name));
create unique index geo_states_code_unique_idx on public.geo_states (lower(code));
create unique index geo_states_lgd_code_unique_idx on public.geo_states (lgd_code) where lgd_code is not null;

create table public.geo_districts (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.geo_states (id) on delete restrict,
  name text not null,
  lgd_code integer,
  latitude double precision,
  longitude double precision,
  centroid extensions.geography(Point, 4326)
    generated always as (
      case when latitude is not null and longitude is not null
        then extensions.geography(extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326))
      end
    ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_districts_name_not_blank check (btrim(name) <> ''),
  constraint geo_districts_lat_range check (latitude is null or latitude between -90 and 90),
  constraint geo_districts_lng_range check (longitude is null or longitude between -180 and 180)
);

create unique index geo_districts_state_name_unique_idx on public.geo_districts (state_id, lower(name));
create unique index geo_districts_lgd_code_unique_idx on public.geo_districts (lgd_code) where lgd_code is not null;
create index geo_districts_state_active_idx on public.geo_districts (state_id, is_active, name);
create index geo_districts_centroid_gix on public.geo_districts using gist (centroid);

create table public.geo_talukas (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.geo_districts (id) on delete restrict,
  name text not null,
  lgd_code integer,
  latitude double precision,
  longitude double precision,
  centroid extensions.geography(Point, 4326)
    generated always as (
      case when latitude is not null and longitude is not null
        then extensions.geography(extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326))
      end
    ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_talukas_name_not_blank check (btrim(name) <> ''),
  constraint geo_talukas_lat_range check (latitude is null or latitude between -90 and 90),
  constraint geo_talukas_lng_range check (longitude is null or longitude between -180 and 180)
);

create unique index geo_talukas_district_name_unique_idx on public.geo_talukas (district_id, lower(name));
create unique index geo_talukas_lgd_code_unique_idx on public.geo_talukas (lgd_code) where lgd_code is not null;
create index geo_talukas_district_active_idx on public.geo_talukas (district_id, is_active, name);
create index geo_talukas_centroid_gix on public.geo_talukas using gist (centroid);

-- Official/authoritative PIN-code -> locality -> taluka mapping. Rows are
-- populated by the import pipeline (scripts/locations) and enriched live by
-- the lookup-india-pincode edge function, mirroring the existing
-- supported_pincodes cache pattern.
create table public.geo_pincodes (
  pincode text primary key,
  state_id uuid references public.geo_states (id) on delete restrict,
  district_id uuid references public.geo_districts (id) on delete restrict,
  taluka_id uuid references public.geo_talukas (id) on delete restrict,
  area text,
  office_name text,
  latitude double precision,
  longitude double precision,
  resolution_status text not null default 'unresolved',
  ambiguous boolean not null default false,
  source text not null default 'admin',
  raw_response jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_pincodes_format check (pincode ~ '^[1-9][0-9]{5}$'),
  constraint geo_pincodes_resolution_status_check check (
    resolution_status in ('resolved', 'needs_review', 'unresolved')
  ),
  constraint geo_pincodes_lat_range check (latitude is null or latitude between -90 and 90),
  constraint geo_pincodes_lng_range check (longitude is null or longitude between -180 and 180)
);

create index geo_pincodes_taluka_idx on public.geo_pincodes (taluka_id);
create index geo_pincodes_district_idx on public.geo_pincodes (district_id);
create index geo_pincodes_status_idx on public.geo_pincodes (resolution_status) where resolution_status <> 'resolved';

-- Cached/generated nearby-Taluka ordering, computed automatically from
-- centroid geography distance (see rebuild_taluka_neighbors below). No
-- Admin-authored adjacency rows are required or expected.
create table public.geo_taluka_neighbors (
  taluka_id uuid not null references public.geo_talukas (id) on delete cascade,
  nearby_taluka_id uuid not null references public.geo_talukas (id) on delete cascade,
  distance_km numeric not null,
  priority integer not null,
  relationship_type text not null default 'centroid_distance',
  generated_at timestamptz not null default now(),
  primary key (taluka_id, nearby_taluka_id),
  constraint geo_taluka_neighbors_not_self check (taluka_id <> nearby_taluka_id),
  constraint geo_taluka_neighbors_priority_positive check (priority > 0)
);

create unique index geo_taluka_neighbors_priority_unique_idx
  on public.geo_taluka_neighbors (taluka_id, priority);
create index geo_taluka_neighbors_lookup_idx
  on public.geo_taluka_neighbors (taluka_id, priority);

-- ----------------------------------------------------------------------------
-- Vendor geo-location columns. Additive and nullable: no existing vendor
-- data is touched or destroyed. `geo_resolution_status` lets us tell apart
-- vendors that were cleanly resolved from a PIN code, vendors that need
-- Admin review (ambiguous/unmatched PIN), and vendors not yet processed.
-- ----------------------------------------------------------------------------
alter table public.vendors
  add column if not exists geo_state_id uuid references public.geo_states (id) on delete restrict,
  add column if not exists geo_district_id uuid references public.geo_districts (id) on delete restrict,
  add column if not exists geo_taluka_id uuid references public.geo_talukas (id) on delete restrict,
  add column if not exists geo_latitude double precision,
  add column if not exists geo_longitude double precision,
  add column if not exists geo_resolution_status text not null default 'unresolved',
  add column if not exists geo_resolved_at timestamptz;

alter table public.vendors
  add constraint vendors_geo_resolution_status_check check (
    geo_resolution_status in ('resolved', 'needs_review', 'unresolved')
  );
alter table public.vendors
  add constraint vendors_geo_lat_range check (geo_latitude is null or geo_latitude between -90 and 90);
alter table public.vendors
  add constraint vendors_geo_lng_range check (geo_longitude is null or geo_longitude between -180 and 180);

create index vendors_geo_taluka_idx on public.vendors (geo_taluka_id) where geo_taluka_id is not null;
create index vendors_geo_district_idx on public.vendors (geo_district_id) where geo_district_id is not null;
create index vendors_geo_review_idx on public.vendors (geo_resolution_status) where geo_resolution_status <> 'resolved';

create trigger geo_states_set_updated_at
before update on public.geo_states
for each row execute function private.set_updated_at();
create trigger geo_districts_set_updated_at
before update on public.geo_districts
for each row execute function private.set_updated_at();
create trigger geo_talukas_set_updated_at
before update on public.geo_talukas
for each row execute function private.set_updated_at();
create trigger geo_pincodes_set_updated_at
before update on public.geo_pincodes
for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.geo_states enable row level security;
alter table public.geo_districts enable row level security;
alter table public.geo_talukas enable row level security;
alter table public.geo_pincodes enable row level security;
alter table public.geo_taluka_neighbors enable row level security;

revoke all on public.geo_states, public.geo_districts, public.geo_talukas,
  public.geo_pincodes, public.geo_taluka_neighbors from anon, authenticated;

grant select on public.geo_states, public.geo_districts, public.geo_talukas,
  public.geo_taluka_neighbors to anon, authenticated;
grant select, insert, update, delete on public.geo_states, public.geo_districts,
  public.geo_talukas, public.geo_pincodes, public.geo_taluka_neighbors to authenticated;

create policy geo_states_active_or_admin_read
on public.geo_states for select to anon, authenticated
using (is_active or private.is_admin());
create policy geo_states_admin_write
on public.geo_states for insert to authenticated with check (private.is_admin());
create policy geo_states_admin_update
on public.geo_states for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy geo_states_admin_delete
on public.geo_states for delete to authenticated using (private.is_admin());

create policy geo_districts_active_or_admin_read
on public.geo_districts for select to anon, authenticated
using (
  (is_active and exists (
    select 1 from public.geo_states state where state.id = state_id and state.is_active
  )) or private.is_admin()
);
create policy geo_districts_admin_write
on public.geo_districts for insert to authenticated with check (private.is_admin());
create policy geo_districts_admin_update
on public.geo_districts for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy geo_districts_admin_delete
on public.geo_districts for delete to authenticated using (private.is_admin());

create policy geo_talukas_active_or_admin_read
on public.geo_talukas for select to anon, authenticated
using (
  (is_active and exists (
    select 1 from public.geo_districts district where district.id = district_id and district.is_active
  )) or private.is_admin()
);
create policy geo_talukas_admin_write
on public.geo_talukas for insert to authenticated with check (private.is_admin());
create policy geo_talukas_admin_update
on public.geo_talukas for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy geo_talukas_admin_delete
on public.geo_talukas for delete to authenticated using (private.is_admin());

-- Pincode rows can carry a raw provider payload; keep them admin-only like
-- supported_pincodes. Edge functions use the service role and bypass RLS.
create policy geo_pincodes_admin_all
on public.geo_pincodes for all to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy geo_taluka_neighbors_public_read
on public.geo_taluka_neighbors for select to anon, authenticated using (true);
create policy geo_taluka_neighbors_admin_write
on public.geo_taluka_neighbors for all to authenticated
using (private.is_admin()) with check (private.is_admin());

commit;
