begin;

-- =========================================================================
-- Vendor Public Profile Platform (Phase 1)
-- Permanent SEO-friendly slug + permanent QR record, assigned automatically
-- the moment a vendor is approved (is_verified flips to true), with admin
-- controls to regenerate the slug (preserving a redirect for the old one)
-- and to enable/disable the public profile independently of marketplace
-- visibility.
-- =========================================================================

alter table public.vendors
  add column if not exists slug text unique,
  add column if not exists slug_generated_at timestamptz,
  add column if not exists public_profile_enabled boolean not null default true;

create table if not exists public.vendor_slug_history (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  old_slug text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists vendor_slug_history_vendor_idx
  on public.vendor_slug_history(vendor_id, created_at desc);

create table if not exists public.vendor_qr_codes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  qr_url text not null,
  version integer not null default 1,
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Slug generation
-- ---------------------------------------------------------------------

create or replace function public.slugify_vendor_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(value, ''))), '&', 'and', 'g'),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

create or replace function public.assign_vendor_slug(p_vendor_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendors;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  public_base_url text := 'https://royallagn.com/vendors/';
begin
  select * into v from public.vendors where id = p_vendor_id for update;
  if v.id is null then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;

  if v.slug is not null then
    return v.slug;
  end if;

  base_slug := public.slugify_vendor_name(v.business_name || '-' || coalesce(v.city, ''));
  if base_slug = '' then
    base_slug := 'vendor-' || left(v.id::text, 8);
  end if;

  candidate_slug := base_slug;
  while exists (select 1 from public.vendors where slug = candidate_slug)
     or exists (select 1 from public.vendor_slug_history where old_slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix;
  end loop;

  update public.vendors
  set slug = candidate_slug, slug_generated_at = now()
  where id = p_vendor_id;

  insert into public.vendor_qr_codes (vendor_id, qr_url, version, generated_at)
  values (p_vendor_id, public_base_url || candidate_slug, 1, now())
  on conflict (vendor_id) do update
    set qr_url = excluded.qr_url;

  return candidate_slug;
end;
$$;

revoke all on function public.assign_vendor_slug(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger: assign a slug the moment a vendor becomes verified, regardless
-- of which code path flipped is_verified to true.
-- ---------------------------------------------------------------------

create or replace function public.handle_vendor_public_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_verified and not old.is_verified and new.slug is null then
    perform public.assign_vendor_slug(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_public_profile_activation on public.vendors;
create trigger vendor_public_profile_activation
after update on public.vendors
for each row execute function public.handle_vendor_public_profile_activation();

-- ---------------------------------------------------------------------
-- Admin controls
-- ---------------------------------------------------------------------

create or replace function public.admin_regenerate_vendor_slug(target_vendor_id uuid)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.vendors;
  new_slug text;
  public_base_url text := 'https://royallagn.com/vendors/';
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into result from public.vendors where id = target_vendor_id for update;
  if result.id is null then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;

  if result.slug is not null then
    insert into public.vendor_slug_history (vendor_id, old_slug)
    values (target_vendor_id, result.slug)
    on conflict (old_slug) do nothing;
  end if;

  update public.vendors set slug = null, slug_generated_at = null where id = target_vendor_id;
  new_slug := public.assign_vendor_slug(target_vendor_id);

  update public.vendor_qr_codes
  set version = version + 1, generated_at = now(), qr_url = public_base_url || new_slug
  where vendor_id = target_vendor_id;

  insert into public.admin_vendor_activity(vendor_id, administrator_id, action, details)
  values (target_vendor_id, auth.uid(), 'regenerate_slug', jsonb_build_object('new_slug', new_slug));

  select * into result from public.vendors where id = target_vendor_id;
  return result;
end;
$$;

create or replace function public.admin_set_vendor_public_profile(target_vendor_id uuid, enabled boolean)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare result public.vendors;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.vendors set public_profile_enabled = enabled, updated_at = now()
  where id = target_vendor_id
  returning * into result;

  if result.id is null then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;

  insert into public.admin_vendor_activity(vendor_id, administrator_id, action, details)
  values (target_vendor_id, auth.uid(), 'set_public_profile', jsonb_build_object('enabled', enabled));

  return result;
end;
$$;

revoke all on function public.admin_regenerate_vendor_slug(uuid) from public, anon;
revoke all on function public.admin_set_vendor_public_profile(uuid, boolean) from public, anon;
grant execute on function public.admin_regenerate_vendor_slug(uuid) to authenticated;
grant execute on function public.admin_set_vendor_public_profile(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
-- vendors.slug / public_profile_enabled are covered by the existing
-- "vendors_public_owner_admin_read" policy (private.vendor_is_public).
-- The narrower vendor_slug_history / vendor_qr_codes tables get their own.

alter table public.vendor_slug_history enable row level security;
alter table public.vendor_qr_codes enable row level security;

grant select on public.vendor_slug_history to anon, authenticated;
grant select on public.vendor_qr_codes to authenticated;

create policy "vendor_slug_history_public_read"
on public.vendor_slug_history for select
to anon, authenticated
using (true);

create policy "vendor_qr_codes_owner_or_admin_read"
on public.vendor_qr_codes for select
to authenticated
using (
  (select private.owns_vendor(vendor_id))
  or (select private.is_admin())
);

-- ---------------------------------------------------------------------
-- Backfill: vendors approved before this migration also get a slug.
-- ---------------------------------------------------------------------

do $$
declare rec record;
begin
  for rec in select id from public.vendors where is_verified and slug is null loop
    perform public.assign_vendor_slug(rec.id);
  end loop;
end
$$;

commit;
