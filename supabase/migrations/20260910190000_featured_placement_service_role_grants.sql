-- The featured-placement Edge Functions use a service-role Supabase client
-- for payment persistence and reservation cleanup. Projects with automatic
-- table grants disabled require these privileges in addition to RLS bypass.
grant usage on schema public to service_role;
grant select, update on table public.featured_vendor_placements to service_role;
grant select, insert, update on table public.featured_vendor_payments to service_role;
