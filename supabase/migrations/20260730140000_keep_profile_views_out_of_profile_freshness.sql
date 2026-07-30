begin;

create or replace function private.set_vendor_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'profile_views' - 'updated_at')
     is not distinct from
     (to_jsonb(old) - 'profile_views' - 'updated_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
before update on public.vendors
for each row execute function private.set_vendor_updated_at();

commit;
