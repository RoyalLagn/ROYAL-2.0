begin;

-- ============================================================================
-- Two complementary data-completion steps so a PIN whose villages are
-- already known never dead-ends a vendor on "needs to be verified":
--
-- 1. Jaoli Taluka is seeded under that LGD spelling, but India Post's
--    unofficial Block field (and many maps) spell it "Jawali". Without the
--    alias, every office under that cluster (Block=Jawali, District=Satara)
--    matches State+District and still has taluka_id = null.
-- 2. Village B.O.s whose own Block/office name does not name a Taluka must
--    inherit the PIN's unique Taluka once one exists -- the same rule the
--    lookup Edge Function now applies on every live resolve.
-- ============================================================================
update public.geo_talukas
set aliases = array(select distinct unnest(aliases || array['Jawali', 'Jawli']))
where id in (
  select t.id
  from public.geo_talukas t
  join public.geo_districts d on d.id = t.district_id
  where public.normalize_geo_name(d.name) = public.normalize_geo_name('Satara')
    and public.normalize_geo_name(t.name) = public.normalize_geo_name('Jaoli')
);

create temporary table _pin_taluka_inherit_touched (pincode text) on commit drop;

with block_value as (
  select
    loc.id as locality_id,
    loc.pincode,
    loc.district_id,
    public.normalize_geo_name(coalesce(
      loc.raw_response->>'Block',
      loc.raw_response->>'taluk',
      loc.raw_response->>'taluka',
      loc.raw_response->>'block',
      loc.raw_response->>'Taluk',
      ''
    )) as block_name
  from public.geo_pincode_localities loc
  where loc.taluka_id is null
    and loc.district_id is not null
    and not loc.admin_confirmed
),
block_matches as (
  select bv.locality_id, t.id as taluka_id, bv.pincode
  from block_value bv
  join public.geo_talukas t on t.district_id = bv.district_id
  where bv.block_name <> ''
    and (
      bv.block_name = public.normalize_geo_name(t.name)
      or exists (
        select 1 from unnest(t.aliases) alias
        where bv.block_name = public.normalize_geo_name(alias)
      )
    )
),
updated_from_block as (
  update public.geo_pincode_localities loc
  set taluka_id = block_matches.taluka_id,
      updated_at = now()
  from block_matches
  where loc.id = block_matches.locality_id
  returning loc.pincode
)
insert into _pin_taluka_inherit_touched (pincode)
select distinct pincode from updated_from_block;

do $$
declare touched_pincode text;
begin
  for touched_pincode in select distinct pincode from _pin_taluka_inherit_touched
  loop
    perform private.refresh_geo_pincode_aggregate(touched_pincode);
  end loop;
end $$;

with inherited as (
  update public.geo_pincode_localities loc
  set taluka_id = pin.taluka_id,
      updated_at = now()
  from public.geo_pincodes pin
  where loc.pincode = pin.pincode
    and loc.taluka_id is null
    and pin.taluka_id is not null
    and pin.ambiguous is not true
    and not loc.admin_confirmed
  returning loc.pincode
)
insert into _pin_taluka_inherit_touched (pincode)
select distinct pincode from inherited;

do $$
declare touched_pincode text;
begin
  for touched_pincode in select distinct pincode from _pin_taluka_inherit_touched
  loop
    perform private.refresh_geo_pincode_aggregate(touched_pincode);
  end loop;
end $$;

commit;
