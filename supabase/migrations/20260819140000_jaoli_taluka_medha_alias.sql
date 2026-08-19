begin;

-- ============================================================================
-- Data completion, not new logic: PIN 415012 (Satara district) surfaced that
-- Jaoli Taluka's own post offices (Medha S.O., etc.) never resolve, because
-- neither data.gov.in nor postalpincode.in carries "Jaoli" anywhere in their
-- raw fields for this cluster -- Medha is Jaoli Taluka's administrative
-- headquarters town, but the office itself is named after the town, not the
-- Taluka (the same pattern this system already records for other Satara
-- Talukas: Man's headquarters is Dahiwadi, Khatav's is Vaduj -- both already
-- carried as aliases). This adds the same, single alias for Jaoli, verified
-- against the standard Satara district Taluka headquarters list. It does
-- not touch any PIN, locality, or vendor row -- future lookups for this and
-- any other PIN whose offices are named after Medha will now match Jaoli
-- automatically via the existing alias-matching logic.
-- ============================================================================
update public.geo_talukas
set aliases = array(select distinct unnest(aliases || array['Medha']))
where id in (
  select t.id
  from public.geo_talukas t
  join public.geo_districts d on d.id = t.district_id
  where lower(d.name) = 'satara' and lower(t.name) = 'jaoli'
);

commit;
