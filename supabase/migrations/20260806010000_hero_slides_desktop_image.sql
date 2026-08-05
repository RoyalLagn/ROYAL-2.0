begin;

-- Optional wide-banner image for desktop/web hero. Mobile/tablet keep using image_url.

alter table public.hero_slides
  add column if not exists desktop_image_url text;

alter table public.hero_slides
  add column if not exists desktop_image_public_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_slides'::regclass
      and conname = 'hero_slides_desktop_image_url_not_blank'
  ) then
    alter table public.hero_slides
      add constraint hero_slides_desktop_image_url_not_blank
      check (desktop_image_url is null or btrim(desktop_image_url) <> '');
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
