begin;

alter table public.categories
  add column if not exists home_image_url text;

comment on column public.categories.home_image_url is
  'Admin-managed 18:25 portrait image shown for this category in the public home Top Categories section.';

commit;
