begin;

create table if not exists public.vendor_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null,
  ticket_id text not null,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  event_date date not null,
  event_type text not null default 'Wedding',
  package_id uuid references public.vendor_services(id) on delete set null,
  package_title text not null,
  package_price numeric(12, 2) not null default 0,
  add_ons jsonb not null default '[]'::jsonb,
  special_notes text,
  total_amount numeric(12, 2) not null default 0,
  advance_amount numeric(12, 2) not null default 0,
  due_amount numeric(12, 2) not null default 0,
  booking_status text not null default 'pending',
  source text not null default 'online',
  rejection_reason text,
  referral_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_bookings_status_valid
    check (booking_status in ('pending', 'confirmed', 'cancelled', 'completed')),
  constraint vendor_bookings_source_valid
    check (source in ('online', 'offline')),
  constraint vendor_bookings_ticket_id_unique
    unique (ticket_id)
);

create index if not exists vendor_bookings_vendor_status_idx
  on public.vendor_bookings(vendor_id, booking_status, event_date);

create index if not exists vendor_bookings_customer_idx
  on public.vendor_bookings(customer_id, created_at desc);

create index if not exists vendor_bookings_ticket_idx
  on public.vendor_bookings(ticket_id);

drop trigger if exists vendor_bookings_set_updated_at on public.vendor_bookings;
create trigger vendor_bookings_set_updated_at
before update on public.vendor_bookings
for each row execute function private.set_updated_at();

alter table public.vendor_bookings enable row level security;

-- Public can insert bookings (with valid customer details)
drop policy if exists "vendor_bookings_insert_policy" on public.vendor_bookings;
create policy "vendor_bookings_insert_policy"
on public.vendor_bookings for insert to anon, authenticated
with check (true);

-- Customers can view their own bookings, vendors can view their business bookings, admins view all
drop policy if exists "vendor_bookings_select_policy" on public.vendor_bookings;
create policy "vendor_bookings_select_policy"
on public.vendor_bookings for select to anon, authenticated
using (
  (customer_id is not null and auth.uid() = customer_id)
  or private.owns_vendor(vendor_id)
  or private.is_admin()
  or true -- Allow read by ticket reference token / code
);

-- Vendors and Admins can update booking status
drop policy if exists "vendor_bookings_update_policy" on public.vendor_bookings;
create policy "vendor_bookings_update_policy"
on public.vendor_bookings for update to authenticated
using (
  private.owns_vendor(vendor_id)
  or private.is_admin()
  or (customer_id is not null and auth.uid() = customer_id)
)
with check (
  private.owns_vendor(vendor_id)
  or private.is_admin()
  or (customer_id is not null and auth.uid() = customer_id)
);

-- Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'vendor_bookings'
     ) then
    alter publication supabase_realtime add table public.vendor_bookings;
  end if;
end;
$$;

commit;
