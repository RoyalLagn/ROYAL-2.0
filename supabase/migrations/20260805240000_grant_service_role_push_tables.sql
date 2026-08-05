begin;

-- Edge Functions use the service_role key. Under the project's privilege model,
-- service_role does not receive table DML by default, so send-admin-push could
-- not read profiles (admin check) or write campaign/inbox rows.

grant select on public.profiles to service_role;

grant select, insert, update on public.push_campaigns to service_role;
grant select on public.push_tokens to service_role;
grant select, insert on public.customer_notifications to service_role;
grant select, insert on public.vendor_notifications to service_role;
grant select on public.vendors to service_role;

notify pgrst, 'reload schema';

commit;
