begin;

-- ============================================================================
-- Companion to admin_confirm_geo_pincode (20260811020000, cascaded in
-- 20260819100000): that RPC deliberately REFUSES to bulk-confirm a whole PIN
-- once any of its localities is already mapped to a different Taluka than
-- the one being confirmed -- exactly the case a real PIN surfaced (multiple
-- villages under one PIN independently resolved, by an unofficial source, to
-- three different neighboring Talukas). That refusal is correct and stays;
-- what was missing is a way to actually resolve that case: confirm ONE
-- specific locality to ONE specific Taluka, leaving every other locality
-- under the same PIN untouched. This is the per-locality counterpart the
-- safety rule ("map and evaluate each locality separately") requires.
-- ============================================================================
create or replace function public.admin_confirm_geo_pincode_locality(
  target_locality_id uuid,
  target_taluka_id uuid
)
returns public.geo_pincode_localities
language plpgsql
security definer
set search_path = ''
as $$
declare
  locality public.geo_pincode_localities%rowtype;
  taluka public.geo_talukas%rowtype;
  district public.geo_districts%rowtype;
  vendor_row record;
  updated public.geo_pincode_localities%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;

  select * into locality from public.geo_pincode_localities where id = target_locality_id;
  if not found then raise exception 'That locality could not be found'; end if;

  select * into taluka from public.geo_talukas where id = target_taluka_id and is_active;
  if not found then raise exception 'That Taluka is not an active, known record'; end if;
  select * into district from public.geo_districts where id = taluka.district_id;

  if locality.district_id is not null and locality.district_id <> taluka.district_id then
    raise exception 'This locality belongs to a different District than the selected Taluka';
  end if;

  update public.geo_pincode_localities
  set state_id = district.state_id,
      district_id = taluka.district_id,
      taluka_id = taluka.id,
      is_trusted = true,
      admin_confirmed = true,
      source = 'admin_verified',
      source_trust = 4,
      verified_at = now()
  where id = target_locality_id
  returning * into updated;

  -- Recompute the PIN-level aggregate from the now-corrected locality set --
  -- this is what turns a genuinely multi-Taluka PIN into "ambiguous" (so
  -- vendors are correctly asked to choose their exact locality) once its
  -- localities have been confirmed to different Talukas, or "resolved" once
  -- they all agree.
  perform private.refresh_geo_pincode_aggregate(updated.pincode);

  -- Any vendor already sitting on this exact locality gets re-resolved
  -- immediately rather than waiting for a re-save.
  for vendor_row in select id from public.vendors where geo_pincode_locality_id = target_locality_id
  loop
    perform private.resolve_vendor_geo_from_pincode(vendor_row.id, updated.pincode, target_locality_id);
  end loop;

  return updated;
end;
$$;

revoke all on function public.admin_confirm_geo_pincode_locality(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_confirm_geo_pincode_locality(uuid, uuid) to authenticated;

commit;
