begin;

-- This project does not auto-grant table privileges to service_role on new
-- tables (see 20260801161000_location_edge_function_permissions.sql and
-- 20260805240000_grant_service_role_push_tables.sql for the same pattern).
-- The lookup-india-pincode Edge Function runs as service_role and needs to
-- read the geo hierarchy and write PIN resolutions to geo_pincodes.
grant select on public.geo_states, public.geo_districts, public.geo_talukas,
  public.geo_taluka_neighbors to service_role;
grant select, insert, update on public.geo_pincodes to service_role;

commit;
