begin;

-- Root cause of the persistent claim_vendor_workspace 400
-- ---------------------------------------------------------
-- 20260720101000_enable_marketplace_rls.sql added a BEFORE UPDATE trigger
-- on public.vendors, private.protect_vendor_privileged_fields(), that
-- raises for any non-admin session touching profile_id / is_verified /
-- is_featured / subscription_status -- a correct protection against a
-- vendor updating those columns directly through PostgREST.
--
-- 20260725180000_fix_vendor_approval_workflow.sql (and later revisions)
-- added public.claim_vendor_workspace(), a SECURITY DEFINER RPC whose
-- entire purpose is to let a newly authenticated, non-admin vendor link
-- their profile_id onto the vendor workspace an admin already approved
-- with profile_id left null, and to set is_verified from that
-- application's status. SECURITY DEFINER changes whose *privileges* run
-- the statement, but it does not change what auth.uid() returns inside a
-- trigger fired by that statement -- auth.uid() still resolves to the
-- calling vendor, not the function owner. So the protection trigger fires
-- on claim_vendor_workspace()'s own UPDATE and blocks it with "Only
-- administrators may update protected vendor fields", confirmed directly:
--   set_config('request.jwt.claims', <a real vendor's claims>, true);
--   set local role authenticated;
--   select public.claim_vendor_workspace();
--   -> ERROR P0001: Only administrators may update protected vendor fields
--
-- This is what PostgREST reports as the recurring 400 on
-- /rest/v1/rpc/claim_vendor_workspace.
--
-- Fix: give claim_vendor_workspace() a narrow, transaction-local bypass
-- flag that the trigger trusts. The flag can only ever be set from inside
-- this SECURITY DEFINER function -- PostgREST only exposes callable
-- functions, never raw SQL, so no client can set it directly -- and
-- claim_vendor_workspace()'s own UPDATE only ever touches profile_id and
-- is_verified, matching exactly what the trigger already protects. Every
-- other write path (a direct PostgREST PATCH to /vendors, or any other
-- function) is unaffected and still blocked for non-admins.

create or replace function private.protect_vendor_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not (select private.is_admin())
     and coalesce(current_setting('royallagn.claiming_vendor_workspace', true), '') <> 'on'
     and (
       new.profile_id is distinct from old.profile_id
       or new.id is distinct from old.id
       or new.is_verified is distinct from old.is_verified
       or new.is_featured is distinct from old.is_featured
       or new.subscription_status is distinct from old.subscription_status
     ) then
    raise exception 'Only administrators may update protected vendor fields';
  end if;

  return new;
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

  -- Scoped, transaction-local only -- resets automatically at commit and
  -- is invisible to every other statement in this or any other session.
  perform set_config('royallagn.claiming_vendor_workspace', 'on', true);

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
