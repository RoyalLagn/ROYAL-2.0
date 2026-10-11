-- Migration: 20261009151000_referral_grants_fix.sql
-- Table Grants for service_role on Phase 1 referral tables

begin;

grant all on public.customer_payment_destinations to service_role;
grant all on public.referral_payout_requests to service_role;
grant all on public.referral_profiles to service_role;
grant all on public.referral_commissions to service_role;

commit;
