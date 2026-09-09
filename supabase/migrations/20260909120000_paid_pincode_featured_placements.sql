-- Paid, location-aware featured placement. Inventory is protected inside the
-- database so two vendors cannot purchase the tenth PIN-code slot at once.
drop function if exists public.set_home_featured_vendors_v2(text[]);
drop function if exists public.set_home_featured_vendors(uuid[]);
drop table if exists public.home_featured_vendors;

create table public.featured_vendor_placements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  slot_number smallint not null check (slot_number between 1 and 10),
  status text not null default 'reserved' check (status in ('reserved','active','expired','cancelled')),
  reserved_until timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.featured_vendor_payments (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.featured_vendor_placements(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  amount numeric(12,2) not null default 999 check (amount = 999),
  amount_minor integer not null default 99900 check (amount_minor = 99900),
  currency text not null default 'INR' check (currency = 'INR'),
  payment_status text not null default 'created' check (payment_status in ('created','pending','authorized','captured','verified','failed','cancelled','refunded')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  payment_method text,
  failure_code text,
  failure_reason text,
  idempotency_key text not null unique,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index featured_vendor_placements_pin_status_idx on public.featured_vendor_placements(pincode, status, ends_at);
create index featured_vendor_placements_vendor_idx on public.featured_vendor_placements(vendor_id, created_at desc);
create index featured_vendor_payments_vendor_idx on public.featured_vendor_payments(vendor_id, created_at desc);

alter table public.featured_vendor_placements enable row level security;
alter table public.featured_vendor_payments enable row level security;

-- Supabase projects created with auto-exposure disabled require explicit table
-- privileges in addition to RLS. Writes remain RPC/service-role only.
grant select on table public.featured_vendor_placements to anon, authenticated;
grant select on table public.featured_vendor_payments to authenticated;

create policy featured_placements_vendor_read on public.featured_vendor_placements for select to authenticated
using (vendor_id in (select id from public.vendors where profile_id = auth.uid()) or private.is_admin());
create policy featured_placements_public_active_read on public.featured_vendor_placements for select to public
using (status = 'active' and starts_at <= now() and ends_at > now());
create policy featured_payments_vendor_read on public.featured_vendor_payments for select to authenticated
using (vendor_id in (select id from public.vendors where profile_id = auth.uid()) or private.is_admin());

create or replace function public.get_featured_inventory(target_pincode text)
returns table(pincode text, capacity integer, occupied integer, remaining integer, next_available_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with live as (
    select * from public.featured_vendor_placements p
    where p.pincode = btrim(target_pincode)
      and ((p.status = 'active' and p.ends_at > now()) or (p.status = 'reserved' and p.reserved_until > now()))
  )
  select btrim(target_pincode), 10, count(*)::integer, greatest(0, 10 - count(*)::integer),
    case when count(*) >= 10 then min(coalesce(ends_at, reserved_until)) else null end
  from live;
$$;

create or replace function public.get_featured_vendor_ids_for_pincode(target_pincode text)
returns table(vendor_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.vendor_id
  from public.featured_vendor_placements p
  join public.vendors v on v.id = p.vendor_id
  where p.pincode = btrim(target_pincode) and p.status = 'active'
    and p.starts_at <= now() and p.ends_at > now()
    and v.is_verified and coalesce(v.public_profile_enabled, true)
    and coalesce(v.management_status, 'active') = 'active'
  -- Daily rotation shares the first position fairly while remaining stable
  -- throughout a customer's browsing session.
  order by md5(p.vendor_id::text || current_date::text);
$$;

create or replace function public.reserve_my_featured_vendor_slot(target_pincode text)
returns public.featured_vendor_placements
language plpgsql security definer set search_path = '' as $$
declare
  owned_vendor public.vendors%rowtype;
  existing public.featured_vendor_placements%rowtype;
  chosen_slot integer;
  result public.featured_vendor_placements%rowtype;
begin
  if btrim(target_pincode) !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  select * into owned_vendor from public.vendors where profile_id = auth.uid() limit 1;
  if not found then raise exception 'Vendor account required' using errcode = '42501'; end if;
  if not owned_vendor.is_verified or not coalesce(owned_vendor.public_profile_enabled, true)
    or coalesce(owned_vendor.management_status, 'active') <> 'active' then
    raise exception 'Only active, verified public vendors can buy featured placement';
  end if;
  if owned_vendor.pincode <> btrim(target_pincode)
    and not exists (select 1 from public.vendor_service_locations l where l.vendor_id = owned_vendor.id and l.pincode = btrim(target_pincode)) then
    raise exception 'You can only feature your business in a PIN code you serve';
  end if;

  perform pg_advisory_xact_lock(hashtext('featured:' || btrim(target_pincode)));
  update public.featured_vendor_placements set status = 'expired', updated_at = now()
  where (status = 'reserved' and reserved_until <= now()) or (status = 'active' and ends_at <= now());

  select * into existing from public.featured_vendor_placements
  where vendor_id = owned_vendor.id and pincode = btrim(target_pincode)
    and ((status = 'active' and ends_at > now()) or (status = 'reserved' and reserved_until > now()))
  order by created_at desc limit 1;
  if found then return existing; end if;

  select candidate into chosen_slot from generate_series(1,10) candidate
  where not exists (
    select 1 from public.featured_vendor_placements p where p.pincode = btrim(target_pincode)
      and p.slot_number = candidate
      and ((p.status = 'active' and p.ends_at > now()) or (p.status = 'reserved' and p.reserved_until > now()))
  ) order by candidate limit 1;
  if chosen_slot is null then raise exception 'All 10 featured spots are currently booked for this PIN code'; end if;

  insert into public.featured_vendor_placements(vendor_id,pincode,slot_number,status,reserved_until)
  values (owned_vendor.id,btrim(target_pincode),chosen_slot,'reserved',now() + interval '15 minutes') returning * into result;
  return result;
end;
$$;

create or replace function public.activate_verified_featured_payment(target_payment_id uuid, verified_payment_id text, verified_method text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare payment public.featured_vendor_payments%rowtype; placement public.featured_vendor_placements%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into payment from public.featured_vendor_payments where id = target_payment_id for update;
  if not found then raise exception 'Featured payment not found'; end if;
  if payment.payment_status = 'verified' then return payment.placement_id; end if;
  select * into placement from public.featured_vendor_placements where id = payment.placement_id for update;
  if placement.status not in ('reserved','active') then raise exception 'Featured spot reservation is no longer available'; end if;
  perform pg_advisory_xact_lock(hashtext('featured:' || placement.pincode));
  if placement.status = 'reserved' and (
    exists (select 1 from public.featured_vendor_placements p where p.id <> placement.id and p.pincode = placement.pincode
      and p.slot_number = placement.slot_number and ((p.status='active' and p.ends_at>now()) or (p.status='reserved' and p.reserved_until>now())))
    or (select count(*) from public.featured_vendor_placements p where p.id <> placement.id and p.pincode = placement.pincode
      and ((p.status='active' and p.ends_at>now()) or (p.status='reserved' and p.reserved_until>now()))) >= 10
  ) then raise exception 'The featured spot reservation expired before payment completed'; end if;
  update public.featured_vendor_payments set payment_status='verified', razorpay_payment_id=verified_payment_id,
    payment_method=verified_method, paid_at=coalesce(paid_at,now()), updated_at=now() where id=payment.id;
  update public.featured_vendor_placements set status='active', starts_at=coalesce(starts_at,now()),
    ends_at=coalesce(ends_at,now()+interval '30 days'), reserved_until=null, updated_at=now() where id=placement.id;
  return placement.id;
end;
$$;

revoke all on function public.get_featured_inventory(text), public.get_featured_vendor_ids_for_pincode(text), public.reserve_my_featured_vendor_slot(text) from public;
grant execute on function public.get_featured_inventory(text), public.get_featured_vendor_ids_for_pincode(text) to anon, authenticated;
grant execute on function public.reserve_my_featured_vendor_slot(text) to authenticated;
revoke all on function public.activate_verified_featured_payment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.activate_verified_featured_payment(uuid,text,text) to service_role;

create or replace function public.reverse_geocode_known_pincode(customer_latitude double precision, customer_longitude double precision)
returns text language sql stable security definer set search_path = '' as $$
  select locality.pincode
  from public.geo_pincode_localities locality
  where customer_latitude between -90 and 90 and customer_longitude between -180 and 180
    and locality.is_active and locality.is_trusted and locality.latitude is not null and locality.longitude is not null
    and extensions.st_dwithin(
      extensions.geography(extensions.st_setsrid(extensions.st_makepoint(customer_longitude, customer_latitude), 4326)),
      extensions.geography(extensions.st_setsrid(extensions.st_makepoint(locality.longitude, locality.latitude), 4326)), 5000
    )
  order by extensions.st_distance(
    extensions.geography(extensions.st_setsrid(extensions.st_makepoint(customer_longitude, customer_latitude), 4326)),
    extensions.geography(extensions.st_setsrid(extensions.st_makepoint(locality.longitude, locality.latitude), 4326))
  ) limit 1;
$$;
revoke all on function public.reverse_geocode_known_pincode(double precision,double precision) from public;
grant execute on function public.reverse_geocode_known_pincode(double precision,double precision) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.featured_vendor_placements;
exception when duplicate_object then null; end $$;
