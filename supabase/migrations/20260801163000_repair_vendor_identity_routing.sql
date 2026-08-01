begin;

-- Older approved workspaces can be linked to an auth profile that still has
-- the customer role. The verified Vendor linkage is admin-controlled, so it
-- is safe to repair those identities while never modifying admin accounts.
update public.profiles profile
set role = 'vendor',
    is_active = true
from public.vendors vendor
where vendor.profile_id = profile.id
  and vendor.is_verified = true
  and profile.role = 'public_user';

create or replace function public.claim_vendor_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(auth.jwt() ->> 'email');
  current_role text;
  application public.vendor_applications%rowtype;
  result_vendor_id uuid;
begin
  if current_user_id is null or current_email is null or current_email = '' then
    raise exception 'An authenticated email is required';
  end if;

  select role::text
  into current_role
  from public.profiles
  where id = current_user_id
  for update;

  if current_role in ('admin', 'super_admin') then
    raise exception 'Administrative accounts cannot claim Vendor workspaces';
  end if;

  select *
  into application
  from public.vendor_applications
  where lower(email) = current_email
    and status in ('pending', 'approved')
    and (profile_id is null or profile_id = current_user_id)
  order by submitted_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No matching Vendor application was found';
  end if;

  insert into public.profiles (id, email, full_name, phone, role, is_active)
  values (
    current_user_id,
    current_email,
    application.full_name,
    application.phone,
    'vendor',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    role = 'vendor',
    is_active = true;

  update public.vendor_applications
  set profile_id = current_user_id
  where id = application.id
    and (profile_id is null or profile_id = current_user_id);

  select id
  into result_vendor_id
  from public.vendors
  where profile_id = current_user_id
     or application_id = application.id
  limit 1
  for update;

  if result_vendor_id is null then
    insert into public.vendors (
      profile_id, application_id, business_name, owner_name, description,
      category_id, address, city, state, country, pincode, experience,
      instagram, facebook, website, logo_url, is_verified, is_featured,
      subscription_status
    ) values (
      current_user_id, application.id, application.business_name,
      application.full_name, application.description, application.category_id,
      application.address, application.city, application.state, application.country,
      application.pincode, application.experience, application.instagram,
      application.facebook, application.website, application.logo_url,
      application.status = 'approved', false, 'pending'
    )
    returning id into result_vendor_id;
  else
    update public.vendors
    set profile_id = current_user_id,
        is_verified = application.status = 'approved'
    where id = result_vendor_id;
  end if;

  return result_vendor_id;
end;
$$;

revoke all on function public.claim_vendor_workspace() from public, anon;
grant execute on function public.claim_vendor_workspace() to authenticated;

commit;
