begin;

-- Admin decision: every Taluka should start OUT of accepting new vendor
-- applications, and an administrator opts individual Talukas/Districts in
-- explicitly, rather than every imported Taluka being wide open by default.
-- This only touches accept_vendor_applications (new-application gating) --
-- it never touches is_active (public visibility of already-approved
-- vendors), so nothing already live in the marketplace disappears.
alter table public.geo_talukas
  alter column accept_vendor_applications set default false;

update public.geo_talukas
set accept_vendor_applications = false
where accept_vendor_applications = true;

commit;
