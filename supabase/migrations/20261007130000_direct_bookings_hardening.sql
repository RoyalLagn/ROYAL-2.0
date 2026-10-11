-- Migration: 20261007130000_direct_bookings_hardening.sql
-- Direct Booking System Hardening:
-- 1. Support full lifecycle in vendor_bookings (pending_payment, pending_vendor_confirmation, confirmed, cancelled_by_vendor, cancelled_by_customer, completed)
-- 2. Add soft_lock_expires_at for 15-minute checkout holds
-- 3. Add is_admin_only to vendor_enquiries so public enquiries never show on vendor dashboard
-- 4. Create public.booking_refund_requests table for admin refund queue and audit trail
-- 5. Update get_vendor_availability_calendar RPC to check active bookings and soft locks without writing manual blocked rows
-- 6. Create confirm_vendor_booking RPC (atomically confirms, generates ticket, notifies customer, does NOT write manual blocked row)
-- 7. Create cancel_vendor_booking RPC (atomically cancels, creates refund request, notifies customer, releases availability)
-- 8. Create process_admin_refund RPC (atomically updates refund status and logs completion)

begin;

-- 1. Update vendor_bookings check constraints
alter table public.vendor_bookings
  drop constraint if exists vendor_bookings_status_valid;

alter table public.vendor_bookings
  add constraint vendor_bookings_status_valid
  check (booking_status in (
    'pending_payment',
    'pending_vendor_confirmation',
    'pending',
    'confirmed',
    'cancelled_by_vendor',
    'cancelled_by_customer',
    'cancelled',
    'completed'
  ));

alter table public.vendor_bookings
  drop constraint if exists vendor_bookings_payment_status_valid;

alter table public.vendor_bookings
  add constraint vendor_bookings_payment_status_valid
  check (payment_status in (
    'pending',
    'paid_advance',
    'failed',
    'refunded'
  ));

-- 2. Add soft_lock_expires_at
alter table public.vendor_bookings
  add column if not exists soft_lock_expires_at timestamptz;

create index if not exists vendor_bookings_soft_lock_idx
  on public.vendor_bookings(vendor_id, soft_lock_expires_at)
  where booking_status = 'pending_payment';

create index if not exists vendor_bookings_active_dates_idx
  on public.vendor_bookings(vendor_id, booking_status, start_date, end_date);

-- 3. Add is_admin_only to vendor_enquiries
alter table public.vendor_enquiries
  add column if not exists is_admin_only boolean not null default false;

create index if not exists vendor_enquiries_admin_only_idx
  on public.vendor_enquiries(vendor_id, is_admin_only);

-- 4. Create booking_refund_requests table
create table if not exists public.booking_refund_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.vendor_bookings(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  razorpay_order_id text,
  razorpay_payment_id text,
  amount numeric(12, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'refunded', 'failed')),
  reason text,
  transaction_reference text,
  notes text,
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_refund_requests_status_idx
  on public.booking_refund_requests(status, created_at desc);

create index if not exists booking_refund_requests_vendor_idx
  on public.booking_refund_requests(vendor_id, created_at desc);

drop trigger if exists booking_refund_requests_set_updated_at on public.booking_refund_requests;
create trigger booking_refund_requests_set_updated_at
before update on public.booking_refund_requests
for each row execute function private.set_updated_at();

alter table public.booking_refund_requests enable row level security;

drop policy if exists "booking_refund_requests_admin_all" on public.booking_refund_requests;
create policy "booking_refund_requests_admin_all"
on public.booking_refund_requests for all to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "booking_refund_requests_vendor_select" on public.booking_refund_requests;
create policy "booking_refund_requests_vendor_select"
on public.booking_refund_requests for select to authenticated
using (private.owns_vendor(vendor_id));

drop policy if exists "booking_refund_requests_customer_select" on public.booking_refund_requests;
create policy "booking_refund_requests_customer_select"
on public.booking_refund_requests for select to authenticated
using (customer_id is not null and auth.uid() = customer_id);

-- Realtime for refund requests
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'booking_refund_requests'
     ) then
    alter publication supabase_realtime add table public.booking_refund_requests;
  end if;
end;
$$;

-- 5. Authoritative availability RPC
create or replace function public.get_vendor_availability_calendar(
  target_vendor_id uuid,
  start_date date,
  end_date date
)
returns table (
  date date,
  status public.vendor_availability_status,
  is_exception boolean,
  booking_blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    day::date,
    private.effective_vendor_availability_status(target_vendor_id, day::date),
    exception.id is not null,
    exists (
      select 1 from public.vendor_bookings b
      where b.vendor_id = target_vendor_id
        and (
          -- Confirmed or verified paid booking
          b.booking_status in ('confirmed', 'pending_vendor_confirmation', 'pending')
          -- OR active 15-minute payment soft lock
          or (b.booking_status = 'pending_payment' and b.soft_lock_expires_at > now())
        )
        and (
          (b.start_date is not null and b.end_date is not null and day::date between b.start_date and b.end_date)
          or (b.event_date = day::date)
        )
    )
  from generate_series(start_date, end_date, interval '1 day') day
  left join public.vendor_availability exception
    on exception.vendor_id = target_vendor_id and exception.date = day::date
  where start_date <= end_date
    and (
      private.vendor_is_public(target_vendor_id)
      or private.workspace_vendor_owned(target_vendor_id)
      or private.is_admin()
    )
  order by day;
$$;

-- 6. Vendor Confirm Booking RPC
create or replace function public.confirm_vendor_booking(
  target_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_ticket_id text;
  v_vendor_name text;
begin
  -- 1. Row locking to prevent race conditions
  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- 2. Verify authorization
  if not private.owns_vendor(v_booking.vendor_id) and not private.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- Idempotency check: already confirmed
  if v_booking.booking_status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id
    );
  end if;

  -- Ensure only pending bookings can be confirmed
  if v_booking.booking_status not in ('pending_vendor_confirmation', 'pending') then
    raise exception 'Booking cannot be confirmed from current status: %', v_booking.booking_status using errcode = '22023';
  end if;

  -- Generate ticket ID if missing
  v_ticket_id := coalesce(nullif(v_booking.ticket_id, ''), 'RL-' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8)));

  -- Fetch vendor business name
  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  -- 3. Update booking status
  update public.vendor_bookings
  set booking_status = 'confirmed',
      ticket_id = v_ticket_id,
      soft_lock_expires_at = null,
      updated_at = now()
  where id = target_booking_id;

  -- 4. Dispatched customer notification
  if v_booking.customer_id is not null then
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_booking.customer_id,
      'booking_confirmed',
      'Booking Confirmed! Luxury E-Ticket Ready',
      'Your booking for ' || coalesce(v_booking.event_type, 'Wedding') || ' on ' || v_booking.event_date::text || ' has been confirmed by ' || coalesce(v_vendor_name, 'the vendor') || '! Your official Luxury E-Ticket is ready.',
      '/ticket?ticket_id=' || v_ticket_id || '&booking_id=' || v_booking.booking_id,
      jsonb_build_object(
        'ticket_id', v_ticket_id,
        'booking_id', v_booking.booking_id,
        'booking_status', 'confirmed',
        'vendor_id', v_booking.vendor_id
      )
    );
  end if;

  -- IMPORTANT: DO NOT INSERT INTO vendor_availability with status = 'blocked'.
  -- vendor_bookings is the authoritative booking ledger and blocks availability through get_vendor_availability_calendar.

  return jsonb_build_object(
    'success', true,
    'booking_status', 'confirmed',
    'ticket_id', v_ticket_id,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 7. Vendor Cancel Booking RPC
create or replace function public.cancel_vendor_booking(
  target_booking_id uuid,
  cancel_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_refund_amount numeric(12, 2);
  v_vendor_name text;
begin
  -- 1. Row locking
  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- 2. Verify authorization
  if not private.owns_vendor(v_booking.vendor_id) and not private.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- Idempotency check: already cancelled
  if v_booking.booking_status in ('cancelled_by_vendor', 'cancelled') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  -- Fetch vendor business name
  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  v_refund_amount := case
    when v_booking.payment_status = 'paid_advance' then coalesce(v_booking.advance_amount, 0)
    else 0
  end;

  -- 3. Atomically update booking status
  update public.vendor_bookings
  set booking_status = 'cancelled_by_vendor',
      rejection_reason = cancel_reason,
      refund_status = case when v_refund_amount > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amount > 0 then v_refund_amount else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = target_booking_id;

  -- 4. Atomically create Admin refund queue entry if advance was paid
  if v_refund_amount > 0 then
    insert into public.booking_refund_requests (
      booking_id,
      customer_id,
      vendor_id,
      razorpay_order_id,
      razorpay_payment_id,
      amount,
      status,
      reason
    ) values (
      v_booking.id,
      v_booking.customer_id,
      v_booking.vendor_id,
      v_booking.razorpay_order_id,
      v_booking.razorpay_payment_id,
      v_refund_amount,
      'pending',
      coalesce(nullif(cancel_reason, ''), 'Cancelled by vendor')
    )
    on conflict (booking_id) do nothing;
  end if;

  -- 5. Dispatched persistent customer notification with 72h refund SLA
  if v_booking.customer_id is not null then
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_booking.customer_id,
      'booking_cancelled',
      'Booking Cancelled by Vendor',
      'Your booking for ' || coalesce(v_booking.event_type, 'Wedding') || ' on ' || v_booking.event_date::text || ' could not be confirmed by ' || coalesce(v_vendor_name, 'the vendor') || '. ' ||
      case
        when v_refund_amount > 0 then 'Your paid advance of ₹' || v_refund_amount::text || ' is now queued for refund and will be credited back to your original payment method within 72 hours.'
        else 'We apologize for the inconvenience.'
      end,
      '/ticket?ticket_id=' || v_booking.ticket_id || '&booking_id=' || v_booking.booking_id,
      jsonb_build_object(
        'booking_id', v_booking.booking_id,
        'ticket_id', v_booking.ticket_id,
        'booking_status', 'cancelled_by_vendor',
        'refund_status', case when v_refund_amount > 0 then 'pending' else 'none' end,
        'refund_amount', v_refund_amount,
        'vendor_id', v_booking.vendor_id
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_status', 'cancelled_by_vendor',
    'refund_status', case when v_refund_amount > 0 then 'pending' else null end,
    'refund_amount', v_refund_amount,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 8. Admin Process Refund RPC
create or replace function public.process_admin_refund(
  target_booking_id uuid,
  ref_notes text,
  txn_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- Update vendor_bookings
  update public.vendor_bookings
  set refund_status = 'refunded',
      refunded_at = now(),
      refund_notes = coalesce(nullif(ref_notes, ''), 'Processed by admin'),
      updated_at = now()
  where id = target_booking_id;

  -- Update booking_refund_requests
  update public.booking_refund_requests
  set status = 'refunded',
      processed_at = now(),
      processed_by = auth.uid(),
      transaction_reference = txn_ref,
      notes = coalesce(nullif(ref_notes, ''), notes),
      updated_at = now()
  where booking_id = target_booking_id;

  -- Customer notification
  if v_booking.customer_id is not null then
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_booking.customer_id,
      'refund_completed',
      'Refund Completed',
      'Your refund of ₹' || coalesce(v_booking.refund_amount, v_booking.advance_amount, 0)::text || ' for booking #' || v_booking.ticket_id || ' has been successfully processed.',
      '/ticket?ticket_id=' || v_booking.ticket_id || '&booking_id=' || v_booking.booking_id,
      jsonb_build_object(
        'booking_id', v_booking.booking_id,
        'ticket_id', v_booking.ticket_id,
        'refund_status', 'refunded',
        'refund_amount', coalesce(v_booking.refund_amount, v_booking.advance_amount, 0)
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'refund_status', 'refunded',
    'booking_id', v_booking.booking_id
  );
end;
$$;

commit;
