begin;

-- ============================================================================
-- Root-cause, whole-database fix (not a per-PIN patch): a live database
-- audit found 2 of 8 "resolved" PINs (and likely more over time) were
-- marked resolved to ONE Taluka while their own geo_pincode_localities rows
-- actually carried evidence for 2-3 DIFFERENT Talukas -- e.g. PIN 413130
-- showed "resolved -> Indapur" despite 9 of its own localities pointing to
-- Daund, Baramati, or Indapur. A vendor picking one of the "wrong" villages
-- still worked correctly (each locality is independently authoritative at
-- submit time), but the PIN-level summary was actively misleading.
--
-- Cause: refresh_geo_pincode_aggregate only ever counted TRUSTED locality
-- rows when deciding whether a PIN was ambiguous. That's correct for
-- deciding whether to trust a resolution, but wrong for deciding whether
-- one exists: an UNTRUSTED locality pointing at a different Taluka is still
-- real evidence of a conflict, and confirming even one trusted locality
-- (e.g. via admin_confirm_geo_pincode_locality) let the aggregate ignore
-- every other, still-untrusted, contradicting village under the same PIN.
--
-- Fix: ambiguous/"is this genuinely one Taluka" now looks at EVERY active
-- locality row with a known Taluka, trusted or not. "resolved" still
-- requires trusted_count > 0 (a resolution needs SOME trusted evidence) --
-- this only makes the conflict check itself see the full picture instead of
-- half of it. Re-run once immediately below for every PIN already cached,
-- so existing data self-corrects the moment this deploys, not just future
-- PINs.
-- ============================================================================
create or replace function private.refresh_geo_pincode_aggregate(target_pincode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_count integer;
  trusted_count integer;
  distinct_states integer;
  distinct_districts integer;
  distinct_talukas_trusted integer;
  distinct_talukas_any integer;
  selected_state uuid;
  selected_district uuid;
  selected_taluka uuid;
  only_locality text;
begin
  select
    count(*) filter (where is_active),
    count(*) filter (where is_active and is_trusted),
    count(distinct state_id) filter (where is_active and is_trusted and state_id is not null),
    count(distinct district_id) filter (where is_active and is_trusted and district_id is not null),
    count(distinct taluka_id) filter (where is_active and is_trusted and taluka_id is not null),
    count(distinct taluka_id) filter (where is_active and taluka_id is not null),
    (min(state_id::text) filter (where is_active and is_trusted))::uuid,
    (min(district_id::text) filter (where is_active and is_trusted))::uuid,
    (min(taluka_id::text) filter (where is_active and is_trusted))::uuid,
    min(locality_name) filter (where is_active and is_trusted)
  into total_count, trusted_count, distinct_states, distinct_districts,
       distinct_talukas_trusted, distinct_talukas_any, selected_state,
       selected_district, selected_taluka, only_locality
  from public.geo_pincode_localities
  where pincode = target_pincode;

  update public.geo_pincodes pin
  set locality_count = coalesce(total_count, 0),
      trusted_locality_count = coalesce(trusted_count, 0),
      locality_selection_required = coalesce(trusted_count, 0) > 1,
      state_id = case when distinct_states = 1 then selected_state else pin.state_id end,
      district_id = case when distinct_districts = 1 then selected_district else pin.district_id end,
      -- A single trusted Taluka is only the PIN's canonical Taluka when
      -- nothing else under the same PIN -- trusted or not -- contradicts it.
      taluka_id = case when distinct_talukas_trusted = 1 and distinct_talukas_any = 1 then selected_taluka else null end,
      area = case when trusted_count = 1 then only_locality else null end,
      office_name = case when trusted_count = 1 then only_locality else null end,
      resolution_status = case
        when trusted_count > 0 and distinct_states = 1 and distinct_districts = 1
          and distinct_talukas_trusted = 1 and distinct_talukas_any = 1 then 'resolved'
        when total_count > 0 then 'needs_review'
        else 'unresolved'
      end,
      -- Ambiguous now reflects ANY conflicting Taluka evidence under this
      -- PIN, not just conflicts among already-trusted rows -- an untrusted
      -- locality pointing at a different Taluka is still real evidence
      -- that this PIN is not safely "one Taluka".
      ambiguous = distinct_talukas_any > 1,
      verified_at = now()
  where pin.pincode = target_pincode
    and pin.source <> 'admin_verified';
end;
$$;

-- One-time self-correction for every PIN already cached, so this deploy
-- fixes existing data immediately rather than only new lookups.
do $$
declare touched_pincode text;
begin
  for touched_pincode in select pincode from public.geo_pincodes
  loop
    perform private.refresh_geo_pincode_aggregate(touched_pincode);
  end loop;
end $$;

-- Thin public wrapper so the lookup-india-pincode Edge Function (service
-- role, via PostgREST) can invoke this too -- the `private` schema is not
-- exposed over the REST API at all, so a public-schema RPC is the only way
-- a caller outside the database can reach it. Restricted to service_role
-- only: this recomputes trust/aggregate state and must never be callable by
-- an ordinary authenticated user directly.
create or replace function public.refresh_geo_pincode_aggregate(target_pincode text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.refresh_geo_pincode_aggregate(target_pincode);
$$;

revoke all on function public.refresh_geo_pincode_aggregate(text) from public, anon, authenticated;
grant execute on function public.refresh_geo_pincode_aggregate(text) to service_role;

commit;
