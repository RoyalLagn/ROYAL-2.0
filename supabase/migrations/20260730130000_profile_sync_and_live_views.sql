begin;

create or replace function private.sync_vendor_owner_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set full_name = btrim(new.owner_name)
  where id = new.profile_id
    and role = 'vendor'
    and full_name is distinct from btrim(new.owner_name);
  return new;
end;
$$;

drop trigger if exists vendors_sync_owner_identity on public.vendors;
create trigger vendors_sync_owner_identity
after insert or update of owner_name, profile_id on public.vendors
for each row execute function private.sync_vendor_owner_identity();

update public.profiles p
set full_name = btrim(v.owner_name)
from public.vendors v
where v.profile_id = p.id
  and p.role = 'vendor'
  and p.full_name is distinct from btrim(v.owner_name);

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
      logo_url = case when changes ? 'logo_url' then nullif(btrim(changes->>'logo_url'), '') else v.logo_url end
  where v.profile_id = current_user_id
    and exists (
      select 1
      from public.profiles p
      where p.id = current_user_id
        and p.role = 'vendor'
        and p.is_active
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

create or replace function public.record_vendor_profile_view(target_vendor_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count bigint;
begin
  update public.vendors v
  set profile_views = v.profile_views + 1
  where v.id = target_vendor_id
    and v.is_verified
    and exists (
      select 1
      from public.profiles p
      where p.id = v.profile_id and p.is_active
    )
    and (auth.uid() is null or v.profile_id <> auth.uid())
  returning v.profile_views into next_count;

  return next_count;
end;
$$;

revoke all on function public.record_vendor_profile_view(uuid) from public;
grant execute on function public.record_vendor_profile_view(uuid) to anon, authenticated;

commit;
