-- The portfolio delete Edge Function verifies ownership with the service-role
-- client before removing the Cloudinary asset and its database row. New
-- Supabase projects do not implicitly expose newly created tables to that role.
grant usage on schema public to service_role;
grant select on public.profiles, public.vendors to service_role;
grant select, delete on public.vendor_portfolio_media to service_role;
