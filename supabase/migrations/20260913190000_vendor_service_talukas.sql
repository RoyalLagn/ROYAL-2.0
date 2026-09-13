begin;

create table if not exists public.vendor_service_talukas (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  taluka_id uuid not null references public.geo_talukas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vendor_id, taluka_id)
);

create index if not exists vendor_service_talukas_taluka_vendor_idx
  on public.vendor_service_talukas(taluka_id, vendor_id);

alter table public.vendor_service_talukas enable row level security;

drop policy if exists vendor_service_talukas_public_read on public.vendor_service_talukas;
create policy vendor_service_talukas_public_read on public.vendor_service_talukas
  for select using (true);

drop policy if exists vendor_service_talukas_owner_manage on public.vendor_service_talukas;
create policy vendor_service_talukas_owner_manage on public.vendor_service_talukas
  for all using (private.owns_vendor(vendor_id) or private.is_admin())
  with check (private.owns_vendor(vendor_id) or private.is_admin());

create or replace function public.replace_my_vendor_service_talukas(
  target_vendor_id uuid,
  target_taluka_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  home_taluka_id uuid;
  home_district_id uuid;
  normalized_ids uuid[];
begin
  if not (private.owns_vendor(target_vendor_id) or private.is_admin()) then
    raise exception 'Vendor ownership required';
  end if;

  select vendor.geo_taluka_id, vendor.geo_district_id
    into home_taluka_id, home_district_id
  from public.vendors vendor
  where vendor.id = target_vendor_id;

  if home_taluka_id is null or home_district_id is null then
    raise exception 'Save a resolved business location before choosing service areas';
  end if;

  select array_agg(distinct candidate_id)
    into normalized_ids
  from unnest(array_append(coalesce(target_taluka_ids, array[]::uuid[]), home_taluka_id)) candidate_id;

  if coalesce(array_length(normalized_ids, 1), 0) > 20 then
    raise exception 'A maximum of 20 service Talukas can be selected';
  end if;

  if exists (
    select 1 from unnest(normalized_ids) candidate_id
    left join public.geo_talukas taluka on taluka.id = candidate_id
    where taluka.id is null or not taluka.is_active or taluka.district_id <> home_district_id
  ) then
    raise exception 'Service Talukas must be active and in the business District';
  end if;

  delete from public.vendor_service_talukas where vendor_id = target_vendor_id;
  insert into public.vendor_service_talukas(vendor_id, taluka_id)
  select target_vendor_id, candidate_id from unnest(normalized_ids) candidate_id;
end;
$$;

revoke all on function public.replace_my_vendor_service_talukas(uuid, uuid[]) from public;
grant execute on function public.replace_my_vendor_service_talukas(uuid, uuid[]) to authenticated;

-- Extend the existing bounded discovery function without copying its large,
-- frequently-audited projection. A vendor explicitly serving the requested
-- Taluka is placed in tier 0; its base-location neighbor row is suppressed so
-- every vendor still appears exactly once.
do $migration$
declare
  function_oid oid;
  definition text;
  old_join text := 'JOIN public.vendors vendor ON ((vendor.geo_taluka_id = taluka.id))';
  new_join text := 'JOIN public.vendors vendor ON ((((vendor.geo_taluka_id = taluka.id) AND (NOT (EXISTS (SELECT 1 FROM public.vendor_service_talukas coverage WHERE ((coverage.vendor_id = vendor.id) AND (coverage.taluka_id = p_taluka_id)))))) OR ((ordered.tier = 0) AND (EXISTS (SELECT 1 FROM public.vendor_service_talukas coverage WHERE ((coverage.vendor_id = vendor.id) AND (coverage.taluka_id = taluka.id)))))))';
begin
  select p.oid into function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_public_vendor_taluka_page_cards'
    and pg_get_function_identity_arguments(p.oid) = 'p_category_names text[], p_taluka_id uuid, p_search text, p_min_rating numeric, p_max_price numeric, p_sort text, p_limit integer, p_offset integer, p_after_tier integer, p_after_featured_rank integer, p_after_neg_review_count integer, p_after_neg_rating numeric, p_after_neg_updated_at double precision, p_after_vendor_id uuid';

  if function_oid is null then
    raise exception 'get_public_vendor_taluka_page_cards was not found';
  end if;
  definition := pg_get_functiondef(function_oid);
  if position(old_join in definition) = 0 then
    -- pg_get_functiondef formatting can differ by PostgreSQL patch release.
    old_join := 'join public.vendors vendor on vendor.geo_taluka_id = taluka.id';
  end if;
  if position(old_join in definition) = 0 then
    raise exception 'Expected vendor discovery join was not found; refusing an unsafe rewrite';
  end if;
  execute replace(definition, old_join, new_join);
end;
$migration$;

commit;
