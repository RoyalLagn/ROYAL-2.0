-- Admin-curated homepage vendor rail. Public clients may read the ordered
-- selection; only verified administrators can replace it, atomically.

create table if not exists public.home_featured_vendors (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_featured_vendors_display_order_range
    check (display_order between 0 and 9),
  constraint home_featured_vendors_display_order_unique unique (display_order)
);

alter table public.home_featured_vendors enable row level security;

drop policy if exists home_featured_vendors_public_read on public.home_featured_vendors;
create policy home_featured_vendors_public_read
on public.home_featured_vendors for select
to anon, authenticated
using (true);

create or replace function public.set_home_featured_vendors(p_vendor_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer := coalesce(array_length(p_vendor_ids, 1), 0);
  distinct_count integer;
  eligible_count integer;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if selected_count > 10 then
    raise exception 'A maximum of 10 featured vendors is allowed' using errcode = '22023';
  end if;

  select count(distinct vendor_id)
  into distinct_count
  from unnest(coalesce(p_vendor_ids, array[]::uuid[])) as vendor_id;

  if distinct_count <> selected_count then
    raise exception 'Featured vendors must be unique' using errcode = '22023';
  end if;

  select count(*)
  into eligible_count
  from public.vendors vendor
  where vendor.id = any(coalesce(p_vendor_ids, array[]::uuid[]))
    and vendor.is_verified = true
    and coalesce(vendor.public_profile_enabled, true) = true
    and coalesce(vendor.management_status, 'active') = 'active';

  if eligible_count <> selected_count then
    raise exception 'Only active, verified public vendors can be featured' using errcode = '22023';
  end if;

  delete from public.home_featured_vendors;

  insert into public.home_featured_vendors (vendor_id, display_order, updated_at)
  select vendor_id, (ordinal - 1)::integer, now()
  from unnest(coalesce(p_vendor_ids, array[]::uuid[])) with ordinality as selection(vendor_id, ordinal);
end;
$$;

revoke all on function public.set_home_featured_vendors(uuid[]) from public, anon;
grant execute on function public.set_home_featured_vendors(uuid[]) to authenticated;

create index if not exists home_featured_vendors_order_idx
on public.home_featured_vendors(display_order);

do $$
begin
  alter publication supabase_realtime add table public.home_featured_vendors;
exception
  when duplicate_object then null;
end;
$$;
