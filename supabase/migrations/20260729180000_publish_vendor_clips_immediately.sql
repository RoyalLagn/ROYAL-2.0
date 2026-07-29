begin;

-- Product policy: owned vendor Clips are public immediately after a successful
-- upload. The existing public feed uses the "approved" status.
create or replace function private.set_clip_publication_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    new.published_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists clips_set_publication_on_insert on public.clips;
create trigger clips_set_publication_on_insert
before insert on public.clips
for each row
execute function private.set_clip_publication_on_insert();

drop policy if exists clips_vendor_insert on public.clips;

create policy clips_vendor_insert
on public.clips
for insert
to authenticated
with check (
  private.owns_vendor(vendor_id)
  and deleted_at is null
  and (
    (status in ('draft', 'pending') and published_at is null)
    or (
      status = 'approved'
      and visibility = 'public'
      and published_at is not null
    )
  )
);

commit;
