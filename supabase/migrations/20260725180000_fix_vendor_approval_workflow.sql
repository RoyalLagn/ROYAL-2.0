begin;

create or replace function public.review_vendor_application(
  target_application_id uuid,
  decision public.vendor_application_status,
  reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.vendor_applications%rowtype;
  result_vendor_id uuid;
  review_time timestamptz := clock_timestamp();
begin
  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  if decision = 'rejected' and (reason is null or btrim(reason) = '') then
    raise exception 'A rejection reason is required';
  end if;

  select *
  into application
  from public.vendor_applications
  where id = target_application_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending vendor application not found';
  end if;

  if decision = 'approved' then
    if application.profile_id is not null then
      update public.profiles
      set role = 'vendor',
          is_active = true,
          full_name = application.full_name,
          phone = application.phone
      where id = application.profile_id;
    end if;

    insert into public.vendors (
      profile_id, application_id, business_name, owner_name, description,
      category_id, address, city, state, country, pincode, experience,
      instagram, facebook, website, logo_url, is_verified
    ) values (
      application.profile_id, application.id, application.business_name,
      application.full_name, application.description, application.category_id,
      application.address, application.city, application.state, application.country,
      application.pincode, application.experience, application.instagram,
      application.facebook, application.website, application.logo_url, true
    )
    on conflict (application_id) do update set
      profile_id = coalesce(excluded.profile_id, vendors.profile_id),
      business_name = excluded.business_name,
      owner_name = excluded.owner_name,
      description = excluded.description,
      category_id = excluded.category_id,
      address = excluded.address,
      city = excluded.city,
      state = excluded.state,
      country = excluded.country,
      pincode = excluded.pincode,
      experience = excluded.experience,
      instagram = excluded.instagram,
      facebook = excluded.facebook,
      website = excluded.website,
      logo_url = excluded.logo_url,
      is_verified = true
    returning id into result_vendor_id;
  end if;

  update public.vendor_applications
  set status = decision,
      reviewed_at = review_time,
      reviewed_by = auth.uid(),
      rejection_reason = case
        when decision = 'rejected' then btrim(reason)
        else null
      end
  where id = target_application_id;

  update public.admin_notifications
  set is_read = true
  where application_id = target_application_id;

  return result_vendor_id;
end;
$$;

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
