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

  update public.vendor_applications
  set status = decision,
      reviewed_at = review_time,
      reviewed_by = auth.uid(),
      rejection_reason = case
        when decision = 'rejected' then btrim(reason)
        else null
      end
  where id = application.id;

  if decision = 'approved' then
    if application.profile_id is null then
      raise exception 'Vendor application is not linked to an authenticated profile';
    end if;

    update public.profiles
    set role = 'vendor',
        is_active = true,
        email = lower(btrim(application.email)),
        full_name = btrim(application.full_name),
        phone = btrim(application.phone)
    where id = application.profile_id;

    if not found then
      raise exception 'Vendor profile not found';
    end if;

    select id
    into result_vendor_id
    from public.vendors
    where application_id = application.id
       or profile_id = application.profile_id
    order by (application_id = application.id) desc
    limit 1
    for update;

    if result_vendor_id is null then
      insert into public.vendors (
        profile_id,
        application_id,
        business_name,
        owner_name,
        description,
        category_id,
        address,
        city,
        state,
        country,
        pincode,
        experience,
        instagram,
        facebook,
        website,
        logo_url,
        contact_email,
        contact_phone,
        is_verified
      ) values (
        application.profile_id,
        application.id,
        btrim(application.business_name),
        btrim(application.full_name),
        btrim(application.description),
        application.category_id,
        btrim(application.address),
        btrim(application.city),
        btrim(application.state),
        btrim(application.country),
        btrim(application.pincode),
        application.experience,
        nullif(btrim(application.instagram), ''),
        nullif(btrim(application.facebook), ''),
        nullif(btrim(application.website), ''),
        btrim(application.logo_url),
        lower(btrim(application.email)),
        btrim(application.phone),
        true
      )
      returning id into result_vendor_id;
    else
      update public.vendors
      set profile_id = application.profile_id,
          application_id = application.id,
          business_name = btrim(application.business_name),
          owner_name = btrim(application.full_name),
          description = btrim(application.description),
          category_id = application.category_id,
          address = btrim(application.address),
          city = btrim(application.city),
          state = btrim(application.state),
          country = btrim(application.country),
          pincode = btrim(application.pincode),
          experience = application.experience,
          instagram = nullif(btrim(application.instagram), ''),
          facebook = nullif(btrim(application.facebook), ''),
          website = nullif(btrim(application.website), ''),
          logo_url = btrim(application.logo_url),
          contact_email = lower(btrim(application.email)),
          contact_phone = btrim(application.phone),
          is_verified = true
      where id = result_vendor_id;
    end if;
  end if;

  update public.admin_notifications
  set is_read = true
  where application_id = application.id;

  return result_vendor_id;
end;
$$;

commit;
