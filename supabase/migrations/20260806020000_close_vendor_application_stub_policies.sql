begin;

-- Root cause
-- -----------
-- 20260722120000_create_vendor_application_workflow.sql shipped placeholder
-- policies (named "*_admin_stub_*") that granted `anon` unconditional
-- `using (true)` SELECT on public.vendor_applications and SELECT/UPDATE on
-- public.admin_notifications, plus EXECUTE on
-- public.review_vendor_application(). They stood in for an admin identity
-- model that did not exist yet. private.is_admin() arrived in
-- 20260720101000 / 20260801120000 and the admin-only wrapper
-- public.admin_review_vendor_application() arrived in 20260726150000, but
-- the stubs were never removed.
--
-- Live consequences with only the public anon key:
--   * every applicant's PII was world-readable (full_name, email, phone,
--     address, pincode, business_documents, rejection_reason);
--   * any pending vendor application could be approved or rejected by an
--     unauthenticated caller, bypassing admin review entirely;
--   * admin notifications could be read and marked as read by anyone.
--
-- Fix: remove the stubs and express the real access rules. Submissions
-- already flow through the service-role submit-vendor-application edge
-- function (INSERT for anon/authenticated was revoked in 20260801162000),
-- so `anon` needs no access to either table.

drop policy if exists "vendor_applications_admin_stub_read" on public.vendor_applications;
drop policy if exists "admin_notifications_admin_stub_read" on public.admin_notifications;
drop policy if exists "admin_notifications_admin_stub_update" on public.admin_notifications;

revoke all on public.vendor_applications from anon;
revoke all on public.admin_notifications from anon, authenticated;

grant select on public.vendor_applications to authenticated;
grant select, update on public.admin_notifications to authenticated;

-- Applicants may read their own application so VendorLogin can route them to
-- the pending/rejected status screen; services/vendorAuth.ts matches on
-- profile_id or the account email, so both are permitted here. Admins read
-- all of them for the review queue.
create policy "vendor_applications_owner_read" on public.vendor_applications
for select to authenticated
using (
  profile_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or private.is_admin()
);

create policy "admin_notifications_admin_read" on public.admin_notifications
for select to authenticated
using (private.is_admin());

create policy "admin_notifications_admin_update" on public.admin_notifications
for update to authenticated
using (private.is_admin())
with check (private.is_admin());

-- Approval must go through admin_review_vendor_application(), which enforces
-- private.is_admin() and writes the admin_vendor_activity audit row. That
-- wrapper is SECURITY DEFINER, so it keeps calling the inner function after
-- the direct grants are removed.
revoke all on function public.review_vendor_application(
  uuid, public.vendor_application_status, text
) from public, anon, authenticated;

commit;
