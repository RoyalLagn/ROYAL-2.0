begin;

-- Travel and Car Rental were retired (is_active = false) in
-- 20260810130000_retire_travel_and_car_rental_categories.sql instead of being
-- deleted, out of caution that a vendor might still reference them. Verified
-- directly against this database before writing this migration: zero rows in
-- every table with a foreign key to categories(id) — vendors,
-- vendor_applications, clips, hero_slides — reference either category, and no
-- other table has an unenforced text/slug reference to them either. There is
-- nothing left to reassign or preserve, so this permanently removes the rows
-- rather than continuing to hide them behind is_active.
--
-- Defensive guard: if this ever runs against a database where a dependency
-- was in fact created after the above verification, abort instead of
-- silently deleting out from under a real reference.
do $$
declare
  target_ids uuid[];
  blocking_count integer;
begin
  select array_agg(id) into target_ids
  from public.categories
  where lower(slug) in ('travel', 'car-rental')
     or lower(name) in ('travel', 'car rental');

  if target_ids is null or array_length(target_ids, 1) = 0 then
    -- Already removed (e.g. this migration re-applied) — nothing to do.
    return;
  end if;

  select
    (select count(*) from public.vendors where category_id = any(target_ids))
    + (select count(*) from public.vendor_applications where category_id = any(target_ids))
    + (select count(*) from public.clips where category_id = any(target_ids))
    + (select count(*) from public.hero_slides where category_id = any(target_ids))
  into blocking_count;

  if blocking_count > 0 then
    raise exception 'Refusing to delete Travel/Car Rental categories: % dependent row(s) reference them. Reassign or remove those records first.', blocking_count
      using errcode = '23503';
  end if;

  delete from public.categories where id = any(target_ids);
end $$;

commit;
