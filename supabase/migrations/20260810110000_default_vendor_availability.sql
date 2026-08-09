begin;

-- Available is the absence of an exception. Remove redundant historical
-- rows, then prevent new explicit Available rows from being stored.
delete from public.vendor_availability where status = 'available';

alter table public.vendor_availability
  drop constraint if exists vendor_availability_exceptions_only,
  add constraint vendor_availability_exceptions_only
    check (status in ('tentative', 'blocked'));

create or replace function private.effective_vendor_availability_status(
  target_vendor_id uuid,
  target_date date,
  excluded_enquiry_id uuid default null
)
returns public.vendor_availability_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.vendor_enquiries enquiry
      where enquiry.vendor_id = target_vendor_id
        and enquiry.event_date = target_date
        and enquiry.booking_confirmed
        and (excluded_enquiry_id is null or enquiry.id <> excluded_enquiry_id)
    ) then 'blocked'::public.vendor_availability_status
    else coalesce(
      (
        select exception.status
        from public.vendor_availability exception
        where exception.vendor_id = target_vendor_id and exception.date = target_date
      ),
      'available'::public.vendor_availability_status
    )
  end;
$$;

create or replace function public.get_vendor_availability_calendar(
  target_vendor_id uuid,
  start_date date,
  end_date date
)
returns table (
  date date,
  status public.vendor_availability_status,
  is_exception boolean,
  booking_blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    day::date,
    private.effective_vendor_availability_status(target_vendor_id, day::date),
    exception.id is not null,
    exists (
      select 1 from public.vendor_enquiries enquiry
      where enquiry.vendor_id = target_vendor_id
        and enquiry.event_date = day::date
        and enquiry.booking_confirmed
    )
  from generate_series(start_date, end_date, interval '1 day') day
  left join public.vendor_availability exception
    on exception.vendor_id = target_vendor_id and exception.date = day::date
  where start_date <= end_date
    and (
      private.vendor_is_public(target_vendor_id)
      or private.workspace_vendor_owned(target_vendor_id)
      or private.is_admin()
    )
  order by day;
$$;

create or replace function public.set_vendor_availability_exception(
  target_vendor_id uuid,
  target_date date,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.workspace_vendor_owned(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor access required' using errcode = '42501';
  end if;
  if target_date < current_date then
    raise exception 'Past availability is read-only' using errcode = '22023';
  end if;
  if next_status not in ('available', 'tentative', 'blocked') then
    raise exception 'Invalid availability status' using errcode = '22023';
  end if;

  if next_status = 'available' then
    delete from public.vendor_availability
    where vendor_id = target_vendor_id and date = target_date;
    return;
  end if;

  insert into public.vendor_availability(vendor_id, date, status)
  values (target_vendor_id, target_date, next_status::public.vendor_availability_status)
  on conflict (vendor_id, date) do update set
    status = excluded.status,
    updated_at = now();
end;
$$;

create or replace function private.validate_confirmed_booking_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'booked'
    and new.event_date is not null
    and (old.status is distinct from 'booked' or old.event_date is distinct from new.event_date)
    and private.effective_vendor_availability_status(new.vendor_id, new.event_date, new.id) = 'blocked'
  then
    raise exception 'This vendor is blocked or already booked on the selected date' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_enquiries_validate_booking_availability on public.vendor_enquiries;
create trigger vendor_enquiries_validate_booking_availability
before update of status, event_date on public.vendor_enquiries
for each row execute function private.validate_confirmed_booking_availability();

-- All exception mutations go through the RPC above. This prevents direct
-- clients from inserting Available rows or changing locked past dates.
revoke insert, update, delete on public.vendor_availability from authenticated;

revoke all on function public.get_vendor_availability_calendar(uuid, date, date) from public;
revoke all on function public.set_vendor_availability_exception(uuid, date, text) from public;
grant execute on function public.get_vendor_availability_calendar(uuid, date, date) to anon, authenticated;
grant execute on function public.set_vendor_availability_exception(uuid, date, text) to authenticated;

commit;
