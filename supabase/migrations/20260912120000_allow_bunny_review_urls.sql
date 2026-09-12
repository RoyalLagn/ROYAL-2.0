create or replace function private.review_image_urls_valid(value text[])
returns boolean language plpgsql immutable set search_path = ''
as $$
declare image_url text;
begin
  if cardinality(coalesce(value, '{}')) > 8 then return false; end if;
  foreach image_url in array coalesce(value, '{}') loop
    if image_url is null or image_url !~* '^https://(res\.cloudinary\.com|royallagnmedia\.b-cdn\.net)/' then
      return false;
    end if;
  end loop;
  return true;
end
$$;

comment on function private.review_image_urls_valid(text[]) is
  'Accepts Bunny CDN review photos and legacy Cloudinary review photos during migration.';

grant select, update on public.hero_slides to service_role;
grant select, update on public.categories to service_role;
