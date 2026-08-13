begin;

-- Pre-existing, unrelated bug surfaced while verifying the deployed
-- submit-vendor-application Edge Function end-to-end: public.application_settings
-- was created with RLS policies (authenticated/admin) but no table-level
-- GRANT for service_role at all. RLS bypass for service_role only matters
-- once the base table privilege check passes -- with no grant, every
-- service-role query against this table (including
-- submit-vendor-application's very first "is vendor registration enabled"
-- check) failed with "permission denied for table application_settings",
-- meaning every vendor application submission was failing before reaching
-- any location/category/PIN logic at all.
grant select on public.application_settings to service_role;

commit;
