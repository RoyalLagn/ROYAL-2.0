begin;

-- New Supabase projects do not auto-grant table privileges to service_role.
-- The PIN lookup Edge Function uses this role only to read managed locations
-- and cache a verified provider response; RLS remains enforced for clients.
grant usage on schema public to service_role;
grant select on public.supported_cities, public.supported_areas to service_role;
grant select, insert, update on public.supported_pincodes to service_role;

commit;
