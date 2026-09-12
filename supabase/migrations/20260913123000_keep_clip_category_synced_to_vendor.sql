begin;

-- A Clip's discovery category is owned by its vendor profile. Keep updates
-- from older app builds (or direct API calls) from moving a Clip into another
-- category, while still allowing category deletion to set the value to null.
create or replace function private.sync_clip_category_to_vendor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendor_category_id uuid;
begin
  select vendor.category_id into vendor_category_id
  from public.vendors vendor
  where vendor.id = new.vendor_id;

  if tg_op = 'INSERT' then
    new.category_id := vendor_category_id;
  elsif new.vendor_id is distinct from old.vendor_id
     or new.category_id is distinct from old.category_id then
    new.category_id := vendor_category_id;
  end if;

  return new;
end;
$$;

drop trigger if exists clips_sync_category_to_vendor on public.clips;
create trigger clips_sync_category_to_vendor
before insert or update of vendor_id, category_id on public.clips
for each row execute function private.sync_clip_category_to_vendor();

commit;
