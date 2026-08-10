begin;

-- ============================================================================
-- P1-2: "allow Admin review" -- lets an Admin manually confirm (or correct)
-- a PIN's Taluka match that only an unofficial provider (postalpincode.in)
-- was able to find, promoting it to a fully trusted, precedence-respecting
-- 'admin_verified' source so it is never again downgraded by a later
-- unofficial-provider lookup. Cascades to every vendor currently on that
-- PIN so no vendor is left showing a stale/needs_review status after an
-- Admin has actually confirmed the mapping.
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
  vendor_row record;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;

  select * into taluka from public.geo_talukas where id = target_taluka_id and is_active;
  if not found then raise exception 'That Taluka is not an active, known record'; end if;
  select * into district from public.geo_districts where id = taluka.district_id;

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

  -- Re-resolve every vendor currently on this PIN so the confirmation takes
  -- effect immediately rather than waiting for each vendor to be re-saved.
  for vendor_row in select id from public.vendors where pincode = target_pincode
  loop
    perform private.resolve_vendor_geo_from_pincode(vendor_row.id, target_pincode);
  end loop;

  return updated;
end;
$$;

revoke all on function public.admin_confirm_geo_pincode(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_confirm_geo_pincode(text, uuid) to authenticated;

commit;
