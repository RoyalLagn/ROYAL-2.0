begin;

-- ============================================================================
-- Root-cause fix: the India-wide District import
-- (20260814050000_geo_seed_maharashtra_full.sql,
-- 20260814060000_geo_seed_india_districts.sql) inserted rows without an
-- explicit is_active value, so every new District/Taluka silently inherited
-- the table's is_active DEFAULT TRUE and became publicly visible the moment
-- it was imported -- before any Admin had reviewed it. 778 of 779 Districts
-- and 358 of 360 Talukas were live to the public as a result.
--
-- Fix: default new rows to is_active = false going forward, and backfill
-- every District/Taluka that is NOT the pre-existing Pune pilot back to
-- is_active = false. Pune (district + its 16 talukas) is explicitly
-- excluded from the backfill and is left exactly as it already was --
-- nothing about Pune's current public visibility, vendors, or PIN mappings
-- changes. This only touches is_active (public/manual-discovery visibility)
-- -- it never touches accept_vendor_applications, and it never deletes or
-- rewrites a vendor, application, or geo_pincode(s)/geo_pincode_localities
-- row.
-- ============================================================================

alter table public.geo_districts alter column is_active set default false;
alter table public.geo_talukas alter column is_active set default false;

update public.geo_districts d
set is_active = false
where d.is_active = true
  and not (
    lower(d.name) = 'pune'
    and exists (select 1 from public.geo_states s where s.id = d.state_id and lower(s.name) = 'maharashtra')
  );

update public.geo_talukas t
set is_active = false
where t.is_active = true
  and t.district_id <> coalesce((
    select d.id from public.geo_districts d
    join public.geo_states s on s.id = d.state_id
    where lower(d.name) = 'pune' and lower(s.name) = 'maharashtra'
    limit 1
  ), '00000000-0000-0000-0000-000000000000'::uuid);

commit;
