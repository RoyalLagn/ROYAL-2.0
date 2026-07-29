begin;

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
values
  (
    '3eb5dd6e-ce48-47e0-a501-6ae4feaf76d1',
    'Groom Wear',
    'groom-wear',
    'Sherwanis, suits and more',
    90,
    'https://res.cloudinary.com/hp6vu8o9/image/upload/v1784904987/royallagn/categories/groom-wear.png',
    'https://res.cloudinary.com/hp6vu8o9/image/upload/v1784904987/royallagn/categories/groom-wear.png',
    true,
    false,
    true,
    true,
    true,
    'categories.groom_wear'
  ),
  (
    '1df71632-ad8a-4348-825b-d6bcf10933b4',
    'Pre Wedding Shoot',
    'pre-wedding-shoot',
    'Capture memories before the big day',
    125,
    'https://res.cloudinary.com/hp6vu8o9/image/upload/v1784905002/royallagn/categories/pre-wedding-shoot.png',
    'https://res.cloudinary.com/hp6vu8o9/image/upload/v1784905002/royallagn/categories/pre-wedding-shoot.png',
    true,
    false,
    true,
    true,
    true,
    'categories.pre_wedding_shoot'
  )
on conflict do nothing;

update public.categories
set
  name = 'Groom Wear',
  slug = 'groom-wear',
  description = 'Sherwanis, suits and more',
  sort_order = 90,
  is_active = true,
  show_on_home = true,
  show_in_search = true,
  show_in_vendor_registration = true,
  localization_key = 'categories.groom_wear',
  updated_at = now()
where lower(name) = 'groom wear'
   or lower(slug) = 'groom-wear';

update public.categories
set
  name = 'Pre Wedding Shoot',
  slug = 'pre-wedding-shoot',
  description = 'Capture memories before the big day',
  sort_order = 125,
  is_active = true,
  show_on_home = true,
  show_in_search = true,
  show_in_vendor_registration = true,
  localization_key = 'categories.pre_wedding_shoot',
  updated_at = now()
where lower(name) in ('pre wedding shoot', 'pre-wedding shoot')
   or lower(slug) = 'pre-wedding-shoot';

commit;
