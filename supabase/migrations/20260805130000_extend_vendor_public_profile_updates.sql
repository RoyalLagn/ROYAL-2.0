begin;

-- The vendor profile readiness checklist is being split into focused,
-- section-specific forms (Business information, About the business,
-- Location, Contact information, Logo and brand, Search tags). Several of
-- those forms need to write columns that update_vendor_public_profile()
-- did not yet support: `experience`, `awards` and `languages` already
-- exist on public.vendors (added by earlier vendor-application and public
-- -profile-content migrations) but had no vendor-facing editor. This
-- migration adds them to the same JSONB key-presence partial-update
-- pattern already used for every other column, so an "About the business"
-- save can never touch unrelated fields (business_name, contact info,
-- location, etc. stay untouched unless their own key is present in
-- `changes`).
create or replace function public.update_vendor_public_profile(changes jsonb)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result public.vendors;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(changes) is distinct from 'object' then
    raise exception 'Profile changes must be an object';
  end if;

  update public.vendors v
  set business_name = case when changes ? 'business_name' then btrim(changes->>'business_name') else v.business_name end,
      owner_name = case when changes ? 'owner_name' then btrim(changes->>'owner_name') else v.owner_name end,
      category_id = case when changes ? 'category_id' then nullif(changes->>'category_id', '')::uuid else v.category_id end,
      description = case when changes ? 'description' then btrim(changes->>'description') else v.description end,
      experience = case when changes ? 'experience' then nullif(changes->>'experience', '')::integer else v.experience end,
      awards = case
        when changes ? 'awards' then coalesce(
          array(select jsonb_array_elements_text(changes->'awards')),
          array[]::text[]
        )
        else v.awards
      end,
      languages = case
        when changes ? 'languages' then coalesce(
          array(select jsonb_array_elements_text(changes->'languages')),
          array[]::text[]
        )
        else v.languages
      end,
      contact_email = case when changes ? 'contact_email' then nullif(lower(btrim(changes->>'contact_email')), '') else v.contact_email end,
      contact_phone = case when changes ? 'contact_phone' then nullif(btrim(changes->>'contact_phone'), '') else v.contact_phone end,
      address = case when changes ? 'address' then nullif(btrim(changes->>'address'), '') else v.address end,
      city = case when changes ? 'city' then btrim(changes->>'city') else v.city end,
      state = case when changes ? 'state' then btrim(changes->>'state') else v.state end,
      website = case when changes ? 'website' then nullif(btrim(changes->>'website'), '') else v.website end,
      instagram = case when changes ? 'instagram' then nullif(btrim(changes->>'instagram'), '') else v.instagram end,
      facebook = case when changes ? 'facebook' then nullif(btrim(changes->>'facebook'), '') else v.facebook end,
      tags = case
        when changes ? 'tags' then coalesce(
          array(select jsonb_array_elements_text(changes->'tags')),
          array[]::text[]
        )
        else v.tags
      end,
      logo_url = case when changes ? 'logo_url' then nullif(btrim(changes->>'logo_url'), '') else v.logo_url end,
      business_hours = case when changes ? 'business_hours' then changes->'business_hours' else v.business_hours end
  where v.profile_id = current_user_id
    and exists (
      select 1 from public.profiles p
      where p.id = current_user_id and p.is_active
    )
  returning v.* into result;

  if result.id is null then
    raise exception 'Active Vendor profile not found';
  end if;
  if btrim(result.business_name) = '' or btrim(result.owner_name) = '' then
    raise exception 'Business name and owner name are required';
  end if;

  return result;
end;
$$;

revoke all on function public.update_vendor_public_profile(jsonb) from public, anon;
grant execute on function public.update_vendor_public_profile(jsonb) to authenticated;

commit;
