-- Migration: 20261007140000_grant_direct_booking_permissions.sql
-- Grant table and function permissions for direct booking workflows to anon, authenticated, and service_role

begin;

grant select, insert, update, delete on public.vendor_bookings to anon, authenticated, service_role;
grant select, insert, update, delete on public.booking_refund_requests to authenticated, service_role;
grant select on public.booking_refund_requests to anon;

grant execute on function public.get_vendor_availability_calendar(uuid, date, date) to anon, authenticated, service_role;
grant execute on function public.confirm_vendor_booking(uuid) to authenticated, service_role;
grant execute on function public.cancel_vendor_booking(uuid, text) to authenticated, service_role;
grant execute on function public.process_admin_refund(uuid, text, text) to authenticated, service_role;

commit;
