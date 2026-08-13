begin;

-- ============================================================================
-- Splits "is this Taluka open to NEW vendor applications" from
-- geo_talukas.is_active, which already controls public marketplace
-- visibility (RLS read policies + get_public_vendor_taluka_page's join).
-- Overloading is_active for both meanings would mean deactivating new
-- applications for a Taluka also hides its already-approved, publicly
-- discoverable vendors -- explicitly disallowed by the Admin location spec.
--
-- accept_vendor_applications is additive and defaults to true, matching the
-- current implicit behaviour of every existing Taluka (all of them accept
-- applications today). No existing row's public visibility, PIN mapping, or
-- vendor data changes.
-- ============================================================================

alter table public.geo_talukas
  add column if not exists accept_vendor_applications boolean not null default true;

comment on column public.geo_talukas.accept_vendor_applications is
  'Whether NEW vendor applications are accepted from this Taluka. Independent of is_active, which gates public marketplace visibility for already-approved vendors. Toggled from the /AdminGeoLocations "Talukas in selected District" switches.';

commit;
