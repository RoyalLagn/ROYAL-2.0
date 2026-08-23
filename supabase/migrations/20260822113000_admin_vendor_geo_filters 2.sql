begin;

create or replace function public.admin_vendor_location_facets()
returns table (
  state_id uuid,
  state_name text,
  district_id uuid,
  district_name text,
  taluka_id uuid,
  taluka_name text
)
language sql stable security definer set search_path = ''
as $$
  select distinct
    state.id,
    state.name,
    district.id,
    district.name,
    taluka.id,
    taluka.name
  from public.vendors vendor
  join public.geo_states state on state.id = vendor.geo_state_id
  left join public.geo_districts district on district.id = vendor.geo_district_id
  left join public.geo_talukas taluka on taluka.id = vendor.geo_taluka_id
  where private.is_admin()
    and state.is_active
    and (district.id is null or district.is_active)
    and (taluka.id is null or taluka.is_active)
  order by state.name, district.name nulls last, taluka.name nulls last
$$;

revoke all on function public.admin_vendor_location_facets() from public, anon;
grant execute on function public.admin_vendor_location_facets() to authenticated;

create or replace function public.admin_list_vendor_records_v2(
  search_text text default null,
  status_filter text default null,
  verification_filter text default null,
  plan_filter text default null,
  category_filter uuid default null,
  state_filter uuid default null,
  district_filter uuid default null,
  taluka_filter uuid default null,
  sort_by text default 'newest',
  page_size integer default 20,
  page_offset integer default 0
) returns table (
  record_id uuid,
  vendor_id uuid,
  application_id uuid,
  profile_id uuid,
  business_name text,
  owner_name text,
  email text,
  phone text,
  logo_url text,
  category_id uuid,
  category_name text,
  city text,
  state text,
  is_verified boolean,
  application_status text,
  plan_name text,
  subscription_status text,
  management_status text,
  registered_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql stable security definer set search_path = ''
as $$
  with records as (
    select
      coalesce(v.id, a.id) record_id,
      v.id vendor_id,
      a.id application_id,
      coalesce(v.profile_id, a.profile_id) profile_id,
      coalesce(v.business_name, a.business_name) business_name,
      coalesce(v.owner_name, a.full_name) owner_name,
      coalesce(v.contact_email, a.email, p.email) email,
      coalesce(v.contact_phone, a.phone, p.phone) phone,
      coalesce(v.logo_url, a.logo_url) logo_url,
      coalesce(v.category_id, a.category_id) category_id,
      c.name category_name,
      coalesce(v.city, a.city) city,
      coalesce(geo_state.name, v.state, a.state) state,
      v.geo_state_id state_id,
      v.geo_district_id district_id,
      v.geo_taluka_id taluka_id,
      coalesce(v.is_verified, false) is_verified,
      coalesce(a.status::text, case when v.is_verified then 'approved' else 'pending' end) application_status,
      coalesce(s.plan_name, 'Free') plan_name,
      coalesce(s.status::text, v.subscription_status::text, 'pending') subscription_status,
      coalesce(v.management_status, 'active') management_status,
      coalesce(v.created_at, a.submitted_at) registered_at,
      greatest(coalesce(v.updated_at, '-infinity'), coalesce(a.reviewed_at, a.submitted_at)) updated_at
    from public.vendor_applications a
    full join public.vendors v on v.application_id = a.id
    left join public.profiles p on p.id = coalesce(v.profile_id, a.profile_id)
    left join public.categories c on c.id = coalesce(v.category_id, a.category_id)
    left join public.geo_states geo_state on geo_state.id = v.geo_state_id
    left join lateral (
      select sub.plan_name, sub.status
      from public.subscriptions sub
      where sub.vendor_id = v.id
      order by sub.created_at desc limit 1
    ) s on true
  ), filtered as (
    select *
    from records r
    where private.is_admin()
      and (
        nullif(btrim(search_text), '') is null
        or r.business_name ilike '%' || btrim(search_text) || '%'
        or r.owner_name ilike '%' || btrim(search_text) || '%'
        or r.email ilike '%' || btrim(search_text) || '%'
        or r.phone ilike '%' || btrim(search_text) || '%'
        or r.category_name ilike '%' || btrim(search_text) || '%'
        or r.city ilike '%' || btrim(search_text) || '%'
        or r.state ilike '%' || btrim(search_text) || '%'
        or r.record_id::text = btrim(search_text)
        or r.vendor_id::text = btrim(search_text)
      )
      and (
        status_filter is null or status_filter = 'all'
        or (status_filter in ('approved', 'pending', 'rejected') and r.application_status = status_filter)
        or status_filter = r.management_status
      )
      and (
        verification_filter is null or verification_filter = 'all'
        or (verification_filter = 'verified' and r.is_verified)
        or (verification_filter = 'unverified' and not r.is_verified)
      )
      and (
        plan_filter is null or plan_filter = 'all'
        or (plan_filter = 'premium' and lower(r.plan_name) <> 'free')
        or (plan_filter = 'free' and lower(r.plan_name) = 'free')
      )
      and (category_filter is null or r.category_id = category_filter)
      and (state_filter is null or r.state_id = state_filter)
      and (district_filter is null or r.district_id = district_filter)
      and (taluka_filter is null or r.taluka_id = taluka_filter)
  )
  select
    f.record_id, f.vendor_id, f.application_id, f.profile_id,
    f.business_name, f.owner_name, f.email, f.phone, f.logo_url,
    f.category_id, f.category_name, f.city, f.state, f.is_verified,
    f.application_status, f.plan_name, f.subscription_status,
    f.management_status, f.registered_at, f.updated_at,
    count(*) over () total_count
  from filtered f
  order by
    case when sort_by = 'oldest' then f.registered_at end asc,
    case when sort_by = 'business_az' then lower(f.business_name) end asc,
    case when sort_by = 'business_za' then lower(f.business_name) end desc,
    case when sort_by = 'category' then lower(f.category_name) end asc,
    case when sort_by = 'recently_updated' then f.updated_at end desc,
    case when sort_by in ('newest', 'registration_date') then f.registered_at end desc,
    f.record_id
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0)
$$;

revoke all on function public.admin_list_vendor_records_v2(
  text, text, text, text, uuid, uuid, uuid, uuid, text, integer, integer
) from public, anon;
grant execute on function public.admin_list_vendor_records_v2(
  text, text, text, text, uuid, uuid, uuid, uuid, text, integer, integer
) to authenticated;

commit;
