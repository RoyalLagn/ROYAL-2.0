begin;

create or replace function public.admin_list_contact_enquiries_v3(
  search_text text default null,
  category_filter uuid default null,
  date_filter date default null,
  period_filter text default 'all',
  page_size integer default 15,
  page_offset integer default 0
) returns table (
  id uuid, vendor_id uuid, customer_id uuid, customer_name text,
  customer_email text, customer_phone text, customer_profile_image text,
  event_date date, event_type text, package_id uuid, package_name text,
  message text, status text, reference_code text, enquiry_channel text,
  source_type text, customer_confirmation text, vendor_notes text,
  follow_up_date date, created_at timestamptz, updated_at timestamptz,
  vendor_name text, vendor_logo text, category_id uuid, category_name text,
  total_count bigint, call_count bigint, whatsapp_count bigint
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
      vendor.category_id, coalesce(category.name, 'Uncategorized') category_name
    from public.vendor_enquiries enquiry
    join public.vendors vendor on vendor.id = enquiry.vendor_id
    left join public.profiles profile on profile.id = enquiry.customer_id
    left join public.categories category on category.id = vendor.category_id
    where private.is_admin()
      and enquiry.enquiry_channel in ('call', 'whatsapp')
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
        or enquiry.customer_name ilike '%' || btrim(search_text) || '%'
        or enquiry.customer_email ilike '%' || btrim(search_text) || '%'
        or enquiry.customer_phone ilike '%' || btrim(search_text) || '%'
        or profile.full_name ilike '%' || btrim(search_text) || '%'
        or profile.email ilike '%' || btrim(search_text) || '%'
        or profile.phone ilike '%' || btrim(search_text) || '%'
        or vendor.business_name ilike '%' || btrim(search_text) || '%'
      )
  )
  select matching.*,
    count(*) over () total_count,
    count(*) filter (where matching.enquiry_channel = 'call') over () call_count,
    count(*) filter (where matching.enquiry_channel = 'whatsapp') over () whatsapp_count
  from matching
  order by matching.created_at desc, matching.id desc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0)
$$;

revoke all on function public.admin_list_contact_enquiries_v3(text, uuid, date, text, integer, integer) from public, anon;
grant execute on function public.admin_list_contact_enquiries_v3(text, uuid, date, text, integer, integer) to authenticated;

commit;
