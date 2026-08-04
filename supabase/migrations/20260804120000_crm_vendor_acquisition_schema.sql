begin;

-- ============================================================================
-- Vendor Acquisition CRM — Phase 1 schema
-- Internal admin-only tool: field marketing team's territory + lead tracking.
-- Entirely additive; does not modify any existing table, policy, or function.
-- All tables are admin-only (private.is_admin()) — no anon/public access.
-- ============================================================================

create table public.crm_states (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_states_name_not_blank check (btrim(name) <> ''),
  constraint crm_states_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create unique index crm_states_name_unique_idx on public.crm_states (lower(name));
create unique index crm_states_slug_unique_idx on public.crm_states (lower(slug));
create index crm_states_active_order_idx on public.crm_states (is_active, display_order, name);

create table public.crm_districts (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.crm_states(id) on delete restrict,
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_districts_name_not_blank check (btrim(name) <> ''),
  constraint crm_districts_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create unique index crm_districts_state_name_unique_idx on public.crm_districts (state_id, lower(name));
create unique index crm_districts_state_slug_unique_idx on public.crm_districts (state_id, lower(slug));
create index crm_districts_state_active_order_idx on public.crm_districts (state_id, is_active, display_order, name);

create table public.crm_talukas (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.crm_districts(id) on delete restrict,
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_talukas_name_not_blank check (btrim(name) <> ''),
  constraint crm_talukas_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create unique index crm_talukas_district_name_unique_idx on public.crm_talukas (district_id, lower(name));
create unique index crm_talukas_district_slug_unique_idx on public.crm_talukas (district_id, lower(slug));
create index crm_talukas_district_active_order_idx on public.crm_talukas (district_id, is_active, display_order, name);

create table public.crm_clusters (
  id uuid primary key default gen_random_uuid(),
  taluka_id uuid not null references public.crm_talukas(id) on delete restrict,
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_clusters_name_not_blank check (btrim(name) <> ''),
  constraint crm_clusters_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create unique index crm_clusters_taluka_name_unique_idx on public.crm_clusters (taluka_id, lower(name));
create unique index crm_clusters_taluka_slug_unique_idx on public.crm_clusters (taluka_id, lower(slug));
create index crm_clusters_taluka_active_order_idx on public.crm_clusters (taluka_id, is_active, display_order, name);

create table public.crm_vendor_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_vendor_categories_name_not_blank check (btrim(name) <> ''),
  constraint crm_vendor_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create unique index crm_vendor_categories_name_unique_idx on public.crm_vendor_categories (lower(name));
create unique index crm_vendor_categories_slug_unique_idx on public.crm_vendor_categories (lower(slug));
create index crm_vendor_categories_active_order_idx on public.crm_vendor_categories (is_active, display_order, name);

create table public.crm_sales_executives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_sales_executives_name_not_blank check (btrim(name) <> '')
);
create index crm_sales_executives_active_idx on public.crm_sales_executives (is_active, name);

create type public.crm_vendor_status as enum (
  'not_contacted',
  'contact_attempted',
  'call_not_answered',
  'interested',
  'not_interested',
  'meeting_scheduled',
  'meeting_completed',
  'follow_up_required',
  'documents_pending',
  'registered_on_royallagn',
  'subscription_pending',
  'premium_customer',
  'rejected',
  'closed',
  'lost_lead'
);

create table public.crm_vendors (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.crm_clusters(id) on delete restrict,
  category_id uuid not null references public.crm_vendor_categories(id) on delete restrict,
  assigned_executive_id uuid references public.crm_sales_executives(id) on delete set null,
  linked_vendor_id uuid references public.vendors(id) on delete set null,
  business_name text not null,
  owner_name text,
  phone text,
  alternate_phone text,
  whatsapp text,
  email text,
  website text,
  instagram text,
  google_maps_url text,
  area text,
  priority text not null default 'medium',
  lead_source text,
  status public.crm_vendor_status not null default 'not_contacted',
  visited_date date,
  notes text,
  rating numeric(2,1),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_vendors_business_name_not_blank check (btrim(business_name) <> ''),
  constraint crm_vendors_priority_valid check (priority in ('low', 'medium', 'high')),
  constraint crm_vendors_rating_range check (rating is null or (rating >= 0 and rating <= 5))
);
create index crm_vendors_cluster_idx on public.crm_vendors (cluster_id, status);
create index crm_vendors_category_idx on public.crm_vendors (category_id);
create index crm_vendors_executive_idx on public.crm_vendors (assigned_executive_id);
create index crm_vendors_status_idx on public.crm_vendors (status, updated_at desc);
create index crm_vendors_linked_vendor_idx on public.crm_vendors (linked_vendor_id) where linked_vendor_id is not null;

create table public.crm_followups (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.crm_vendors(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time,
  priority text not null default 'medium',
  notes text,
  status text not null default 'pending',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_followups_priority_valid check (priority in ('low', 'medium', 'high')),
  constraint crm_followups_status_valid check (status in ('pending', 'completed', 'cancelled'))
);
create index crm_followups_vendor_idx on public.crm_followups (vendor_id, scheduled_date);
create index crm_followups_schedule_idx on public.crm_followups (scheduled_date, status);

create table public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.crm_vendors(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint crm_notes_body_not_blank check (btrim(body) <> '')
);
create index crm_notes_vendor_idx on public.crm_notes (vendor_id, created_at desc);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.crm_vendors(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  from_status public.crm_vendor_status,
  to_status public.crm_vendor_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint crm_activities_action_not_blank check (btrim(action) <> '')
);
create index crm_activities_vendor_idx on public.crm_activities (vendor_id, created_at desc);

create table public.crm_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.crm_vendors(id) on delete cascade,
  label text not null,
  file_url text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_documents_label_not_blank check (btrim(label) <> ''),
  constraint crm_documents_file_url_not_blank check (btrim(file_url) <> '')
);
create index crm_documents_vendor_idx on public.crm_documents (vendor_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers (reuses existing private.set_updated_at())
-- ----------------------------------------------------------------------------

create trigger crm_states_set_updated_at before update on public.crm_states
for each row execute function private.set_updated_at();
create trigger crm_districts_set_updated_at before update on public.crm_districts
for each row execute function private.set_updated_at();
create trigger crm_talukas_set_updated_at before update on public.crm_talukas
for each row execute function private.set_updated_at();
create trigger crm_clusters_set_updated_at before update on public.crm_clusters
for each row execute function private.set_updated_at();
create trigger crm_vendor_categories_set_updated_at before update on public.crm_vendor_categories
for each row execute function private.set_updated_at();
create trigger crm_sales_executives_set_updated_at before update on public.crm_sales_executives
for each row execute function private.set_updated_at();
create trigger crm_vendors_set_updated_at before update on public.crm_vendors
for each row execute function private.set_updated_at();
create trigger crm_followups_set_updated_at before update on public.crm_followups
for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security — admin-only, no anon/public access to any CRM table.
-- ----------------------------------------------------------------------------

alter table public.crm_states enable row level security;
alter table public.crm_districts enable row level security;
alter table public.crm_talukas enable row level security;
alter table public.crm_clusters enable row level security;
alter table public.crm_vendor_categories enable row level security;
alter table public.crm_sales_executives enable row level security;
alter table public.crm_vendors enable row level security;
alter table public.crm_followups enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_documents enable row level security;

revoke all on public.crm_states, public.crm_districts, public.crm_talukas,
  public.crm_clusters, public.crm_vendor_categories, public.crm_sales_executives,
  public.crm_vendors, public.crm_followups, public.crm_notes,
  public.crm_activities, public.crm_documents
from public, anon, authenticated;

grant select, insert, update, delete on public.crm_states, public.crm_districts,
  public.crm_talukas, public.crm_clusters, public.crm_vendor_categories,
  public.crm_sales_executives, public.crm_vendors, public.crm_followups,
  public.crm_notes, public.crm_documents
to authenticated;
grant select on public.crm_activities to authenticated;

create policy crm_states_admin_all on public.crm_states for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_districts_admin_all on public.crm_districts for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_talukas_admin_all on public.crm_talukas for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_clusters_admin_all on public.crm_clusters for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_vendor_categories_admin_all on public.crm_vendor_categories for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_sales_executives_admin_all on public.crm_sales_executives for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_vendors_admin_all on public.crm_vendors for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_followups_admin_all on public.crm_followups for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_notes_admin_all on public.crm_notes for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_documents_admin_all on public.crm_documents for all to authenticated
using (private.is_admin()) with check (private.is_admin());

-- crm_activities is an audit trail: readable by admins, written only via
-- SECURITY DEFINER RPCs (added alongside the status-change flows in a later
-- phase) — mirrors the existing admin_vendor_activity table.
create policy crm_activities_admin_read on public.crm_activities for select to authenticated
using (private.is_admin());

-- ----------------------------------------------------------------------------
-- Read RPCs used by the territory browsing screens (Phase 2+).
-- Mirrors public.get_location_usage_counts() / admin_list_vendor_records().
-- ----------------------------------------------------------------------------

create or replace function public.admin_crm_territory_counts()
returns table (
  level text,
  territory_id uuid,
  vendor_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
    select 'state'::text, s.id,
      (select count(*) from public.crm_vendors v
        join public.crm_clusters cl on cl.id = v.cluster_id
        join public.crm_talukas t on t.id = cl.taluka_id
        where t.district_id in (select d.id from public.crm_districts d where d.state_id = s.id))
    from public.crm_states s
    union all
    select 'district'::text, d.id,
      (select count(*) from public.crm_vendors v
        join public.crm_clusters cl on cl.id = v.cluster_id
        join public.crm_talukas t on t.id = cl.taluka_id
        where t.district_id = d.id)
    from public.crm_districts d
    union all
    select 'taluka'::text, t.id,
      (select count(*) from public.crm_vendors v
        join public.crm_clusters cl on cl.id = v.cluster_id
        where cl.taluka_id = t.id)
    from public.crm_talukas t
    union all
    select 'cluster'::text, cl.id,
      (select count(*) from public.crm_vendors v where v.cluster_id = cl.id)
    from public.crm_clusters cl;
end;
$$;

create or replace function public.admin_crm_list_territory(
  target_level text,
  parent_filter uuid default null
)
returns table (
  id uuid,
  name text,
  slug text,
  display_order integer,
  is_active boolean,
  parent_id uuid,
  child_count bigint,
  vendor_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_level = 'state' then
    return query
      select s.id, s.name, s.slug, s.display_order, s.is_active, null::uuid,
        (select count(*) from public.crm_districts d where d.state_id = s.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          join public.crm_talukas t on t.id = cl.taluka_id
          where t.district_id in (select d.id from public.crm_districts d where d.state_id = s.id))
      from public.crm_states s
      order by s.display_order, s.name;
  elsif target_level = 'district' then
    return query
      select d.id, d.name, d.slug, d.display_order, d.is_active, d.state_id,
        (select count(*) from public.crm_talukas t where t.district_id = d.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          join public.crm_talukas t on t.id = cl.taluka_id
          where t.district_id = d.id)
      from public.crm_districts d
      where parent_filter is null or d.state_id = parent_filter
      order by d.display_order, d.name;
  elsif target_level = 'taluka' then
    return query
      select t.id, t.name, t.slug, t.display_order, t.is_active, t.district_id,
        (select count(*) from public.crm_clusters cl where cl.taluka_id = t.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          where cl.taluka_id = t.id)
      from public.crm_talukas t
      where parent_filter is null or t.district_id = parent_filter
      order by t.display_order, t.name;
  elsif target_level = 'cluster' then
    return query
      select cl.id, cl.name, cl.slug, cl.display_order, cl.is_active, cl.taluka_id,
        (select count(*) from public.crm_vendors v where v.cluster_id = cl.id),
        (select count(*) from public.crm_vendors v where v.cluster_id = cl.id)
      from public.crm_clusters cl
      where parent_filter is null or cl.taluka_id = parent_filter
      order by cl.display_order, cl.name;
  else
    raise exception 'Unknown territory level: %', target_level;
  end if;
end;
$$;

revoke all on function public.admin_crm_territory_counts() from public, anon;
revoke all on function public.admin_crm_list_territory(text, uuid) from public, anon;
grant execute on function public.admin_crm_territory_counts() to authenticated;
grant execute on function public.admin_crm_list_territory(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — mirrors the subscribe() pattern used by AdminVendorService.
-- ----------------------------------------------------------------------------

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'crm_states', 'crm_districts', 'crm_talukas', 'crm_clusters',
      'crm_vendor_categories', 'crm_sales_executives', 'crm_vendors',
      'crm_followups', 'crm_notes', 'crm_activities', 'crm_documents'
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
