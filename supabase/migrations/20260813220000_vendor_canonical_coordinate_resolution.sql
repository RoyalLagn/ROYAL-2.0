begin;

-- Every canonically resolved vendor needs a usable point for Near Me. Prefer
-- the selected locality, then the PIN cache, and finally the canonical Taluka
-- centroid when the imported locality dataset has no point yet.
create or replace function private.resolve_vendor_geo_from_pincode(
  target_vendor_id uuid,
  target_pincode text,
  target_locality_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pin_row public.geo_pincodes%rowtype;
  locality_row public.geo_pincode_localities%rowtype;
  taluka_row public.geo_talukas%rowtype;
  trusted_count integer := 0;
  hierarchy_resolved boolean := false;
  resolved_lat double precision;
  resolved_lng double precision;
begin
  if target_pincode ~ '^[1-9][0-9]{5}$' then
    select * into pin_row from public.geo_pincodes where pincode = target_pincode;
  end if;

  if target_locality_id is not null then
    select * into locality_row from public.geo_pincode_localities
    where id = target_locality_id and pincode = target_pincode and is_active;
    if not found then raise exception 'The selected locality does not belong to this PIN code'; end if;
  else
    select count(*) into trusted_count
    from public.geo_pincode_localities
    where pincode = target_pincode and is_active and is_trusted;
    if trusted_count = 1 then
      select * into locality_row from public.geo_pincode_localities
      where pincode = target_pincode and is_active and is_trusted limit 1;
    end if;
  end if;

  hierarchy_resolved := locality_row.id is not null
    and locality_row.is_trusted
    and locality_row.state_id is not null
    and locality_row.district_id is not null
    and locality_row.taluka_id is not null;

  if not hierarchy_resolved and pin_row.source = 'admin_verified'
      and pin_row.resolution_status = 'resolved' and not pin_row.ambiguous then
    hierarchy_resolved := true;
  end if;

  if hierarchy_resolved then
    select * into taluka_row from public.geo_talukas
    where id = coalesce(locality_row.taluka_id, pin_row.taluka_id);
    if locality_row.latitude is not null and locality_row.longitude is not null then
      resolved_lat := locality_row.latitude;
      resolved_lng := locality_row.longitude;
    elsif pin_row.latitude is not null and pin_row.longitude is not null then
      resolved_lat := pin_row.latitude;
      resolved_lng := pin_row.longitude;
    else
      resolved_lat := taluka_row.latitude;
      resolved_lng := taluka_row.longitude;
    end if;
  end if;

  update public.vendors
  set geo_pincode_locality_id = case when locality_row.id is not null then locality_row.id else null end,
      geo_state_id = case when hierarchy_resolved then coalesce(locality_row.state_id, pin_row.state_id) else null end,
      geo_district_id = case when hierarchy_resolved then coalesce(locality_row.district_id, pin_row.district_id) else null end,
      geo_taluka_id = case when hierarchy_resolved then coalesce(locality_row.taluka_id, pin_row.taluka_id) else null end,
      geo_latitude = case when hierarchy_resolved then resolved_lat else null end,
      geo_longitude = case when hierarchy_resolved then resolved_lng else null end,
      geo_resolution_status = case
        when hierarchy_resolved and resolved_lat is not null and resolved_lng is not null then 'resolved'
        when hierarchy_resolved then 'needs_review'
        when pin_row.pincode is null then 'unresolved'
        else 'needs_review'
      end,
      geo_review_reason = case
        when hierarchy_resolved and (resolved_lat is null or resolved_lng is null)
          then 'The canonical hierarchy is resolved but no usable coordinates are available for Near Me.'
        when hierarchy_resolved then null
        when pin_row.pincode is null then 'PIN code is not present in the canonical India Post dataset.'
        when trusted_count > 1 and target_locality_id is null then 'Choose the post office/locality that matches the business address.'
        when locality_row.id is not null and not locality_row.is_trusted then 'The selected locality is an unofficial candidate awaiting Admin confirmation.'
        when locality_row.id is not null and locality_row.taluka_id is null then 'The selected locality has not been reconciled to a canonical Taluka.'
        else 'The PIN code hierarchy requires Admin review.'
      end,
      geo_resolved_at = now()
  where id = target_vendor_id;
end;
$$;

revoke all on function private.resolve_vendor_geo_from_pincode(uuid, text, uuid)
  from public, anon, authenticated;

-- Bring historical canonical vendors onto the same coordinate rule without
-- changing their PIN or locality selection.
do $$
declare vendor_row record;
begin
  for vendor_row in
    select id, pincode, geo_pincode_locality_id
    from public.vendors
    where pincode ~ '^[1-9][0-9]{5}$'
      and geo_taluka_id is not null
      and (geo_latitude is null or geo_longitude is null)
  loop
    perform private.resolve_vendor_geo_from_pincode(
      vendor_row.id, vendor_row.pincode, vendor_row.geo_pincode_locality_id
    );
  end loop;
end;
$$;

commit;
