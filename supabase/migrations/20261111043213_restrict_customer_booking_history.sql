-- Booking history belongs to the authenticated customer, vendor owner or admin.
-- A ticket reference alone must never grant table-wide read access.
begin;
drop policy if exists "vendor_bookings_select_policy" on public.vendor_bookings;
create policy "vendor_bookings_select_policy"
on public.vendor_bookings for select to authenticated
using (
  customer_id = (select auth.uid())
  or private.owns_vendor(vendor_id)
  or private.is_admin()
);
commit;
