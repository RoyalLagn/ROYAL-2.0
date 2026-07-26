begin;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vendor_portfolio_media'
    ) then
      alter publication supabase_realtime add table public.vendor_portfolio_media;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reviews'
    ) then
      alter publication supabase_realtime add table public.reviews;
    end if;
  end if;
end
$$;

commit;
