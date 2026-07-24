begin;

-- The first Vendor workspace migration introduced this table with an
-- available_date column and an extra booked status. Bring existing projects
-- forward without replacing the table or losing availability records.
alter table public.vendor_availability
  rename column available_date to date;

alter table public.vendor_availability
  drop constraint if exists vendor_availability_status_check;

update public.vendor_availability
set status = 'blocked'
where status = 'booked';

create type public.vendor_availability_status as enum (
  'available',
  'tentative',
  'blocked'
);

alter table public.vendor_availability
  alter column status drop default,
  alter column status type public.vendor_availability_status
    using status::public.vendor_availability_status,
  alter column status set default 'available'::public.vendor_availability_status;

alter table public.vendor_availability
  drop column if exists note;

create unique index if not exists vendor_availability_vendor_date_uidx
  on public.vendor_availability(vendor_id, date);

create index if not exists vendor_availability_vendor_status_date_idx
  on public.vendor_availability(vendor_id, status, date);

drop trigger if exists vendor_availability_set_updated_at
  on public.vendor_availability;
create trigger vendor_availability_set_updated_at
before update on public.vendor_availability
for each row execute function private.set_updated_at();

alter table public.vendor_availability enable row level security;

grant select on public.vendor_availability to anon;
grant select, insert, update, delete on public.vendor_availability to authenticated;

commit;
