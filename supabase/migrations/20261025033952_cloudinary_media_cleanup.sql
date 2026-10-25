-- Applied as 20261025033952; preserve all customer/vendor recovery references.
-- Only retire a finance table after an explicit emptiness guard.
do $$
begin
  if exists (select 1 from public.finance_bunny_usage) then
    raise exception 'Media finance history must be archived before cleanup';
  end if;
end $$;
drop table public.finance_bunny_usage;
drop function if exists public.finalize_bunny_clip_migration(uuid,text,text,text);

create or replace function private.review_image_urls_valid(value text[])
returns boolean language plpgsql immutable set search_path = '' as $$
declare image_url text;
begin
  if cardinality(coalesce(value, '{}')) > 8 then return false; end if;
  foreach image_url in array coalesce(value, '{}') loop
    if image_url is null or image_url !~ '^https://res\.cloudinary\.com/hp6vu8o9/image/upload/' then
      return false;
    end if;
  end loop;
  return true;
end $$;
-- Existing review rows were verified to contain no legacy CDN references.
alter table public.reviews validate constraint reviews_cloudinary_images_valid;
