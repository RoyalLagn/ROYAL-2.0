begin;

-- ============================================================================
-- One-time correction for rows cached *before* the source-precedence policy
-- (20260811020000 and the lookup-india-pincode Edge Function update) existed.
-- Those rows may have been marked 'resolved' from postalpincode.in alone,
-- which the corrected policy no longer allows without official
-- corroboration or Admin sign-off. Downgrade them to 'needs_review' rather
-- than leaving them silently "resolved" under a policy they never actually
-- satisfied, and cascade the same correction to any vendor currently
-- resolved from one of those PINs.
-- ============================================================================
update public.geo_pincodes
set resolution_status = 'needs_review'
where resolution_status = 'resolved'
  and source not in ('data.gov.in', 'admin_verified');

do $$
declare
  vendor_row record;
begin
  for vendor_row in
    select v.id, v.pincode
    from public.vendors v
    join public.geo_pincodes p on p.pincode = v.pincode
    where v.geo_resolution_status = 'resolved'
      and p.resolution_status <> 'resolved'
  loop
    perform private.resolve_vendor_geo_from_pincode(vendor_row.id, vendor_row.pincode);
  end loop;
end $$;

commit;
