begin;

-- ============================================================================
-- Fix: private.resolve_vendor_geo_from_pincode was inferring "resolved vs
-- needs_review" purely from (taluka_id is not null and not ambiguous),
-- instead of trusting geo_pincodes.resolution_status -- the column the
-- Edge Function's source-precedence logic (20260811020000 and the
-- lookup-india-pincode update) actually writes that determination to. A
-- geo_pincodes row can now legitimately hold a *candidate* taluka_id on a
-- 'needs_review' row (an unofficial-provider match awaiting corroboration
-- or Admin confirmation) -- keeping that candidate id around is useful for
-- Admin review, but it must never be silently treated as a confirmed
-- resolution. This made every vendor sharing such a PIN immediately
-- re-resolve back to "resolved" after the P1-2 backfill downgraded the
-- cache row, defeating it.
--
-- The candidate taluka_id (when present on a needs_review row) is now
-- still surfaced to the vendor as extra context in geo_review_reason, but
-- is never written into vendors.geo_taluka_id.
-- ============================================================================
create or replace function private.resolve_vendor_geo_from_pincode(
  target_vendor_id uuid,
  target_pincode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached_pin public.geo_pincodes%rowtype;
  found_cache boolean := false;
  is_resolved boolean := false;
  candidate_taluka_name text;
begin
  if target_pincode ~ '^[1-9][0-9]{5}$' then
    select * into cached_pin from public.geo_pincodes where pincode = target_pincode;
    found_cache := found;
    is_resolved := found_cache and cached_pin.resolution_status = 'resolved' and not cached_pin.ambiguous;
  end if;

  if found_cache and cached_pin.taluka_id is not null then
    select name into candidate_taluka_name from public.geo_talukas where id = cached_pin.taluka_id;
  end if;

  update public.vendors
  set geo_state_id = case when is_resolved then cached_pin.state_id else null end,
      geo_district_id = case when is_resolved then cached_pin.district_id else null end,
      geo_taluka_id = case when is_resolved then cached_pin.taluka_id else null end,
      geo_latitude = case when is_resolved then cached_pin.latitude else null end,
      geo_longitude = case when is_resolved then cached_pin.longitude else null end,
      geo_resolution_status = case
        when not found_cache then 'unresolved'
        when is_resolved then 'resolved'
        else 'needs_review'
      end,
      geo_review_reason = case
        when not found_cache then
          'PIN code has not been looked up against the official location dataset yet.'
        when is_resolved then null
        when found_cache and cached_pin.ambiguous then
          'This PIN code matches more than one Taluka; an Admin must confirm the correct one.'
        when found_cache and cached_pin.district_id is null then
          'The State or District for this PIN code is not yet imported into RoyalLagn.'
        when found_cache and cached_pin.taluka_id is not null then
          'This PIN code likely matches ' || coalesce(candidate_taluka_name, 'a Taluka')
          || ', found only via an unofficial provider; an Admin must confirm it before it is used.'
        else
          'The Taluka for this PIN code could not be identified from official data.'
      end,
      geo_resolved_at = now()
  where id = target_vendor_id;
end;
$$;

commit;
