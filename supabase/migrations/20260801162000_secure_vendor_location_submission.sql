begin;

-- Vendor applications now go through submit-vendor-application, where the
-- server rechecks the PIN provider result and managed location IDs.
revoke insert on public.vendor_applications from anon, authenticated;
drop policy if exists vendor_applications_submit on public.vendor_applications;

grant select, insert on public.vendor_applications to service_role;
grant select on public.categories, public.supported_cities,
  public.supported_areas, public.supported_pincodes to service_role;

commit;
