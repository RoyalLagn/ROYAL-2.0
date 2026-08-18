begin;

-- The annual Tax Provision screen uses this table for the CA adjustment and
-- actual tax paid. Publish it alongside the existing Finance ledger tables
-- so an open Tax Provision view refreshes when another administrator saves a
-- change.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'finance_annual_tax_adjustments'
    ) then
    alter publication supabase_realtime add table public.finance_annual_tax_adjustments;
  end if;
end $$;

commit;
