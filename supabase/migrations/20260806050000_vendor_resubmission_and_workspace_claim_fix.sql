begin;

-- Root cause of the reported "resubmission creates duplicates" risk
-- -------------------------------------------------------------------
-- submit-vendor-application (the Edge Function all Vendor applications go
-- through, per 20260801162000 which revoked direct INSERT for
-- anon/authenticated) always INSERTed a new row and always set
-- profile_id = null, even when the caller was already authenticated and
-- resubmitting after a rejection. The service_role table grant only
-- included SELECT and INSERT, so an UPDATE-on-resubmit was not even
-- possible until this migration. The Edge Function has been updated
-- (supabase/functions/submit-vendor-application/index.ts) to identify the
-- caller from their own request and to UPDATE an existing rejected
-- application in place instead of inserting a duplicate; this migration
-- grants the privilege that update needs and adds the index the new
-- caller-identity lookup relies on.

grant update on public.vendor_applications to service_role;

-- resolveVendorDestination() (services/vendorAuth.ts) and the Edge
-- Function's resubmission lookup both filter vendor_applications by
-- profile_id first. That column had no index, so every vendor sign-in and
-- every Become Vendor resubmission check was a sequential scan.
create index if not exists vendor_applications_profile_id_idx
  on public.vendor_applications (profile_id)
  where profile_id is not null;

commit;
