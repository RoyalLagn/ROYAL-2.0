begin;

-- Credentials determine Razorpay's environment. A public database mode flag
-- can drift from the configured credentials, so it must not drive checkout.
delete from public.application_settings where key = 'razorpay_mode';

-- Vendor and admin payment screens subscribe to authoritative payment rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'subscription_payments'
    ) then
    alter publication supabase_realtime add table public.subscription_payments;
  end if;
end;
$$;

commit;
