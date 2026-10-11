begin;

-- 1. Ensure status check constraint includes all admin-managed statuses as well as legacy statuses
alter table public.vendor_enquiries
  drop constraint if exists vendor_enquiries_status_check;

alter table public.vendor_enquiries
  add constraint vendor_enquiries_status_check check (status in (
    'new', 'in_progress', 'customer_contacted', 'vendor_contacted',
    'awaiting_confirmation', 'confirmed', 'closed', 'cancelled', 'booked',
    'contacted', 'in_discussion', 'quotation_sent', 'follow_up',
    'not_interested', 'invalid_lead', 'no_response'
  ));

-- 2. Drop vendor notification trigger so vendors are never notified of customer pre-booking enquiries
drop trigger if exists vendor_enquiries_notify_vendor on public.vendor_enquiries;

create or replace function private.notify_vendor_about_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Pre-booking customer enquiries are now centrally managed by RoyalLagn Admin.
  -- Vendors must NOT receive pre-booking enquiry notifications or customer details.
  return new;
end;
$$;

-- 3. Update customer notification trigger for admin status updates
create or replace function private.notify_customer_about_enquiry_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_name text;
begin
  if new.customer_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  select business_name into v_vendor_name from public.vendors where id = new.vendor_id;

  insert into public.customer_notifications (
    customer_id, type, title, message, target_path, metadata
  )
  values (
    new.customer_id,
    'enquiry_status',
    'Enquiry status updated',
    'RoyalLagn team updated your enquiry ' || new.reference_code || ' (' || coalesce(v_vendor_name, 'Vendor') || ') to ' || replace(initcap(new.status), '_', ' ') || '.',
    '/(tabs)/enquiry',
    jsonb_build_object(
      'enquiry_id', new.id,
      'reference_code', new.reference_code,
      'status', new.status,
      'vendor_name', v_vendor_name
    )
  );
  return new;
end;
$$;

drop trigger if exists vendor_enquiries_notify_customer_status on public.vendor_enquiries;
create trigger vendor_enquiries_notify_customer_status
after update of status on public.vendor_enquiries
for each row execute function private.notify_customer_about_enquiry_status();

-- 4. Update Row Level Security on vendor_enquiries
alter table public.vendor_enquiries enable row level security;

drop policy if exists "enquiries_vendor_admin_read" on public.vendor_enquiries;
drop policy if exists "enquiries_owner_read" on public.vendor_enquiries;
drop policy if exists "enquiries_admin_manage" on public.vendor_enquiries;
drop policy if exists "enquiries_customer_read" on public.vendor_enquiries;

-- Admin can manage all enquiries
create policy "enquiries_admin_manage" on public.vendor_enquiries
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Customers can view only their own enquiries
create policy "enquiries_customer_read" on public.vendor_enquiries
  for select
  to authenticated
  using (auth.uid() is not null and customer_id = auth.uid());

-- 5. Admin listing RPC with support for all enquiry channels, search, status, and category
drop function if exists public.admin_list_contact_enquiries_v4(text, uuid, date, text, integer, integer);
drop function if exists public.admin_list_contact_enquiries_v4(text, uuid, date, text, text, integer, integer);

create or replace function public.admin_list_contact_enquiries_v4(
  search_text text default null,
  category_filter uuid default null,
  date_filter date default null,
  period_filter text default 'all',
  status_filter text default null,
  page_size integer default 15,
  page_offset integer default 0
) returns table (
  id uuid, vendor_id uuid, customer_id uuid, customer_name text,
  customer_email text, customer_phone text, customer_profile_image text,
  event_date date, event_type text, package_id uuid, package_name text,
  message text, status text, reference_code text, enquiry_channel text,
  source_type text, customer_confirmation text, vendor_notes text,
  follow_up_date date, created_at timestamptz, updated_at timestamptz,
  vendor_name text, vendor_logo text, vendor_phone text, category_id uuid,
  category_name text,
  total_count bigint, call_count bigint, whatsapp_count bigint, form_count bigint,
  new_count bigint, in_progress_count bigint, confirmed_count bigint
)
language sql stable security definer set search_path = ''
as $$
  with matching as (
    select
      enquiry.id, enquiry.vendor_id, enquiry.customer_id,
      coalesce(nullif(enquiry.customer_name, ''), profile.full_name, 'Guest customer') customer_name,
      coalesce(enquiry.customer_email, profile.email) customer_email,
      coalesce(enquiry.customer_phone, profile.phone) customer_phone,
      profile.profile_image customer_profile_image,
      enquiry.event_date, enquiry.event_type, enquiry.package_id,
      enquiry.package_name, enquiry.message, enquiry.status::text,
      enquiry.reference_code, enquiry.enquiry_channel, enquiry.source_type,
      enquiry.customer_confirmation, enquiry.vendor_notes,
      enquiry.follow_up_date, enquiry.created_at, enquiry.updated_at,
      vendor.business_name vendor_name, vendor.logo_url vendor_logo,
      vendor.contact_phone vendor_phone, vendor.category_id,
      coalesce(category.name, 'Uncategorized') category_name
    from public.vendor_enquiries enquiry
    join public.vendors vendor on vendor.id = enquiry.vendor_id
    left join public.profiles profile on profile.id = enquiry.customer_id
    left join public.categories category on category.id = vendor.category_id
    where private.is_admin()
      and (status_filter is null or status_filter = 'all' or enquiry.status = status_filter)
      and (category_filter is null or vendor.category_id = category_filter)
      and (
        period_filter = 'all'
        or date_filter is not null and (
          period_filter = 'day' and (enquiry.created_at at time zone 'Asia/Kolkata')::date = date_filter
          or period_filter = 'month' and date_trunc('month', enquiry.created_at at time zone 'Asia/Kolkata') = date_trunc('month', date_filter::timestamp)
          or period_filter = 'year' and extract(year from enquiry.created_at at time zone 'Asia/Kolkata') = extract(year from date_filter)
        )
      )
      and (
        nullif(btrim(search_text), '') is null
        or enquiry.reference_code ilike '%' || btrim(search_text) || '%'
        or enquiry.customer_name ilike '%' || btrim(search_text) || '%'
        or enquiry.customer_email ilike '%' || btrim(search_text) || '%'
        or enquiry.customer_phone ilike '%' || btrim(search_text) || '%'
        or profile.full_name ilike '%' || btrim(search_text) || '%'
        or profile.email ilike '%' || btrim(search_text) || '%'
        or profile.phone ilike '%' || btrim(search_text) || '%'
        or vendor.business_name ilike '%' || btrim(search_text) || '%'
        or category.name ilike '%' || btrim(search_text) || '%'
      )
  )
  select matching.*,
    count(*) over () total_count,
    count(*) filter (where matching.enquiry_channel = 'call') over () call_count,
    count(*) filter (where matching.enquiry_channel = 'whatsapp') over () whatsapp_count,
    count(*) filter (where matching.enquiry_channel = 'form') over () form_count,
    count(*) filter (where matching.status in ('new', 'pending')) over () new_count,
    count(*) filter (where matching.status in ('in_progress', 'customer_contacted', 'vendor_contacted', 'in_discussion', 'quotation_sent', 'follow_up')) over () in_progress_count,
    count(*) filter (where matching.status in ('confirmed', 'awaiting_confirmation', 'booked')) over () confirmed_count
  from matching
  order by matching.created_at desc, matching.id desc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0)
$$;

revoke all on function public.admin_list_contact_enquiries_v4(text, uuid, date, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_contact_enquiries_v4(text, uuid, date, text, text, integer, integer) to authenticated;

-- 6. Dedicated Admin Status & Notes Update RPC
create or replace function public.admin_update_enquiry_status(
  target_enquiry_id uuid,
  next_status text,
  notes text default null,
  follow_up_on date default null
)
returns public.vendor_enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.vendor_enquiries%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  if next_status not in (
    'new', 'in_progress', 'customer_contacted', 'vendor_contacted',
    'awaiting_confirmation', 'confirmed', 'closed', 'cancelled', 'booked',
    'contacted', 'in_discussion', 'quotation_sent', 'follow_up',
    'not_interested', 'invalid_lead', 'no_response'
  ) then
    raise exception 'Invalid enquiry status';
  end if;

  update public.vendor_enquiries
  set status = next_status,
      vendor_notes = nullif(btrim(notes), ''),
      follow_up_date = follow_up_on,
      updated_at = now()
  where id = target_enquiry_id
  returning * into updated;

  if updated.id is null then
    raise exception 'Enquiry not found';
  end if;

  return updated;
end;
$$;

revoke all on function public.admin_update_enquiry_status(uuid, text, text, date) from public, anon;
grant execute on function public.admin_update_enquiry_status(uuid, text, text, date) to authenticated;

-- 7. Ensure list_my_enquiries protects internal notes from customers
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
    v.business_name, null::text as vendor_phone, v.logo_url
  from public.vendor_enquiries e
  join public.vendors v on v.id = e.vendor_id
  where auth.uid() is not null and e.customer_id = auth.uid()
  order by e.created_at desc;
$$;

revoke all on function public.list_my_enquiries() from public, anon;
grant execute on function public.list_my_enquiries() to authenticated;

commit;
