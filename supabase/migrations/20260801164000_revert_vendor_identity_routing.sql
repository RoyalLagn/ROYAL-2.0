begin;

-- Restore the Vendor workspace claim behavior that was active before the
-- 20260801163000 authentication-routing change. Existing profile roles are
-- intentionally not bulk-demoted because doing so could corrupt legitimate
-- Vendor accounts that have since used the application.
create or replace function public.claim_vendor_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(auth.jwt() ->> 'email');
  application public.vendor_applications%rowtype;
  result_vendor_id uuid;
begin
  if current_user_id is null or current_email is null or current_email = '' then
    raise exception 'An authenticated email is required';
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
    full_name = excluded.full_name,
    phone = excluded.phone;

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
