begin;

-- The search-capable RPC keeps p_search optional, so it is fully backward
-- compatible. Remove the previous 8-argument overload to keep PostgREST
-- function resolution unambiguous for older clients that omit p_search.
drop function if exists public.get_nearby_vendors(
  double precision, double precision, text[], numeric, numeric, numeric,
  integer, integer
);

commit;
