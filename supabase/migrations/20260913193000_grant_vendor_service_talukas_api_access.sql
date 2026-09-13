begin;

-- RLS still decides which rows are visible/manageable. Table privileges are
-- also required before PostgREST can evaluate those policies.
grant select on table public.vendor_service_talukas to anon, authenticated;
grant insert, update, delete on table public.vendor_service_talukas to authenticated;

commit;
