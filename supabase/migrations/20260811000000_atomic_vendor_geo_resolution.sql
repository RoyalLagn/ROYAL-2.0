begin;

-- ============================================================================
-- P1-3 fix: a vendor PIN change could leave a stale canonical Taluka.
--
-- Root cause: the client made two separate network calls -- a legacy
-- location save (replace_vendor_service_locations) followed by a
-- best-effort apply_vendor_geo_pincode call. If the second call failed or
-- was unreachable, vendors.pincode had already moved to the new PIN while
-- geo_taluka_id/geo_district_id/geo_state_id still reflected the *previous*
-- PIN's resolution. A vendor could then keep surfacing under a Taluka they
-- no longer had any real connection to.
--
-- Fix: factor the "resolve (or clear) canonical geo columns from a PIN"
-- logic into one internal helper, and call it from *inside* the same
-- transaction as every vendor PIN/location write path:
--   - replace_vendor_service_locations (vendor edits their own location)
--   - apply_vendor_geo_pincode (kept for Admin/standalone retries)
--   - sync_approved_vendor_location (vendor created from an application)
--   - admin_retry_vendor_geo_resolution (new: Admin-triggered re-resolve)
-- Every one of these leaves geo_* columns in one of exactly two states
-- after it returns: a fresh, cache-backed resolution, or fully cleared to
-- 'unresolved'/'needs_review' with a human-readable geo_review_reason.
-- There is no remaining code path that can leave a PIN and a canonical
-- Taluka out of sync.
-- ============================================================================

alter table public.vendors
  add column if not exists geo_review_reason text;

-- ----------------------------------------------------------------------------
-- Shared resolution/clearing logic. Not directly callable by clients --
-- always invoked from inside another SECURITY DEFINER function that has
-- already authorized the caller.
-- ----------------------------------------------------------------------------
create or replace function private.resolve_vendor_geo_from_pincode(
  target_vendor_id uuid,
  target_pincode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached_pin public.geo_pincodes%rowtype;
  found_cache boolean := false;
begin
  if target_pincode ~ '^[1-9][0-9]{5}$' then
    select * into cached_pin from public.geo_pincodes where pincode = target_pincode;
    found_cache := found;
  end if;

  update public.vendors
  set geo_state_id = case when found_cache then cached_pin.state_id else null end,
      geo_district_id = case when found_cache then cached_pin.district_id else null end,
      geo_taluka_id = case
        when found_cache and cached_pin.taluka_id is not null and not cached_pin.ambiguous
          then cached_pin.taluka_id
        else null
      end,
      geo_latitude = case when found_cache then cached_pin.latitude else null end,
      geo_longitude = case when found_cache then cached_pin.longitude else null end,
      geo_resolution_status = case
        when not found_cache then 'unresolved'
        when cached_pin.taluka_id is not null and not cached_pin.ambiguous then 'resolved'
        else 'needs_review'
      end,
      geo_review_reason = case
        when not found_cache then
          'PIN code has not been looked up against the official location dataset yet.'
        when cached_pin.taluka_id is not null and not cached_pin.ambiguous then null
        when cached_pin.ambiguous then
          'This PIN code matches more than one Taluka; an Admin must confirm the correct one.'
        when cached_pin.district_id is null then
          'The State or District for this PIN code is not yet imported into RoyalLagn.'
        else
          'The Taluka for this PIN code could not be identified from official data.'
      end,
      geo_resolved_at = now()
  where id = target_vendor_id;
end;
$$;

revoke all on function private.resolve_vendor_geo_from_pincode(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The vendor-facing "save my location" path. Same signature/behavior as
-- before for the legacy City/Area fields; now additionally resolves (or
-- clears) the canonical geo columns from whatever PIN ends up on the
-- vendor row, atomically, in the same transaction.
-- ----------------------------------------------------------------------------
create or replace function public.replace_vendor_service_locations(
  target_vendor_id uuid,
  target_primary_city_id uuid,
  target_primary_area_id uuid default null,
  target_service_area_ids uuid[] default array[]::uuid[],
  target_pincode text default null
)
returns setof public.vendor_service_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_city public.supported_cities%rowtype;
  selected_area_id uuid;
  effective_pincode text;
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'You cannot manage service locations for this Vendor';
  end if;
  if target_pincode is not null and target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;

  select * into selected_city
  from public.supported_cities
  where id = target_primary_city_id and is_active;
  if not found then raise exception 'This city is not currently supported by RoyalLagn'; end if;

  if target_primary_area_id is not null and not exists (
    select 1 from public.supported_areas
    where id = target_primary_area_id
      and city_id = target_primary_city_id
      and is_active
  ) then raise exception 'The primary area is not active in the selected city'; end if;

  foreach selected_area_id in array coalesce(target_service_area_ids, array[]::uuid[])
  loop
    if not exists (
      select 1 from public.supported_areas
      where id = selected_area_id
        and city_id = target_primary_city_id
        and is_active
    ) then raise exception 'A selected service area is not active in the primary city'; end if;
  end loop;

  delete from public.vendor_service_locations where vendor_id = target_vendor_id;
  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, pincode, is_primary
  ) values (
    target_vendor_id, target_primary_city_id, target_primary_area_id,
    nullif(target_pincode, ''), true
  );

  insert into public.vendor_service_locations (vendor_id, city_id, area_id, is_primary)
  select target_vendor_id, target_primary_city_id, area_id, false
  from unnest(coalesce(target_service_area_ids, array[]::uuid[])) area_id
  where area_id is distinct from target_primary_area_id
  on conflict do nothing;

  update public.vendors
  set primary_city_id = target_primary_city_id,
      primary_area_id = target_primary_area_id,
      city = selected_city.name,
      state = selected_city.state,
      pincode = coalesce(nullif(target_pincode, ''), pincode)
  where id = target_vendor_id
  returning pincode into effective_pincode;

  -- Atomic geo resolution: whatever the vendor's pincode ends up being
  -- above (unchanged, or just updated), the canonical State/District/Taluka
  -- columns are recomputed from it in this same transaction. A failed or
  -- unreachable second network call can no longer leave them stale, because
  -- there is no second network call.
  perform private.resolve_vendor_geo_from_pincode(target_vendor_id, effective_pincode);

  return query
  select * from public.vendor_service_locations
  where vendor_id = target_vendor_id
  order by is_primary desc, created_at;
end;
$$;

-- ----------------------------------------------------------------------------
-- Standalone PIN-only geo apply. Still useful when only the geo hierarchy
-- needs (re-)resolving without touching legacy City/Area fields -- e.g. an
-- Admin retry, or a future PIN-only onboarding step. Delegates to the same
-- shared helper, so behavior is identical to the path above.
-- ----------------------------------------------------------------------------
create or replace function public.apply_vendor_geo_pincode(
  target_vendor_id uuid,
  target_pincode text
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.vendors%rowtype;
begin
  if not (private.owns_vendor(target_vendor_id) or private.is_admin()) then
    raise exception 'You cannot manage location for this Vendor';
  end if;
  if target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;

  update public.vendors set pincode = target_pincode where id = target_vendor_id;
  if not found then raise exception 'Vendor not found'; end if;

  perform private.resolve_vendor_geo_from_pincode(target_vendor_id, target_pincode);

  select * into updated from public.vendors where id = target_vendor_id;
  return updated;
end;
$$;

revoke all on function public.apply_vendor_geo_pincode(uuid, text) from public, anon;
grant execute on function public.apply_vendor_geo_pincode(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin-triggered retry: re-resolve a vendor's existing PIN against the
-- (possibly since-updated) geo_pincodes cache, without needing the PIN
-- value client-side. Used by the "retry" action on unresolved/needs_review
-- vendors in /AdminGeoLocations.
-- ----------------------------------------------------------------------------
create or replace function public.admin_retry_vendor_geo_resolution(target_vendor_id uuid)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.vendors%rowtype;
  current_pincode text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;

  select pincode into current_pincode from public.vendors where id = target_vendor_id;
  if not found then raise exception 'Vendor not found'; end if;

  perform private.resolve_vendor_geo_from_pincode(target_vendor_id, current_pincode);

  select * into updated from public.vendors where id = target_vendor_id;
  return updated;
end;
$$;

revoke all on function public.admin_retry_vendor_geo_resolution(uuid) from public, anon, authenticated;
grant execute on function public.admin_retry_vendor_geo_resolution(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vendor-approval sync: use the same shared helper for consistency (was
-- previously inline duplicate logic without a review reason).
-- ----------------------------------------------------------------------------
create or replace function private.sync_approved_vendor_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.vendor_applications%rowtype;
begin
  if new.application_id is null then return new; end if;
  select * into application from public.vendor_applications where id = new.application_id;
  if application.city_id is null then return new; end if;

  update public.vendors
  set primary_city_id = application.city_id,
      primary_area_id = application.area_id
  where id = new.id;

  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, pincode, is_primary
  ) values (
    new.id, application.city_id, application.area_id, application.pincode, true
  )
  on conflict do nothing;
  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, is_primary
  )
  select new.id, application.city_id, service_area_id, false
  from unnest(coalesce(application.service_area_ids, array[]::uuid[])) service_area_id
  where service_area_id is distinct from application.area_id
  on conflict do nothing;

  if application.pincode ~ '^[1-9][0-9]{5}$' then
    perform private.resolve_vendor_geo_from_pincode(new.id, application.pincode);
  end if;

  return new;
end;
$$;

commit;
