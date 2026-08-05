begin;

-- Raise the Hero Section slide cap from 5 to 8.
create or replace function private.enforce_hero_slides_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slide_count integer;
begin
  select count(*)::integer into slide_count from public.hero_slides;
  if tg_op = 'INSERT' and slide_count >= 8 then
    raise exception 'Hero Section supports a maximum of 8 slides.';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_hero_slides_limit() from public, anon, authenticated;

commit;
