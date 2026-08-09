begin;

-- These legacy categories are outside RoyalLagn's supported 15-category
-- marketplace. Retire them instead of deleting rows that vendors may still
-- reference historically.
update public.categories
set
  is_active = false,
  is_featured = false,
  show_on_home = false,
  show_in_search = false,
  show_in_vendor_registration = false,
  updated_at = now()
where lower(name) in ('travel', 'car rental')
   or lower(slug) in ('travel', 'car-rental');

commit;
