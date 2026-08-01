begin;

drop policy if exists "enquiries_owner_read" on public.vendor_enquiries;
create policy "enquiries_vendor_admin_read" on public.vendor_enquiries
for select to authenticated using (private.workspace_vendor_owned(vendor_id));

create or replace function public.list_my_enquiries()
returns table (
  id uuid,
  vendor_id uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  event_date date,
  event_type text,
  message text,
  status text,
  reference_code text,
  enquiry_channel text,
  source_type text,
  source_record_id text,
  customer_confirmation text,
  follow_up_date date,
  booking_confirmed boolean,
  package_id uuid,
  package_name text,
  created_at timestamptz,
  updated_at timestamptz,
  vendor_name text,
  vendor_phone text,
  vendor_logo text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.vendor_id, e.customer_id, e.customer_name, e.customer_email,
    e.customer_phone, e.event_date, e.event_type, e.message, e.status,
    e.reference_code, e.enquiry_channel, e.source_type, e.source_record_id,
    e.customer_confirmation, e.follow_up_date, e.booking_confirmed,
    e.package_id, e.package_name, e.created_at, e.updated_at,
    v.business_name, v.contact_phone, v.logo_url
  from public.vendor_enquiries e
  join public.vendors v on v.id = e.vendor_id
  where auth.uid() is not null and e.customer_id = auth.uid()
  order by e.created_at desc;
$$;

drop function if exists public.update_customer_enquiry_confirmation(uuid,text);
create function public.update_customer_enquiry_confirmation(
  target_enquiry_id uuid,
  next_confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare updated_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if next_confirmation not in ('contacted', 'cancelled', 'closed') then raise exception 'Invalid customer action'; end if;
  update public.vendor_enquiries
  set customer_confirmation = next_confirmation, updated_at = now()
  where id = target_enquiry_id and customer_id = auth.uid()
  returning id into updated_id;
  if updated_id is null then raise exception 'Enquiry not found'; end if;
  return updated_id;
end;
$$;

grant execute on function public.list_my_enquiries() to authenticated;
grant execute on function public.update_customer_enquiry_confirmation(uuid,text) to authenticated;

commit;
