begin;

create or replace function private.validate_package_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_package public.vendor_services%rowtype;
begin
  if new.package_id is null then
    new.package_name := nullif(btrim(new.package_name), '');
    return new;
  end if;

  select * into selected_package
  from public.vendor_services
  where id = new.package_id;

  if selected_package.id is null or selected_package.vendor_id <> new.vendor_id then
    raise exception 'The selected package does not belong to this vendor';
  end if;
  if tg_op = 'INSERT' and (
    selected_package.status <> 'active' or not selected_package.is_active
  ) then
    raise exception 'The selected package is not currently available';
  end if;

  -- Keep an immutable, human-readable snapshot for enquiry history.
  new.package_name := selected_package.title;
  return new;
end;
$$;

drop trigger if exists vendor_enquiries_validate_package on public.vendor_enquiries;
create trigger vendor_enquiries_validate_package
before insert or update of package_id, vendor_id on public.vendor_enquiries
for each row execute function private.validate_package_enquiry();

create or replace function private.notify_vendor_about_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vendor_notifications (
    vendor_id, title, body, kind, target_path
  ) values (
    new.vendor_id,
    case when new.package_name is null then 'New customer enquiry' else 'New package enquiry' end,
    case
      when new.package_name is null then new.customer_name || ' sent a new enquiry.'
      else new.customer_name || ' enquired about ' || new.package_name || '.'
    end,
    'enquiry',
    '/VendorEnquiries'
  );
  return new;
end;
$$;

drop trigger if exists vendor_enquiries_notify_vendor on public.vendor_enquiries;
create trigger vendor_enquiries_notify_vendor
after insert on public.vendor_enquiries
for each row execute function private.notify_vendor_about_enquiry();

commit;
