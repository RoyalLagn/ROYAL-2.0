-- Migration: Restore verified Cloudinary media URLs from Bunny.net
-- Date: 2026-10-06

begin;

-- Safety Snapshot Backup Tables
create table if not exists public._backup_vendor_portfolio_media_20261006 as
  select * from public.vendor_portfolio_media;

create table if not exists public._backup_vendors_20261006 as
  select * from public.vendors;

create table if not exists public._backup_categories_20261006 as
  select * from public.categories;

create table if not exists public._backup_profiles_20261006 as
  select * from public.profiles;

create table if not exists public._backup_vendor_applications_20261006 as
  select * from public.vendor_applications;

-- 1. Restore vendor_portfolio_media
update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513202/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/3af1b381-4b39-46f5-95cd-f869afa3e237.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513202/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/3af1b381-4b39-46f5-95cd-f869afa3e237.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513202/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/3af1b381-4b39-46f5-95cd-f869afa3e237.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513202/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/3af1b381-4b39-46f5-95cd-f869afa3e237.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513202/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/3af1b381-4b39-46f5-95cd-f869afa3e237.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/3af1b381-4b39-46f5-95cd-f869afa3e237'
where id = '26973ade-0fa7-45da-b5aa-88d8ca1fee62';

update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513197/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/a53b9aed-ff4d-480a-aaef-5ec4c90e5da5.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513197/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/a53b9aed-ff4d-480a-aaef-5ec4c90e5da5.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513197/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/a53b9aed-ff4d-480a-aaef-5ec4c90e5da5.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513197/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/a53b9aed-ff4d-480a-aaef-5ec4c90e5da5.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513197/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/a53b9aed-ff4d-480a-aaef-5ec4c90e5da5.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/a53b9aed-ff4d-480a-aaef-5ec4c90e5da5'
where id = '18194ed5-3917-4142-a512-fd062e8c5663';

update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513233/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/90ee693f-7e8e-4903-a1b6-7eb8a2e58ba9.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513233/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/90ee693f-7e8e-4903-a1b6-7eb8a2e58ba9.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513233/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/90ee693f-7e8e-4903-a1b6-7eb8a2e58ba9.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513233/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/90ee693f-7e8e-4903-a1b6-7eb8a2e58ba9.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513233/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/90ee693f-7e8e-4903-a1b6-7eb8a2e58ba9.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/90ee693f-7e8e-4903-a1b6-7eb8a2e58ba9'
where id = '3177cc6e-46ac-4c0a-81bc-4d11ba0e2b55';

update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513228/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/349c9168-fb96-4d1d-99c2-89097c45887b.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513228/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/349c9168-fb96-4d1d-99c2-89097c45887b.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513228/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/349c9168-fb96-4d1d-99c2-89097c45887b.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513228/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/349c9168-fb96-4d1d-99c2-89097c45887b.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513228/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/349c9168-fb96-4d1d-99c2-89097c45887b.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/349c9168-fb96-4d1d-99c2-89097c45887b'
where id = 'c90d7218-d00a-46c4-b897-e2ffda82bd92';

update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513184/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/b3835e35-b58e-4e38-af50-f73e2d00177f.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513184/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/b3835e35-b58e-4e38-af50-f73e2d00177f.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513184/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/b3835e35-b58e-4e38-af50-f73e2d00177f.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513184/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/b3835e35-b58e-4e38-af50-f73e2d00177f.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513184/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/b3835e35-b58e-4e38-af50-f73e2d00177f.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/b3835e35-b58e-4e38-af50-f73e2d00177f'
where id = '16b626c0-32be-4569-b8d9-651d9f96243b';

update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513221/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/bcbb291a-8c46-4a00-9884-257a79f041d8.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513221/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/bcbb291a-8c46-4a00-9884-257a79f041d8.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513221/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/bcbb291a-8c46-4a00-9884-257a79f041d8.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513221/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/bcbb291a-8c46-4a00-9884-257a79f041d8.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513221/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/bcbb291a-8c46-4a00-9884-257a79f041d8.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/bcbb291a-8c46-4a00-9884-257a79f041d8'
where id = '18a1b0f8-ce56-412d-ac06-0c53f39523a7';

update public.vendor_portfolio_media
set secure_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788513215/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/688a2099-0d19-4977-90c7-e3251ca4adcf.jpg',
  thumbnail_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile/v1788513215/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/688a2099-0d19-4977-90c7-e3251ca4adcf.jpg',
  optimized_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile/v1788513215/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/688a2099-0d19-4977-90c7-e3251ca4adcf.jpg',
  hero_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile/v1788513215/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/688a2099-0d19-4977-90c7-e3251ca4adcf.jpg',
  fullscreen_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile/v1788513215/royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/688a2099-0d19-4977-90c7-e3251ca4adcf.jpg',
  public_id = 'royallagn/vendors/fcd040b3-8caa-4d1a-9c5c-bb287db4e015/albums/6fc7f1c8-c084-41f4-9ebe-d250de90fe07/688a2099-0d19-4977-90c7-e3251ca4adcf'
where id = '71c7e5d5-abb8-4dc2-94fa-0c22a313860f';

-- 2. Restore vendors logo_url
update public.vendors
set logo_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1787815283/royallagn/vendors/80709127-ea52-4896-aa72-83f3e8d24a68/profile/84c2728d-a41f-4d87-a0b8-e6295944d0d0.png'
where id = '80709127-ea52-4896-aa72-83f3e8d24a68';

update public.vendors
set logo_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788511521/e31kiwccqn9qi0my1ohi.png'
where id = 'fcd040b3-8caa-4d1a-9c5c-bb287db4e015';

update public.vendors
set logo_url = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1787810718/royallagn/vendors/fdbdf617-5ee8-43ba-b713-a587e5378c82/profile/a68e7fab-adcc-46b0-bf37-a9f17b6d97b3.png'
where id = 'fdbdf617-5ee8-43ba-b713-a587e5378c82';

-- 3. Restore profiles profile_image
update public.profiles
set profile_image = 'https://res.cloudinary.com/hp6vu8o9/image/upload/v1788202359/royallagn/profiles/7697f772-11c0-4aa1-8a7c-f35698f32701/2ca368b5-6b79-491c-9395-1fd7e0e7ca79.png'
where id = '7697f772-11c0-4aa1-8a7c-f35698f32701';

commit;
