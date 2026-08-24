begin;

-- Public profile assets are self-service: every vendor workspace receives a
-- permanent profile slug and QR record when it is created, without waiting
-- for an administrator to approve the application.
create or replace function public.handle_vendor_public_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null
    and (tg_op = 'INSERT' or (new.is_verified and not old.is_verified)) then
    perform public.assign_vendor_slug(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_public_profile_activation on public.vendors;
create trigger vendor_public_profile_activation
after insert or update of is_verified on public.vendors
for each row execute function public.handle_vendor_public_profile_activation();

-- Repair every existing workspace that does not yet have its self-service
-- public profile. assign_vendor_slug() is idempotent and creates its QR.
do $$
declare
  approved_vendor record;
begin
  for approved_vendor in
    select id
    from public.vendors
    where slug is null
  loop
    perform public.assign_vendor_slug(approved_vendor.id);
  end loop;
end;
$$;

commit;
