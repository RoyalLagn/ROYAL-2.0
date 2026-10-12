-- Migration: 20261012100000_booking_cancellation_and_contact_unlock.sql
-- RoyalLagn 5-Day (120 Hours) Cancellation Lock & Automatic Contact Unlock System
-- 
-- 1. Adds canonical event start & cutoff columns to public.vendor_bookings.
-- 2. Adds customer contact details (phone, whatsapp, google maps venue, description).
-- 3. Creates public.booking_emergency_reports table for post-cutoff escalations.
-- 4. Database triggers to auto-derive cancellation_cutoff_at (event_start_at - 120 hours).
-- 5. Hardened database trigger prohibiting cancellation within 120 hours of event start time.
-- 6. RPC public.get_secure_booking_details (server-side masking of contacts prior to cutoff).
-- 7. RPC public.cancel_vendor_booking (enforces 120h cutoff).
-- 8. RPC public.cancel_customer_booking (enforces customer authorization & 120h cutoff).
-- 9. RPC public.report_booking_emergency (logs emergency report and alerts Admin).

begin;

-- 1. Extend public.vendor_bookings with cancellation & contact columns
alter table public.vendor_bookings
  add column if not exists event_start_at timestamptz,
  add column if not exists cancellation_cutoff_at timestamptz,
  add column if not exists customer_contact_number text,
  add column if not exists customer_whatsapp_number text,
  add column if not exists service_map_url text,
  add column if not exists booking_description text,
  add column if not exists contact_unlocked_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text check (cancelled_by in ('customer', 'vendor', 'admin', 'system')),
  add column if not exists emergency_status text not null default 'none'
    check (emergency_status in ('none', 'reported', 'investigating', 'resolved')),
  add column if not exists emergency_reported_at timestamptz,
  add column if not exists emergency_reason text;

-- Backfill legacy records: compute event_start_at & cancellation_cutoff_at
-- If event_start_at is null, construct safely from event_date at 10:00:00 IST (+05:30)
update public.vendor_bookings
set event_start_at = coalesce(
      event_start_at,
      (event_date::text || ' 10:00:00+05:30')::timestamptz
    )
where event_start_at is null and event_date is not null;

update public.vendor_bookings
set cancellation_cutoff_at = event_start_at - interval '5 days'
where cancellation_cutoff_at is null and event_start_at is not null;

-- Backfill contact numbers from legacy customer_phone if missing
update public.vendor_bookings
set customer_contact_number = coalesce(customer_contact_number, customer_phone),
    customer_whatsapp_number = coalesce(customer_whatsapp_number, customer_phone)
where customer_contact_number is null and customer_phone is not null;

-- Index for cutoff queries and background reconciliation
create index if not exists vendor_bookings_cutoff_idx
  on public.vendor_bookings (cancellation_cutoff_at, booking_status);

create index if not exists vendor_bookings_event_start_idx
  on public.vendor_bookings (event_start_at);

-- 2. Trigger function to compute cancellation_cutoff_at automatically
create or replace function private.compute_booking_cutoff()
returns trigger
language plpgsql
as $$
begin
  -- Resolve event_start_at if missing
  if new.event_start_at is null and new.event_date is not null then
    new.event_start_at := (new.event_date::text || ' 10:00:00+05:30')::timestamptz;
  end if;

  -- Canonical 120-hour cancellation cutoff
  if new.event_start_at is not null then
    new.cancellation_cutoff_at := new.event_start_at - interval '5 days';
  end if;

  -- Default contact numbers from customer_phone if not passed
  if new.customer_contact_number is null and new.customer_phone is not null then
    new.customer_contact_number := new.customer_phone;
  end if;
  if new.customer_whatsapp_number is null and new.customer_contact_number is not null then
    new.customer_whatsapp_number := new.customer_contact_number;
  end if;

  -- If booking is confirmed and already at or past cutoff, set contact_unlocked_at
  if new.booking_status = 'confirmed' and new.cancellation_cutoff_at is not null and now() >= new.cancellation_cutoff_at then
    if new.contact_unlocked_at is null then
      new.contact_unlocked_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_compute_booking_cutoff on public.vendor_bookings;
create trigger trg_compute_booking_cutoff
before insert or update of event_start_at, event_date, booking_status on public.vendor_bookings
for each row execute function private.compute_booking_cutoff();

-- 3. Hardened Trigger: Prohibit cancellation after 120-hour cutoff across all direct updates
create or replace function private.enforce_booking_cancellation_cutoff()
returns trigger
language plpgsql
as $$
begin
  -- Only trigger when transitioning a confirmed booking to cancelled
  if old.booking_status = 'confirmed'
     and new.booking_status in ('cancelled', 'cancelled_by_vendor', 'cancelled_by_customer') then

    -- Admins are exempt for manual dispute resolution
    if not private.is_admin() then
      if old.cancellation_cutoff_at is not null and now() >= old.cancellation_cutoff_at then
        raise exception 'Cancellation window closed. Cancellation is strictly prohibited within 120 hours (5 days) of the event start time.'
          using errcode = '22023';
      end if;
    end if;

    -- Record cancellation audit fields
    if new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
    if new.cancelled_by is null then
      if new.booking_status = 'cancelled_by_vendor' then
        new.cancelled_by := 'vendor';
      elsif new.booking_status = 'cancelled_by_customer' then
        new.cancelled_by := 'customer';
      else
        new.cancelled_by := 'system';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_cancellation_cutoff on public.vendor_bookings;
create trigger trg_enforce_cancellation_cutoff
before update on public.vendor_bookings
for each row execute function private.enforce_booking_cancellation_cutoff();

-- 4. Create public.booking_emergency_reports table
create table if not exists public.booking_emergency_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.vendor_bookings(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_role text not null check (reporter_role in ('customer', 'vendor')),
  reason text not null,
  description text not null,
  status text not null default 'pending'
    check (status in ('pending', 'investigating', 'resolved', 'dismissed')),
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_emergency_reports_booking_idx
  on public.booking_emergency_reports (booking_id);

create index if not exists booking_emergency_reports_status_idx
  on public.booking_emergency_reports (status, created_at desc);

drop trigger if exists booking_emergency_reports_set_updated_at on public.booking_emergency_reports;
create trigger booking_emergency_reports_set_updated_at
before update on public.booking_emergency_reports
for each row execute function private.set_updated_at();

alter table public.booking_emergency_reports enable row level security;

-- Policies for emergency reports
drop policy if exists "emergency_reports_admin_all" on public.booking_emergency_reports;
create policy "emergency_reports_admin_all"
on public.booking_emergency_reports for all to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "emergency_reports_reporter_select" on public.booking_emergency_reports;
create policy "emergency_reports_reporter_select"
on public.booking_emergency_reports for select to authenticated
using (
  reporter_id = auth.uid()
  or exists (
    select 1 from public.vendor_bookings vb
    where vb.id = booking_emergency_reports.booking_id
      and (vb.customer_id = auth.uid() or private.owns_vendor(vb.vendor_id))
  )
);

drop policy if exists "emergency_reports_insert_policy" on public.booking_emergency_reports;
create policy "emergency_reports_insert_policy"
on public.booking_emergency_reports for insert to authenticated
with check (
  exists (
    select 1 from public.vendor_bookings vb
    where vb.id = booking_emergency_reports.booking_id
      and (vb.customer_id = auth.uid() or private.owns_vendor(vb.vendor_id))
  )
);

-- 5. RPC: cancel_vendor_booking (Updated with 120-hour cutoff validation)
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

  -- 2. Verify authorization: caller must own the vendor or be an admin
  if not private.owns_vendor(v_booking.vendor_id) and not private.is_admin() then
    raise exception 'Unauthorized: You do not own this vendor' using errcode = '42501';
  end if;

  -- Idempotency check: already cancelled
  if v_booking.booking_status in ('cancelled_by_vendor', 'cancelled', 'cancelled_by_customer') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  -- 3. ENFORCE 120-HOUR CUTOFF: If confirmed and past cutoff, block normal cancellation
  if v_booking.booking_status = 'confirmed' and not private.is_admin() then
    if v_booking.cancellation_cutoff_at is not null and now() >= v_booking.cancellation_cutoff_at then
      raise exception 'Cancellation window closed. Cancellation is unavailable within 5 days (120 hours) of the event.'
        using errcode = '22023';
    end if;
  end if;

  -- Fetch vendor business name
  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  v_refund_amount := case
    when v_booking.payment_status = 'paid_advance' then coalesce(v_booking.advance_amount, 0)
    else 0
  end;

  -- 4. Atomically update booking status
  update public.vendor_bookings
  set booking_status = 'cancelled_by_vendor',
      rejection_reason = cancel_reason,
      cancellation_reason = cancel_reason,
      cancelled_at = now(),
      cancelled_by = 'vendor',
      refund_status = case when v_refund_amount > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amount > 0 then v_refund_amount else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = target_booking_id;

  -- 5. Atomically create Admin refund queue entry if advance was paid
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

  -- 6. Dispatched persistent customer notification with 72h refund SLA
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
      'Your booking for ' || coalesce(v_booking.event_type, 'Wedding') || ' on ' || v_booking.event_date::text || ' has been cancelled by ' || coalesce(v_vendor_name, 'the vendor') || '. ' ||
      case
        when v_refund_amount > 0 then 'Your paid advance of ₹' || v_refund_amount::text || ' has been queued for a full 72-hour refund to your original payment method.'
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

  -- 7. Notify Admins
  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path
  ) values (
    'Booking Cancelled by Vendor: #' || v_booking.ticket_id,
    'Vendor ' || coalesce(v_vendor_name, 'Vendor') || ' cancelled booking #' || v_booking.ticket_id || '. Reason: ' || coalesce(cancel_reason, 'No reason given'),
    'booking_cancelled',
    '/AdminBookings?tab=cancelled'
  );

  return jsonb_build_object(
    'success', true,
    'booking_status', 'cancelled_by_vendor',
    'refund_status', case when v_refund_amount > 0 then 'pending' else null end,
    'refund_amount', v_refund_amount,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 6. RPC: cancel_customer_booking (Customer cancels confirmed booking before cutoff)
create or replace function public.cancel_customer_booking(
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

  -- 2. Verify authorization: caller must be the customer or an admin
  if (v_booking.customer_id is null or auth.uid() <> v_booking.customer_id) and not private.is_admin() then
    raise exception 'Unauthorized: You do not own this booking' using errcode = '42501';
  end if;

  -- Idempotency check: already cancelled
  if v_booking.booking_status in ('cancelled_by_customer', 'cancelled', 'cancelled_by_vendor') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  -- 3. ENFORCE 120-HOUR CUTOFF
  if not private.is_admin() then
    if v_booking.cancellation_cutoff_at is not null and now() >= v_booking.cancellation_cutoff_at then
      raise exception 'Cancellation window closed. Cancellation is strictly prohibited within 5 days (120 hours) of the event start time.'
        using errcode = '22023';
    end if;
  end if;

  -- Fetch vendor business name
  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  v_refund_amount := case
    when v_booking.payment_status = 'paid_advance' then coalesce(v_booking.advance_amount, 0)
    else 0
  end;

  -- 4. Atomically update booking status
  update public.vendor_bookings
  set booking_status = 'cancelled_by_customer',
      rejection_reason = cancel_reason,
      cancellation_reason = cancel_reason,
      cancelled_at = now(),
      cancelled_by = 'customer',
      refund_status = case when v_refund_amount > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amount > 0 then v_refund_amount else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = target_booking_id;

  -- 5. Queue refund if advance was paid
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
      coalesce(nullif(cancel_reason, ''), 'Cancelled by customer')
    )
    on conflict (booking_id) do nothing;
  end if;

  -- 6. Dispatched vendor notification
  insert into public.vendor_notifications (
    vendor_id,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_booking.vendor_id,
    'Booking Cancelled by Customer',
    'Customer ' || v_booking.customer_name || ' has cancelled booking #' || v_booking.ticket_id || ' for ' || v_booking.event_date::text || '. Reason: ' || coalesce(cancel_reason, 'No reason provided'),
    '/VendorBookings?tab=cancelled',
    jsonb_build_object(
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id,
      'booking_status', 'cancelled_by_customer'
    )
  );

  -- 7. Notify Admins
  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path
  ) values (
    'Booking Cancelled by Customer: #' || v_booking.ticket_id,
    'Customer ' || v_booking.customer_name || ' cancelled booking #' || v_booking.ticket_id || '. Refund queued: ₹' || v_refund_amount::text,
    'booking_cancelled',
    '/AdminBookings?tab=cancelled'
  );

  return jsonb_build_object(
    'success', true,
    'booking_status', 'cancelled_by_customer',
    'refund_status', case when v_refund_amount > 0 then 'pending' else null end,
    'refund_amount', v_refund_amount,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 7. RPC: report_booking_emergency (Escalate emergency without auto-cancelling)
create or replace function public.report_booking_emergency(
  target_booking_id uuid,
  p_reason text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_role text;
  v_report_id uuid;
begin
  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- Determine caller role
  if auth.uid() = v_booking.customer_id then
    v_role := 'customer';
  elsif private.owns_vendor(v_booking.vendor_id) then
    v_role := 'vendor';
  elsif private.is_admin() then
    v_role := 'customer'; -- or admin
  else
    raise exception 'Unauthorized to report emergency for this booking' using errcode = '42501';
  end if;

  -- Insert into emergency reports table
  insert into public.booking_emergency_reports (
    booking_id,
    reporter_id,
    reporter_role,
    reason,
    description,
    status
  ) values (
    v_booking.id,
    auth.uid(),
    v_role,
    p_reason,
    p_description,
    'pending'
  )
  returning id into v_report_id;

  -- Update booking emergency flag
  update public.vendor_bookings
  set emergency_status = 'reported',
      emergency_reported_at = now(),
      emergency_reason = p_reason,
      updated_at = now()
  where id = target_booking_id;

  -- Alert RoyalLagn Admin Console
  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path
  ) values (
    '🚨 EMERGENCY REPORTED: #' || v_booking.ticket_id,
    'Emergency filed by ' || upper(v_role) || ' on booking #' || v_booking.ticket_id || ' (' || v_booking.event_date::text || '): ' || p_reason || ' - ' || p_description,
    'booking_emergency',
    '/AdminBookings?tab=confirmed'
  );

  return jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'emergency_status', 'reported'
  );
end;
$$;

-- 8. RPC: get_secure_booking_details (Server-side contact unmasking based on 120h cutoff & confirmed status)
create or replace function public.get_secure_booking_details(
  p_booking_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_vendor record;
  v_caller_is_admin boolean;
  v_caller_is_vendor boolean;
  v_caller_is_customer boolean;
  v_cutoff_passed boolean;
  v_is_confirmed boolean;
  v_contacts_unlocked boolean;
  v_can_cancel boolean;
  v_sanitized_customer jsonb;
  v_sanitized_vendor jsonb;
begin
  -- Resolve booking by UUID, booking_id, or ticket_id
  select * into v_booking
  from public.vendor_bookings
  where id::text = p_booking_ref
     or booking_id = p_booking_ref
     or ticket_id = p_booking_ref
  limit 1;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- Fetch vendor details
  select id, business_name, contact_phone, city, logo_url, slug into v_vendor
  from public.vendors
  where id = v_booking.vendor_id;

  -- Assess authorization
  v_caller_is_admin := private.is_admin();
  v_caller_is_vendor := private.owns_vendor(v_booking.vendor_id);
  v_caller_is_customer := (v_booking.customer_id is not null and auth.uid() = v_booking.customer_id);

  if not (v_caller_is_admin or v_caller_is_vendor or v_caller_is_customer) then
    raise exception 'Unauthorized to access this booking' using errcode = '42501';
  end if;

  -- Policy logic:
  -- Cutoff passed = now() >= cancellation_cutoff_at
  v_cutoff_passed := (v_booking.cancellation_cutoff_at is not null and now() >= v_booking.cancellation_cutoff_at);
  -- Only genuinely CONFIRMED bookings unlock contact details
  v_is_confirmed := (v_booking.booking_status = 'confirmed');
  v_contacts_unlocked := (v_is_confirmed and v_cutoff_passed) or v_caller_is_admin;
  -- Can cancel only if confirmed AND before cutoff (or admin)
  v_can_cancel := (v_is_confirmed and not v_cutoff_passed) or v_caller_is_admin;

  -- Mask customer details for vendor prior to unlock
  if v_caller_is_customer or v_caller_is_admin or v_contacts_unlocked then
    v_sanitized_customer := jsonb_build_object(
      'name', v_booking.customer_name,
      'phone', coalesce(v_booking.customer_contact_number, v_booking.customer_phone),
      'whatsapp', coalesce(v_booking.customer_whatsapp_number, v_booking.customer_phone),
      'email', v_booking.customer_email,
      'service_map_url', v_booking.service_map_url,
      'booking_description', v_booking.booking_description
    );
  else
    -- Vendor view before cutoff: contact details are locked
    v_sanitized_customer := jsonb_build_object(
      'name', v_booking.customer_name,
      'phone', null,
      'whatsapp', null,
      'email', null,
      'service_map_url', null,
      'booking_description', null
    );
  end if;

  -- Mask vendor contact details for customer prior to unlock
  if v_caller_is_vendor or v_caller_is_admin or v_contacts_unlocked then
    v_sanitized_vendor := jsonb_build_object(
      'id', v_vendor.id,
      'business_name', v_vendor.business_name,
      'contact_phone', v_vendor.contact_phone,
      'city', v_vendor.city,
      'logo_url', v_vendor.logo_url,
      'slug', v_vendor.slug
    );
  else
    -- Customer view before cutoff: vendor direct phone is locked
    v_sanitized_vendor := jsonb_build_object(
      'id', v_vendor.id,
      'business_name', v_vendor.business_name,
      'contact_phone', null,
      'city', v_vendor.city,
      'logo_url', v_vendor.logo_url,
      'slug', v_vendor.slug
    );
  end if;

  return jsonb_build_object(
    'id', v_booking.id,
    'booking_id', v_booking.booking_id,
    'ticket_id', v_booking.ticket_id,
    'booking_status', v_booking.booking_status,
    'payment_status', v_booking.payment_status,
    'event_date', v_booking.event_date,
    'start_date', v_booking.start_date,
    'end_date', v_booking.end_date,
    'total_days', v_booking.total_days,
    'event_type', v_booking.event_type,
    'event_start_at', v_booking.event_start_at,
    'cancellation_cutoff_at', v_booking.cancellation_cutoff_at,
    'is_cutoff_passed', v_cutoff_passed,
    'contacts_unlocked', v_contacts_unlocked,
    'can_cancel', v_can_cancel,
    'total_amount', v_booking.total_amount,
    'advance_amount', v_booking.advance_amount,
    'due_amount', v_booking.due_amount,
    'package_title', v_booking.package_title,
    'selected_packages', v_booking.selected_packages,
    'add_ons', v_booking.add_ons,
    'special_notes', v_booking.special_notes,
    'refund_status', v_booking.refund_status,
    'refund_amount', v_booking.refund_amount,
    'rejection_reason', v_booking.rejection_reason,
    'cancellation_reason', v_booking.cancellation_reason,
    'cancelled_at', v_booking.cancelled_at,
    'cancelled_by', v_booking.cancelled_by,
    'emergency_status', v_booking.emergency_status,
    'emergency_reported_at', v_booking.emergency_reported_at,
    'emergency_reason', v_booking.emergency_reason,
    'created_at', v_booking.created_at,
    'customer', v_sanitized_customer,
    'vendor', v_sanitized_vendor,
    'caller_role', case
      when v_caller_is_admin then 'admin'
      when v_caller_is_vendor then 'vendor'
      else 'customer'
    end
  );
end;
$$;

-- Grant permissions on new RPCs
grant execute on function public.cancel_vendor_booking(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_customer_booking(uuid, text) to authenticated, service_role;
grant execute on function public.report_booking_emergency(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_secure_booking_details(text) to authenticated, service_role;

commit;
