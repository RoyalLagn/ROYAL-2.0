-- Restore a vendor's purchased placement from the authenticated identity,
-- rather than relying on a client-side table filter that can silently become
-- an empty result when an RLS policy changes.
create or replace function public.get_my_featured_placements()
returns setof public.featured_vendor_placements
language sql
stable
security definer
set search_path = ''
as $$
  select placement.*
  from public.featured_vendor_placements placement
  join public.vendors vendor on vendor.id = placement.vendor_id
  where vendor.profile_id = auth.uid()
  order by placement.created_at desc;
$$;

revoke all on function public.get_my_featured_placements() from public, anon;
grant execute on function public.get_my_featured_placements() to authenticated;

-- Return privacy-safe, per-slot availability. The caller needs dates and
-- ownership state to render accurate status cards, but never another
-- vendor's identity or payment data.
create or replace function public.get_featured_inventory_slots(target_pincode text)
returns table(slot_number integer, slot_status text, available_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate.slot_number,
    case
      when placement.id is null then 'available'
      when vendor.profile_id = auth.uid() then 'mine'
      else 'booked'
    end,
    case
      when placement.id is null then null
      else coalesce(placement.ends_at, placement.reserved_until)
    end
  from generate_series(1, 10) candidate(slot_number)
  left join lateral (
    select current_placement.*
    from public.featured_vendor_placements current_placement
    where current_placement.pincode = btrim(target_pincode)
      and current_placement.slot_number = candidate.slot_number
      and (
        (current_placement.status = 'active' and current_placement.ends_at > now())
        or (current_placement.status = 'reserved' and current_placement.reserved_until > now())
      )
    order by current_placement.created_at desc
    limit 1
  ) placement on true
  left join public.vendors vendor on vendor.id = placement.vendor_id
  where btrim(target_pincode) ~ '^[1-9][0-9]{5}$'
  order by candidate.slot_number;
$$;

revoke all on function public.get_featured_inventory_slots(text) from public, anon;
grant execute on function public.get_featured_inventory_slots(text) to authenticated;
