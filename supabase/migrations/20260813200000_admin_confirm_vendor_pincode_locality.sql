begin;

-- Canonical Admin correction path for a vendor whose selected PIN locality
-- is unresolved or ambiguous. Reuses geo_pincode_localities and the shared
-- atomic vendor resolver; legacy City/Area data is intentionally untouched.
create or replace function public.admin_confirm_vendor_pincode_locality(
  target_vendor_id uuid,
  target_taluka_id uuid
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendor_row public.vendors%rowtype;
  locality_row public.geo_pincode_localities%rowtype;
  taluka_row public.geo_talukas%rowtype;
  district_row public.geo_districts%rowtype;
  locality_count integer;
  selected_locality_id uuid;
  updated_vendor public.vendors%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;

  select * into vendor_row from public.vendors where id = target_vendor_id;
  if not found then raise exception 'Vendor not found'; end if;
  if vendor_row.pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Vendor does not have a valid six-digit PIN code';
  end if;

  select * into taluka_row from public.geo_talukas
  where id = target_taluka_id and is_active;
  if not found then raise exception 'Choose an active Taluka'; end if;
  select * into district_row from public.geo_districts
  where id = taluka_row.district_id and is_active;
  if not found or not exists (
    select 1 from public.geo_states where id = district_row.state_id and is_active
  ) then raise exception 'The selected Taluka hierarchy is inactive'; end if;

  if vendor_row.geo_pincode_locality_id is not null then
    select * into locality_row from public.geo_pincode_localities
    where id = vendor_row.geo_pincode_locality_id
      and pincode = vendor_row.pincode and is_active;
  else
    select count(*), min(id::text)::uuid into locality_count, selected_locality_id
    from public.geo_pincode_localities
    where pincode = vendor_row.pincode and is_active;
    if locality_count <> 1 then
      raise exception 'Vendor must select the correct locality before Admin can confirm its Taluka';
    end if;
    select * into locality_row from public.geo_pincode_localities where id = selected_locality_id;
  end if;
  if locality_row.id is null then raise exception 'The selected locality is unavailable'; end if;

  update public.geo_pincode_localities
  set state_id = district_row.state_id,
      district_id = district_row.id,
      taluka_id = taluka_row.id,
      source = 'admin_verified',
      source_trust = 4,
      is_trusted = true,
      admin_confirmed = true,
      updated_at = now()
  where id = locality_row.id;

  perform private.resolve_vendor_geo_from_pincode(
    vendor_row.id, vendor_row.pincode, locality_row.id
  );
  select * into updated_vendor from public.vendors where id = vendor_row.id;
  return updated_vendor;
end;
$$;

revoke all on function public.admin_confirm_vendor_pincode_locality(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_confirm_vendor_pincode_locality(uuid, uuid)
  to authenticated;

commit;
