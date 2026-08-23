-- Vendor Management previously read legacy public.subscriptions while the
-- live subscription system writes public.vendor_subscriptions. Use the latter
-- for both the Premium card and the list it opens.
drop function if exists public.admin_list_vendor_records_v2(text, text, text, text, uuid, uuid, uuid, uuid, text, integer, integer, boolean);

create function public.admin_list_vendor_records_v2(search_text text default null, status_filter text default null, verification_filter text default null, plan_filter text default null, category_filter uuid default null, state_filter uuid default null, district_filter uuid default null, taluka_filter uuid default null, sort_by text default 'newest', page_size integer default 20, page_offset integer default 0, updated_today_filter boolean default false)
returns table (record_id uuid, vendor_id uuid, application_id uuid, profile_id uuid, business_name text, owner_name text, email text, phone text, logo_url text, category_id uuid, category_name text, city text, state text, is_verified boolean, application_status text, plan_name text, subscription_status text, management_status text, registered_at timestamptz, updated_at timestamptz, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with records as (
    select coalesce(v.id,a.id) record_id, v.id vendor_id, a.id application_id, coalesce(v.profile_id,a.profile_id) profile_id,
      coalesce(v.business_name,a.business_name) business_name, coalesce(v.owner_name,a.full_name) owner_name, coalesce(v.contact_email,a.email,p.email) email, coalesce(v.contact_phone,a.phone,p.phone) phone, coalesce(v.logo_url,a.logo_url) logo_url,
      coalesce(v.category_id,a.category_id) category_id, c.name category_name, coalesce(v.city,a.city) city, coalesce(gs.name,v.state,a.state) state, v.geo_state_id state_id, v.geo_district_id district_id, v.geo_taluka_id taluka_id,
      coalesce(v.is_verified,false) is_verified, coalesce(a.status::text,case when v.is_verified then 'approved' else 'pending' end) application_status,
      coalesce(plan.name,'Free') plan_name, coalesce(lower(plan.slug),'free') plan_slug, coalesce(current_subscription.status::text,v.subscription_status::text,'pending') subscription_status,
      coalesce(v.management_status,'active') management_status, coalesce(v.created_at,a.submitted_at) registered_at, greatest(coalesce(v.updated_at,'-infinity'),coalesce(a.reviewed_at,a.submitted_at)) updated_at
    from public.vendor_applications a full join public.vendors v on v.application_id=a.id
    left join public.profiles p on p.id=coalesce(v.profile_id,a.profile_id) left join public.categories c on c.id=coalesce(v.category_id,a.category_id) left join public.geo_states gs on gs.id=v.geo_state_id
    left join lateral (select candidate.* from public.vendor_subscriptions candidate where candidate.vendor_id=v.id order by case when candidate.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended') then 0 else 1 end, candidate.updated_at desc limit 1) current_subscription on true
    left join public.subscription_plans plan on plan.id=current_subscription.plan_id
  ), filtered as (
    select * from records r where private.is_admin()
      and (nullif(btrim(search_text),'') is null or r.business_name ilike '%'||btrim(search_text)||'%' or r.owner_name ilike '%'||btrim(search_text)||'%' or r.email ilike '%'||btrim(search_text)||'%' or r.phone ilike '%'||btrim(search_text)||'%' or r.category_name ilike '%'||btrim(search_text)||'%' or r.city ilike '%'||btrim(search_text)||'%' or r.state ilike '%'||btrim(search_text)||'%' or r.record_id::text=btrim(search_text) or r.vendor_id::text=btrim(search_text))
      and (status_filter is null or status_filter='all' or (status_filter in ('approved','pending','rejected') and r.application_status=status_filter) or status_filter=r.management_status)
      and (verification_filter is null or verification_filter='all' or (verification_filter='verified' and r.is_verified) or (verification_filter='unverified' and not r.is_verified))
      and (plan_filter is null or plan_filter='all' or (plan_filter='premium' and r.plan_slug <> 'free' and r.subscription_status='active') or (plan_filter='free' and r.plan_slug='free' and r.subscription_status='active'))
      and (category_filter is null or r.category_id=category_filter) and (state_filter is null or r.state_id=state_filter) and (district_filter is null or r.district_id=district_filter) and (taluka_filter is null or r.taluka_id=taluka_filter) and (not updated_today_filter or r.updated_at::date=current_date)
  ) select f.record_id,f.vendor_id,f.application_id,f.profile_id,f.business_name,f.owner_name,f.email,f.phone,f.logo_url,f.category_id,f.category_name,f.city,f.state,f.is_verified,f.application_status,f.plan_name,f.subscription_status,f.management_status,f.registered_at,f.updated_at,count(*) over() total_count from filtered f
  order by case when sort_by='oldest' then f.registered_at end asc,case when sort_by='business_az' then lower(f.business_name) end asc,case when sort_by='business_za' then lower(f.business_name) end desc,case when sort_by='category' then lower(f.category_name) end asc,case when sort_by='recently_updated' then f.updated_at end desc,case when sort_by in ('newest','registration_date') then f.registered_at end desc,f.record_id limit least(greatest(page_size,1),100) offset greatest(page_offset,0)
$$;

create or replace function public.admin_vendor_dashboard_statistics()
returns table (total bigint, approved bigint, pending bigint, rejected bigint, suspended bigint, verified bigint, premium bigint, free bigint, active_today bigint)
language sql stable security definer set search_path = '' as $$
  with records as (
    select v.id vendor_id,a.status::text application_status,coalesce(v.management_status,'active') management_status,coalesce(v.is_verified,false) is_verified,coalesce(lower(plan.slug),'free') plan_slug,coalesce(current_subscription.status::text,'pending') subscription_status,greatest(coalesce(v.updated_at,'-infinity'),coalesce(a.reviewed_at,a.submitted_at)) updated_at
    from public.vendor_applications a full join public.vendors v on v.application_id=a.id
    left join lateral (select candidate.* from public.vendor_subscriptions candidate where candidate.vendor_id=v.id order by case when candidate.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended') then 0 else 1 end,candidate.updated_at desc limit 1) current_subscription on true
    left join public.subscription_plans plan on plan.id=current_subscription.plan_id where private.is_admin()
  ) select count(*) filter(where vendor_id is not null),count(*) filter(where application_status='approved'),count(*) filter(where application_status='pending'),count(*) filter(where application_status='rejected'),count(*) filter(where management_status='suspended'),count(*) filter(where is_verified),count(*) filter(where plan_slug <> 'free' and subscription_status='active'),count(*) filter(where plan_slug='free' and subscription_status='active'),count(*) filter(where updated_at::date=current_date) from records
$$;

revoke all on function public.admin_list_vendor_records_v2(text,text,text,text,uuid,uuid,uuid,uuid,text,integer,integer,boolean), public.admin_vendor_dashboard_statistics() from public, anon;
grant execute on function public.admin_list_vendor_records_v2(text,text,text,text,uuid,uuid,uuid,uuid,text,integer,integer,boolean), public.admin_vendor_dashboard_statistics() to authenticated;
