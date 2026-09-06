begin;

-- Public location pickers need the complete India hierarchy for selection,
-- while vendor discovery must continue to enforce is_active at the Taluka
-- and ranking-function level. These functions expose names and IDs only.
create or replace function public.list_public_geo_states()
returns table (
  id uuid,
  name text,
  code text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select state.id, state.name, state.code, state.is_active
  from public.geo_states state
  order by state.name;
$$;

create or replace function public.list_public_geo_districts(p_state_id uuid)
returns table (
  id uuid,
  state_id uuid,
  name text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select district.id, district.state_id, district.name, district.is_active
  from public.geo_districts district
  where district.state_id = p_state_id
  order by district.name;
$$;

revoke all on function public.list_public_geo_states() from public;
revoke all on function public.list_public_geo_districts(uuid) from public;
grant execute on function public.list_public_geo_states() to anon, authenticated;
grant execute on function public.list_public_geo_districts(uuid) to anon, authenticated;

commit;
