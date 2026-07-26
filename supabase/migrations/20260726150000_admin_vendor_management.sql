begin;

alter table public.vendors
  add column if not exists management_status text not null default 'active'
    check (management_status in ('active', 'suspended', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists suspended_at timestamptz;

create index if not exists vendors_management_status_idx
  on public.vendors(management_status, updated_at desc);

create table if not exists public.admin_vendor_activity (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete set null,
  application_id uuid references public.vendor_applications(id) on delete set null,
  administrator_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_vendor_activity_vendor_idx
  on public.admin_vendor_activity(vendor_id, created_at desc);
create index if not exists admin_vendor_activity_application_idx
  on public.admin_vendor_activity(application_id, created_at desc);

alter table public.admin_vendor_activity enable row level security;
grant select on public.admin_vendor_activity to authenticated;
create policy "admin_vendor_activity_admin_read"
on public.admin_vendor_activity for select to authenticated
using (private.is_admin());

create or replace function public.admin_manage_vendor(
  target_vendor_id uuid,
  requested_action text
) returns public.vendors
language plpgsql security definer set search_path = ''
as $$
declare
  result public.vendors;
  normalized_action text := lower(btrim(requested_action));
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.vendors v set
    management_status = case normalized_action
      when 'suspend' then 'suspended'
      when 'activate' then 'active'
      when 'archive' then 'archived'
      when 'soft_delete' then 'archived'
      when 'restore' then 'active'
      else v.management_status
    end,
    is_verified = case normalized_action
      when 'verify' then true
      when 'unverify' then false
      else v.is_verified
    end,
    suspended_at = case
      when normalized_action = 'suspend' then now()
      when normalized_action in ('activate', 'restore') then null
      else v.suspended_at
    end,
    archived_at = case
      when normalized_action in ('archive', 'soft_delete') then now()
      when normalized_action = 'restore' then null
      else v.archived_at
    end,
    updated_at = now()
  where v.id = target_vendor_id
    and normalized_action in (
      'suspend', 'activate', 'archive', 'soft_delete',
      'restore', 'verify', 'unverify'
    )
  returning * into result;

  if result.id is null then
    raise exception 'Vendor or action not found' using errcode = 'P0002';
  end if;

  if normalized_action in ('suspend', 'archive', 'soft_delete') then
    update public.profiles set is_active = false, updated_at = now()
    where id = result.profile_id;
  elsif normalized_action in ('activate', 'restore') then
    update public.profiles set is_active = true, updated_at = now()
    where id = result.profile_id;
  end if;

  insert into public.admin_vendor_activity(
    vendor_id, application_id, administrator_id, action
  ) values (
    result.id, result.application_id, auth.uid(), normalized_action
  );
  return result;
end
$$;

create or replace function public.admin_update_vendor(
  target_vendor_id uuid,
  changes jsonb
) returns public.vendors
language plpgsql security definer set search_path = ''
as $$
declare result public.vendors;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.vendors set
    business_name = coalesce(nullif(btrim(changes->>'business_name'), ''), business_name),
    owner_name = coalesce(nullif(btrim(changes->>'owner_name'), ''), owner_name),
    description = case when changes ? 'description' then nullif(btrim(changes->>'description'), '') else description end,
    contact_email = case when changes ? 'contact_email' then nullif(btrim(changes->>'contact_email'), '') else contact_email end,
    contact_phone = case when changes ? 'contact_phone' then nullif(btrim(changes->>'contact_phone'), '') else contact_phone end,
    website = case when changes ? 'website' then nullif(btrim(changes->>'website'), '') else website end,
    instagram = case when changes ? 'instagram' then nullif(btrim(changes->>'instagram'), '') else instagram end,
    facebook = case when changes ? 'facebook' then nullif(btrim(changes->>'facebook'), '') else facebook end,
    address = case when changes ? 'address' then nullif(btrim(changes->>'address'), '') else address end,
    city = coalesce(nullif(btrim(changes->>'city'), ''), city),
    state = coalesce(nullif(btrim(changes->>'state'), ''), state),
    updated_at = now()
  where id = target_vendor_id returning * into result;
  if result.id is null then raise exception 'Vendor not found' using errcode = 'P0002'; end if;
  insert into public.admin_vendor_activity(
    vendor_id, application_id, administrator_id, action, details
  ) values (result.id, result.application_id, auth.uid(), 'edited', changes);
  return result;
end
$$;

revoke all on function public.admin_manage_vendor(uuid, text) from public, anon;
revoke all on function public.admin_update_vendor(uuid, jsonb) from public, anon;
grant execute on function public.admin_manage_vendor(uuid, text) to authenticated;
grant execute on function public.admin_update_vendor(uuid, jsonb) to authenticated;

create or replace function public.admin_review_vendor_application(
  target_application_id uuid,
  decision public.vendor_application_status,
  reason text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare result_vendor_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  result_vendor_id := public.review_vendor_application(
    target_application_id, decision, reason
  );
  insert into public.admin_vendor_activity(
    vendor_id, application_id, administrator_id, action, details
  ) values (
    result_vendor_id, target_application_id, auth.uid(),
    decision::text,
    case when reason is null then '{}'::jsonb else jsonb_build_object('reason', reason) end
  );
  return result_vendor_id;
end
$$;

revoke all on function public.admin_review_vendor_application(
  uuid, public.vendor_application_status, text
) from public, anon;
grant execute on function public.admin_review_vendor_application(
  uuid, public.vendor_application_status, text
) to authenticated;

create or replace function public.admin_list_vendor_records(
  search_text text default null,
  status_filter text default null,
  verification_filter text default null,
  plan_filter text default null,
  category_filter uuid default null,
  city_filter text default null,
  state_filter text default null,
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
      coalesce(v.state, a.state) state,
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
    and (city_filter is null or lower(r.city) = lower(city_filter))
    and (state_filter is null or lower(r.state) = lower(state_filter))
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

revoke all on function public.admin_list_vendor_records(
  text, text, text, text, uuid, text, text, text, integer, integer
) from public, anon;
grant execute on function public.admin_list_vendor_records(
  text, text, text, text, uuid, text, text, text, integer, integer
) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'admin_vendor_activity'
     ) then
    alter publication supabase_realtime add table public.admin_vendor_activity;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'vendor_applications'
     ) then
    alter publication supabase_realtime add table public.vendor_applications;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'subscriptions'
     ) then
    alter publication supabase_realtime add table public.subscriptions;
  end if;
end
$$;

commit;
