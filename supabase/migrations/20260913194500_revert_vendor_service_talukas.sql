begin;

-- Revert the vendor-selectable Taluka feature. The table remains only because
-- the already-deployed discovery function has a compiled dependency on it;
-- with no rows it behaves exactly like the original base-location search.
delete from public.vendor_service_talukas;

revoke all on table public.vendor_service_talukas from anon, authenticated;
drop function if exists public.replace_my_vendor_service_talukas(uuid, uuid[]);

commit;
