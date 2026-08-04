begin;

-- Vendor categories (Photographers, Venues, etc.) are non-sensitive taxonomy
-- data, not vendor data. The employee workspace vendor-creation form needs
-- to read them to populate a category picker. Read-only; write access stays
-- admin-only via the existing crm_vendor_categories_admin_all policy.

grant select on public.crm_vendor_categories to anon;

create policy crm_vendor_categories_public_read
on public.crm_vendor_categories for select to anon
using (is_active);

commit;
