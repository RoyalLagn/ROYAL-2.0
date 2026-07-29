begin;

alter table public.vendor_applications
  add column if not exists area text,
  add column if not exists cover_image_url text,
  add column if not exists business_documents jsonb not null default '[]'::jsonb,
  add column if not exists terms_accepted_at timestamptz;

alter table public.vendor_applications
  alter column logo_url drop not null;

alter table public.vendor_applications
  drop constraint if exists vendor_applications_required_text;

alter table public.vendor_applications
  add constraint vendor_applications_required_text check (
    btrim(full_name) <> '' and btrim(phone) <> '' and btrim(business_name) <> ''
    and btrim(description) <> '' and btrim(address) <> '' and btrim(city) <> ''
    and btrim(state) <> '' and btrim(country) <> '' and btrim(pincode) <> ''
  );

-- Add the constraint without scanning legacy rows first. This immediately
-- protects new inserts/updates while allowing existing applications to be
-- migrated safely below.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vendor_applications'::regclass
      and conname = 'vendor_applications_terms_accepted'
  ) then
    alter table public.vendor_applications
      add constraint vendor_applications_terms_accepted
      check (terms_accepted_at is not null) not valid;
  end if;
end;
$$;

-- Applications submitted before this column existed passed the legacy
-- submission declaration. Preserve their original submission timestamp as
-- the acceptance timestamp instead of discarding or recreating those rows.
update public.vendor_applications
set terms_accepted_at = submitted_at
where terms_accepted_at is null;

alter table public.vendor_applications
  validate constraint vendor_applications_terms_accepted;

create index if not exists vendor_applications_email_pending_idx
  on public.vendor_applications (lower(email))
  where status = 'pending';

-- Public applications deliberately have no auth/profile row yet. Keep the
-- existing admin RPC contract, but allow approval to create the unclaimed
-- vendor workspace that claim_vendor_workspace() links after password setup.
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
begin
  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  if decision = 'rejected' and nullif(btrim(reason), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into application
  from public.vendor_applications
  where id = target_application_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending vendor application not found'; end if;

  if decision = 'approved' then
    insert into public.vendors (
      profile_id, application_id, business_name, owner_name, description,
      category_id, address, city, state, country, pincode, experience,
      instagram, facebook, website, logo_url, contact_email, contact_phone,
      is_verified
    ) values (
      application.profile_id, application.id, btrim(application.business_name),
      btrim(application.full_name), btrim(application.description),
      application.category_id, btrim(application.address), btrim(application.city),
      btrim(application.state), btrim(application.country), btrim(application.pincode),
      application.experience, nullif(btrim(application.instagram), ''),
      nullif(btrim(application.facebook), ''), nullif(btrim(application.website), ''),
      nullif(btrim(application.logo_url), ''), lower(btrim(application.email)),
      btrim(application.phone), true
    )
    on conflict (application_id) do update set
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
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      is_verified = true
    returning id into result_vendor_id;
  end if;

  update public.vendor_applications
  set status = decision,
      reviewed_at = clock_timestamp(),
      reviewed_by = auth.uid(),
      rejection_reason = case when decision = 'rejected' then btrim(reason) end
  where id = application.id;

  update public.admin_notifications set is_read = true
  where application_id = application.id;

  return result_vendor_id;
end;
$$;

commit;
