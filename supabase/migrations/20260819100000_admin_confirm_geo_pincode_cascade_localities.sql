begin;

-- ============================================================================
-- Extends admin_confirm_geo_pincode (20260811020000) so a single Admin
-- confirmation trusts every locality already on record for that PIN, not
-- just the PIN-level geo_pincodes row.
--
-- Why this was needed: the original version only wrote geo_pincodes. Its
-- child geo_pincode_localities rows stayed source=postalpincode.in /
-- is_trusted=false / admin_confirmed=false forever, which meant:
--   1. An Admin who confirmed a PIN's Taluka still had every individual
--      locality under that PIN showing as an "unofficial candidate" to
--      vendors, one at a time.
--   2. The very next live provider re-lookup (once the PIN cache goes stale,
--      see PIN_CACHE_STALE_DAYS in lookup-india-pincode) was free to
--      overwrite those locality rows with a *different*, lower-quality
--      match (e.g. data.gov.in has no Taluka field at all for this
--      resource) -- the lookup function's own upsert only skips a locality
--      row when admin_confirmed = true, and that was never being set.
--
-- Safety rules preserved (P1-2 / P1-3):
--   - Never touches a locality already independently resolved to a
--     *different* Taluka -- that is a genuine multi-Taluka PIN and must be
--     mapped locality-by-locality, never overridden by one bulk PIN
--     confirmation (raises instead of silently reassigning).
--   - Refuses outright when geo_pincodes.ambiguous is already true for this
--     PIN, for the same reason.
--   - Still scoped to exactly one PIN + one Taluka per call -- there is no
--     "confirm every PIN in a District" variant.
-- ============================================================================
create or replace function public.admin_confirm_geo_pincode(
  target_pincode text,
  target_taluka_id uuid
)
returns public.geo_pincodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  taluka public.geo_talukas%rowtype;
  district public.geo_districts%rowtype;
  updated public.geo_pincodes%rowtype;
  existing_pin public.geo_pincodes%rowtype;
  vendor_row record;
  conflicting_localities integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;

  select * into taluka from public.geo_talukas where id = target_taluka_id and is_active;
  if not found then raise exception 'That Taluka is not an active, known record'; end if;
  select * into district from public.geo_districts where id = taluka.district_id;

  -- A PIN already flagged ambiguous (more than one candidate Taluka across
  -- its localities) must be resolved locality-by-locality, never collapsed
  -- into one Taluka by a single bulk confirmation.
  select * into existing_pin from public.geo_pincodes where pincode = target_pincode;
  if found and existing_pin.ambiguous then
    raise exception 'PIN % spans multiple Talukas -- map each locality to its own Taluka individually instead of confirming the whole PIN', target_pincode;
  end if;

  -- Defense in depth even when the ambiguous flag wasn't set for some
  -- reason: never silently reassign a locality that's already resolved to
  -- a Taluka other than the one being confirmed here.
  select count(*) into conflicting_localities
  from public.geo_pincode_localities
  where pincode = target_pincode
    and taluka_id is not null
    and taluka_id <> target_taluka_id;
  if conflicting_localities > 0 then
    raise exception 'PIN % has % locality(ies) already mapped to a different Taluka -- map each locality individually', target_pincode, conflicting_localities;
  end if;

  update public.geo_pincodes
  set state_id = district.state_id,
      district_id = taluka.district_id,
      taluka_id = taluka.id,
      resolution_status = 'resolved',
      ambiguous = false,
      source = 'admin_verified',
      verified_at = now()
  where pincode = target_pincode
  returning * into updated;

  if not found then
    insert into public.geo_pincodes (
      pincode, state_id, district_id, taluka_id, resolution_status, ambiguous, source, verified_at
    ) values (
      target_pincode, district.state_id, taluka.district_id, taluka.id, 'resolved', false, 'admin_verified', now()
    )
    returning * into updated;
  end if;

  -- Cascade to every locality already on record for this PIN -- this is the
  -- "confirm once, trust all matching localities automatically" behaviour.
  -- Scoped to localities with no Taluka yet or already agreeing with this
  -- one (the conflict check above already ruled out anything else).
  update public.geo_pincode_localities
  set state_id = district.state_id,
      district_id = taluka.district_id,
      taluka_id = taluka.id,
      is_trusted = true,
      admin_confirmed = true,
      source = 'admin_verified',
      source_trust = 4,
      verified_at = now()
  where pincode = target_pincode
    and (taluka_id is null or taluka_id = taluka.id);

  update public.geo_pincodes
  set locality_count = (select count(*) from public.geo_pincode_localities where pincode = target_pincode and is_active),
      trusted_locality_count = (select count(*) from public.geo_pincode_localities where pincode = target_pincode and is_active and is_trusted),
      locality_selection_required = (select count(*) from public.geo_pincode_localities where pincode = target_pincode and is_active and is_trusted) > 1
  where pincode = target_pincode;

  -- Re-resolve every vendor currently on this PIN so the confirmation takes
  -- effect immediately rather than waiting for each vendor to be re-saved.
  for vendor_row in select id from public.vendors where pincode = target_pincode
  loop
    perform private.resolve_vendor_geo_from_pincode(vendor_row.id, target_pincode);
  end loop;

  select * into updated from public.geo_pincodes where pincode = target_pincode;
  return updated;
end;
$$;

revoke all on function public.admin_confirm_geo_pincode(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_confirm_geo_pincode(text, uuid) to authenticated;

commit;
