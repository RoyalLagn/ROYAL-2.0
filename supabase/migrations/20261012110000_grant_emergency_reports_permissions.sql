-- Migration: 20261012110000_grant_emergency_reports_permissions.sql
-- Grant table permissions on booking_emergency_reports to authenticated, service_role, and anon

begin;

grant select, insert, update, delete on public.booking_emergency_reports to authenticated, service_role;
grant select on public.booking_emergency_reports to anon;

commit;
