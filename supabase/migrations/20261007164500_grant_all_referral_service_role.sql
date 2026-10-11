-- Migration: 20261007164500_grant_all_referral_service_role.sql
-- Grant full privileges to service_role and allow delete where appropriate

begin;

grant all on public.referral_profiles to service_role;
grant all on public.referral_attributions to service_role;
grant all on public.referral_commissions to service_role;
grant all on public.referral_payout_requests to service_role;

commit;
