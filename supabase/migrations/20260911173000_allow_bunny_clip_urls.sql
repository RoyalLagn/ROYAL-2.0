begin;

alter table public.clips
  drop constraint if exists clips_urls_valid;

alter table public.clips
  add constraint clips_urls_valid check (
    (
      video_url ~* '^https://res\.cloudinary\.com/'
      or video_url ~* '^https://vz-5feeb94c-e56\.b-cdn\.net/'
    )
    and (
      thumbnail_url ~* '^https://res\.cloudinary\.com/'
      or thumbnail_url ~* '^https://royallagnmedia\.b-cdn\.net/'
      or thumbnail_url ~* '^https://vz-5feeb94c-e56\.b-cdn\.net/'
    )
    and btrim(cloudinary_public_id) <> ''
  );

comment on constraint clips_urls_valid on public.clips is
  'Allows legacy Cloudinary Clip media and the configured Bunny Stream/Storage CDN hosts during migration.';

commit;
