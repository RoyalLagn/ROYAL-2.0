begin;

alter table public.categories
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists sort_order integer not null default 100,
  add column if not exists icon_url text,
  add column if not exists fallback_image_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_featured boolean not null default false,
  add column if not exists show_on_home boolean not null default true,
  add column if not exists show_in_search boolean not null default true,
  add column if not exists show_in_vendor_registration boolean not null default true,
  add column if not exists localization_key text;

update public.categories
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
where slug is null or btrim(slug) = '';

with category_settings(name, description, sort_order) as (
  values
    ('Wedding Hall', 'Banquets, lawns, resorts and more', 10),
    ('Caterer', 'Delicious food for every celebration', 20),
    ('Photographer', 'Capture your most special moments', 30),
    ('Decorator', 'Beautiful setups for your celebrations', 40),
    ('Makeup Artist', 'Look your best on your big day', 50),
    ('Mehendi Artist', 'Beautiful mehndi for your special day', 60),
    ('DJ', 'Music that makes your event unforgettable', 70),
    ('Bridal Wear', 'Exquisite outfits for beautiful brides', 80),
    ('Groom Wear', 'Sherwanis, suits and more', 90),
    ('Jewellery', 'Complete your look with perfect jewellery', 100),
    ('Pandit', 'Experienced pandits for wedding ceremonies', 110),
    ('Invitation Cards', 'Beautiful invitations for every celebration', 120),
    ('Choreographer', 'Music and entertainment for every occasion', 130)
)
update public.categories as category
set
  description = settings.description,
  sort_order = settings.sort_order
from category_settings as settings
where lower(category.name) = lower(settings.name);

update public.categories
set show_on_home = false, show_in_search = false
where lower(name) in ('travel', 'car rental');

alter table public.categories
  alter column slug set not null;

create unique index if not exists categories_slug_unique_ci_idx
  on public.categories (lower(slug));

create index if not exists categories_active_sort_idx
  on public.categories (is_active, sort_order, name);

insert into public.categories (
  id,
  name,
  slug,
  description,
  sort_order,
  icon_url,
  fallback_image_url,
  is_active,
  is_featured,
  show_on_home,
  show_in_search,
  show_in_vendor_registration,
  localization_key
)
select
  '8b47d6d8-6fb9-4a87-a6a3-5d7a7cbad501',
  'Live Orchestra & Band',
  'live-orchestra-band',
  'Live music and wedding bands for every celebration',
  140,
  'https://res.cloudinary.com/hp6vu8o9/image/upload/v1785138360/royallagn/category-icons-v3/wedding-bands.png',
  'https://res.cloudinary.com/hp6vu8o9/image/upload/v1784904977/royallagn/categories/bands.png',
  true,
  false,
  true,
  true,
  true,
  'categories.live_orchestra_band'
where not exists (
  select 1
  from public.categories
  where lower(name) = 'live orchestra & band'
     or lower(slug) = 'live-orchestra-band'
)
on conflict do nothing;

update public.categories
set
  name = 'Live Orchestra & Band',
  slug = 'live-orchestra-band',
  description = 'Live music and wedding bands for every celebration',
  sort_order = 140,
  icon_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1785138360/royallagn/category-icons-v3/wedding-bands.png',
  fallback_image_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1784904977/royallagn/categories/bands.png',
  is_active = true,
  show_on_home = true,
  show_in_search = true,
  show_in_vendor_registration = true,
  localization_key = 'categories.live_orchestra_band',
  updated_at = now()
where lower(name) = 'live orchestra & band'
   or lower(slug) = 'live-orchestra-band';

commit;
