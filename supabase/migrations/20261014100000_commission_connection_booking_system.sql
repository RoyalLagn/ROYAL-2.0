-- Migration: 20261014100000_commission_connection_booking_system.sql
-- RoyalLagn Commission-Based Booking & Contact Connection Workflow

begin;

-- 1. Schema extensions on public.vendor_bookings
alter table if exists public.vendor_bookings
  add column if not exists booking_fee_amount numeric(12, 2) not null default 0,
  add column if not exists referral_commission_amount numeric(12, 2) not null default 0,
  add column if not exists royallagn_commission_amount numeric(12, 2) not null default 0,
  add column if not exists admin_verified_at timestamptz,
  add column if not exists forwarded_to_vendor_at timestamptz,
  add column if not exists vendor_accepted_at timestamptz,
  add column if not exists vendor_rejected_at timestamptz,
  add column if not exists admin_cancelled_at timestamptz,
  add column if not exists admin_cancellation_reason text;

create index if not exists vendor_bookings_new_status_idx
  on public.vendor_bookings (booking_status, created_at desc);

-- 2. Expand status constraints
alter table public.vendor_bookings
  drop constraint if exists vendor_bookings_status_valid;

alter table public.vendor_bookings
  add constraint vendor_bookings_status_valid
  check (booking_status in (
    'ADMIN_PENDING',
    'VENDOR_PENDING',
    'ACCEPTED',
    'CUSTOMER_CANCELLED',
    'ADMIN_CANCELLED',
    'VENDOR_REJECTED',
    'admin_pending',
    'vendor_pending',
    'accepted',
    'customer_cancelled',
    'admin_cancelled',
    'vendor_rejected',
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
    'paid_booking_fee',
    'free_zero_fee',
    'paid',
    'failed',
    'refunded'
  ));

alter table public.booking_refund_requests
  drop constraint if exists booking_refund_requests_status_check;

alter table public.booking_refund_requests
  add constraint booking_refund_requests_status_check
  check (status in (
    'pending',
    'processing',
    'refunded',
    'failed',
    'REFUND_PENDING',
    'REFUND_PROCESSING',
    'REFUND_SUCCESSFUL',
    'REFUND_FAILED'
  ));

-- 3. RPC: finalize_connection_booking_fee
create or replace function public.finalize_connection_booking_fee(
  p_booking_id uuid,
  p_payment_id text,
  p_order_id text default null,
  p_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_vendor_name text := 'Wedding Vendor';
  v_calc jsonb;
  v_ref_reward numeric := 0;
  v_rl_cut numeric := 0;
  v_fee numeric := 0;
  v_has_referral boolean := false;
  v_ref_code text;
begin
  if not private.is_admin_or_service() then
    raise exception 'Unauthorized: Service or admin role required' using errcode = '42501';
  end if;

  if p_payment_id is null or trim(p_payment_id) = '' then
    raise exception 'Valid Razorpay payment ID is required' using errcode = '22000';
  end if;

  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.booking_status in ('CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'VENDOR_REJECTED', 'cancelled', 'rejected') then
    raise exception 'Cannot finalize payment for % booking', v_booking.booking_status using errcode = '22000';
  end if;

  if v_booking.razorpay_order_id is not null and p_order_id is not null and v_booking.razorpay_order_id <> p_order_id then
    raise exception 'Order ID mismatch: reservation order is %, provided order is %', v_booking.razorpay_order_id, p_order_id
      using errcode = '22000';
  end if;

  if v_booking.booking_status in ('ADMIN_PENDING', 'VENDOR_PENDING', 'ACCEPTED', 'confirmed')
     and v_booking.payment_status in ('paid_advance', 'paid_booking_fee', 'paid') then
    return jsonb_build_object(
      'success', true,
      'already_finalized', true,
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id,
      'booking_status', v_booking.booking_status,
      'booking_fee_amount', coalesce(v_booking.booking_fee_amount, v_booking.advance_amount)
    );
  end if;

  v_calc := public.calculate_referral_commission(v_booking.total_amount);
  v_fee := (v_calc ->> 'total_commission')::numeric;
  v_ref_code := upper(trim(coalesce(v_booking.referral_code, '')));

  if v_ref_code <> '' then
    if exists (select 1 from public.referral_profiles where referral_code = v_ref_code)
       or exists (select 1 from public.profiles where referral_code = v_ref_code) then
      v_has_referral := true;
      v_ref_reward := (v_calc ->> 'referrer_reward')::numeric;
      v_rl_cut := (v_calc ->> 'royallagn_commission')::numeric;
    end if;
  end if;

  if not v_has_referral then
    v_ref_reward := 0;
    v_rl_cut := v_fee;
  end if;

  update public.vendor_bookings
  set booking_status = 'ADMIN_PENDING',
      payment_status = 'paid_advance',
      booking_fee_amount = v_fee,
      referral_commission_amount = v_ref_reward,
      royallagn_commission_amount = v_rl_cut,
      advance_amount = v_fee,
      due_amount = greatest(0, v_booking.total_amount - v_fee),
      razorpay_payment_id = p_payment_id,
      razorpay_order_id = coalesce(p_order_id, razorpay_order_id),
      soft_lock_expires_at = null,
      updated_at = now()
  where id = p_booking_id;

  select coalesce(business_name, 'Wedding Vendor') into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    format('New Booking Fee Paid: Ticket #%s', v_booking.ticket_id),
    format('%s paid ₹%s booking fee for %s (%s). Please verify vendor availability and forward to vendor.',
      v_booking.customer_name,
      v_fee,
      v_vendor_name,
      coalesce(v_booking.package_title, 'Service')
    ),
    'booking_request',
    '/AdminBookings',
    false
  );

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
      'booking_admin_pending',
      'Booking Fee Received — Under Verification',
      format('Your booking fee of ₹%s has been successfully received. RoyalLagn is verifying vendor availability before forwarding.', v_fee),
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object(
        'booking_id', v_booking.booking_id,
        'ticket_id', v_booking.ticket_id,
        'booking_fee', v_fee
      )
    );
  end if;

  begin
    perform public.record_booking_referral_commission(p_booking_id);
  exception when others then
  end;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.booking_id,
    'ticket_id', v_booking.ticket_id,
    'booking_status', 'ADMIN_PENDING',
    'booking_fee_amount', v_fee
  );
end;
$$;

-- 4. RPC: create_zero_fee_booking (₹0 - ₹2,998 bookings)
create or replace function public.create_zero_fee_booking(
  p_vendor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_event_date date default current_date,
  p_start_date date default null,
  p_end_date date default null,
  p_total_days integer default 1,
  p_event_type text default 'Wedding',
  p_package_id uuid default null,
  p_package_title text default 'Wedding Service',
  p_total_amount numeric default 0,
  p_selected_packages jsonb default '[]'::jsonb,
  p_add_ons jsonb default '[]'::jsonb,
  p_special_notes text default null,
  p_referral_code text default null,
  p_customer_contact_number text default null,
  p_customer_whatsapp_number text default null,
  p_service_map_url text default null,
  p_booking_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id text;
  v_ticket_id text;
  v_id uuid;
  v_vendor_name text := 'Wedding Vendor';
  v_customer_id uuid := auth.uid();
begin
  if p_total_amount >= 2999 then
    raise exception 'Zero-fee checkout is only valid for service totals under ₹2,999. Current total: ₹%', p_total_amount
      using errcode = '22023';
  end if;

  v_booking_id := 'bkg_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  v_ticket_id := 'RL' || floor(10000 + random() * 90000)::text;

  select coalesce(business_name, 'Wedding Vendor') into v_vendor_name
  from public.vendors
  where id = p_vendor_id;

  insert into public.vendor_bookings (
    booking_id,
    ticket_id,
    vendor_id,
    customer_id,
    customer_name,
    customer_phone,
    customer_email,
    event_date,
    start_date,
    end_date,
    total_days,
    event_type,
    package_id,
    package_title,
    package_price,
    total_amount,
    booking_fee_amount,
    referral_commission_amount,
    royallagn_commission_amount,
    advance_amount,
    due_amount,
    booking_status,
    payment_status,
    source,
    selected_packages,
    add_ons,
    special_notes,
    referral_code,
    customer_contact_number,
    customer_whatsapp_number,
    service_map_url,
    booking_description
  ) values (
    v_booking_id,
    v_ticket_id,
    p_vendor_id,
    v_customer_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_event_date,
    coalesce(p_start_date, p_event_date),
    coalesce(p_end_date, p_event_date),
    greatest(1, coalesce(p_total_days, 1)),
    coalesce(p_event_type, 'Wedding'),
    p_package_id,
    p_package_title,
    p_total_amount,
    p_total_amount,
    0,
    0,
    0,
    0,
    p_total_amount,
    'ADMIN_PENDING',
    'free_zero_fee',
    'online',
    coalesce(p_selected_packages, '[]'::jsonb),
    coalesce(p_add_ons, '[]'::jsonb),
    p_special_notes,
    p_referral_code,
    coalesce(p_customer_contact_number, p_customer_phone),
    coalesce(p_customer_whatsapp_number, p_customer_phone),
    p_service_map_url,
    p_booking_description
  ) returning id into v_id;

  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    format('New Booking (₹0 Fee): Ticket #%s', v_ticket_id),
    format('%s booked %s (%s) under the zero-fee tier. Please verify vendor availability and forward to vendor.',
      p_customer_name,
      v_vendor_name,
      p_package_title
    ),
    'booking_request',
    '/AdminBookings',
    false
  );

  return jsonb_build_object(
    'success', true,
    'booking_record_id', v_id,
    'booking_id', v_booking_id,
    'ticket_id', v_ticket_id,
    'booking_status', 'ADMIN_PENDING',
    'booking_fee_amount', 0
  );
end;
$$;

-- 5. RPC: admin_forward_booking_to_vendor
create or replace function public.admin_forward_booking_to_vendor(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_vendor_name text := 'Wedding Vendor';
begin
  if not private.is_admin_or_service() then
    raise exception 'Unauthorized: Service or admin role required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.booking_status in ('CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'VENDOR_REJECTED', 'cancelled', 'rejected') then
    raise exception 'Cannot forward cancelled or rejected booking' using errcode = '22023';
  end if;

  if v_booking.booking_status in ('VENDOR_PENDING', 'vendor_pending', 'ACCEPTED', 'confirmed') then
    return jsonb_build_object(
      'success', true,
      'already_forwarded', true,
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id,
      'booking_status', v_booking.booking_status
    );
  end if;

  update public.vendor_bookings
  set booking_status = 'VENDOR_PENDING',
      admin_verified_at = coalesce(admin_verified_at, now()),
      forwarded_to_vendor_at = now(),
      updated_at = now()
  where id = p_booking_id;

  select coalesce(business_name, 'Wedding Vendor') into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  insert into public.vendor_notifications (
    vendor_id,
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    v_booking.vendor_id,
    'New Booking Request Forwarded by Admin!',
    format('%s has requested a booking for %s (Ticket #%s). Please review and accept or decline.',
      v_booking.customer_name,
      to_char(v_booking.event_date, 'DD Mon YYYY'),
      v_booking.ticket_id
    ),
    'booking_request',
    '/VendorBookings',
    false
  );

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
      'booking_vendor_pending',
      'Booking Request Sent to Vendor',
      format('Admin has verified your request with %s. The request is now awaiting vendor dashboard acceptance.', v_vendor_name),
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object('booking_id', v_booking.booking_id, 'ticket_id', v_booking.ticket_id)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.booking_id,
    'ticket_id', v_booking.ticket_id,
    'booking_status', 'VENDOR_PENDING'
  );
end;
$$;

-- 6. RPC: admin_cancel_booking
create or replace function public.admin_cancel_booking(
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_refund_amt numeric := 0;
  v_comm public.referral_commissions;
begin
  if not private.is_admin_or_service() then
    raise exception 'Unauthorized: Service or admin role required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.booking_status in ('ACCEPTED', 'confirmed') then
    raise exception 'Cannot cancel booking after formal vendor acceptance' using errcode = '22023';
  end if;

  if v_booking.booking_status in ('ADMIN_CANCELLED', 'CUSTOMER_CANCELLED', 'VENDOR_REJECTED', 'cancelled') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  v_refund_amt := coalesce(nullif(v_booking.booking_fee_amount, 0), v_booking.advance_amount, 0);

  update public.vendor_bookings
  set booking_status = 'ADMIN_CANCELLED',
      admin_cancelled_at = now(),
      cancelled_at = now(),
      cancelled_by = 'admin',
      admin_cancellation_reason = p_reason,
      cancellation_reason = p_reason,
      refund_status = case when v_refund_amt > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amt > 0 then v_refund_amt else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = p_booking_id;

  if v_refund_amt > 0 then
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
      v_refund_amt,
      'pending',
      coalesce(nullif(p_reason, ''), 'Cancelled by Admin')
    )
    on conflict (booking_id) do update
      set amount = v_refund_amt,
          status = 'pending',
          reason = coalesce(nullif(p_reason, ''), 'Cancelled by Admin');
  end if;

  update public.referral_commissions
  set status = 'cancelled',
      updated_at = now()
  where booking_record_id = p_booking_id
    and status = 'pending'
  returning * into v_comm;

  if found and v_comm.referrer_reward > 0 then
    update public.referral_profiles
    set pending_earnings = greatest(0, pending_earnings - v_comm.referrer_reward),
        updated_at = now()
    where customer_id = v_comm.referrer_id;
  end if;

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
      'booking_cancelled_admin',
      'Booking Request Cancelled by RoyalLagn',
      case
        when v_refund_amt > 0 then format('Your booking was cancelled (%s). Your 100%% booking fee of ₹%s has been queued for a full refund.', coalesce(p_reason, 'Vendor unavailable'), v_refund_amt)
        else format('Your zero-fee booking was cancelled (%s).', coalesce(p_reason, 'Vendor unavailable'))
      end,
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object('booking_id', v_booking.booking_id, 'refund_amount', v_refund_amt)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_status', 'ADMIN_CANCELLED',
    'refund_amount', v_refund_amt,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 7. RPC: vendor_accept_booking
create or replace function public.vendor_accept_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_vendor_name text := 'Wedding Vendor';
  v_comm public.referral_commissions;
begin
  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not (private.owns_vendor(v_booking.vendor_id) or private.is_admin_or_service()) then
    raise exception 'Unauthorized: Caller does not own this vendor' using errcode = '42501';
  end if;

  if v_booking.booking_status in ('CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'VENDOR_REJECTED', 'cancelled', 'rejected') then
    raise exception 'Cannot accept booking: already %', v_booking.booking_status using errcode = '22023';
  end if;

  if v_booking.booking_status in ('ACCEPTED', 'accepted', 'confirmed') then
    return jsonb_build_object(
      'success', true,
      'already_accepted', true,
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id,
      'booking_status', v_booking.booking_status
    );
  end if;

  if v_booking.booking_status not in ('VENDOR_PENDING', 'vendor_pending', 'pending_vendor_confirmation', 'pending') then
    raise exception 'Booking cannot be accepted from current status: %', v_booking.booking_status using errcode = '22023';
  end if;

  update public.vendor_bookings
  set booking_status = 'ACCEPTED',
      vendor_accepted_at = now(),
      contact_unlocked_at = now(),
      updated_at = now()
  where id = p_booking_id;

  select coalesce(business_name, 'Wedding Vendor') into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  update public.referral_commissions
  set status = 'earned',
      updated_at = now()
  where booking_record_id = p_booking_id
    and status = 'pending'
  returning * into v_comm;

  if found and v_comm.referrer_reward > 0 then
    update public.referral_profiles
    set pending_earnings = greatest(0, pending_earnings - v_comm.referrer_reward),
        earned_balance = earned_balance + v_comm.referrer_reward,
        successful_referrals = successful_referrals + 1,
        updated_at = now()
    where customer_id = v_comm.referrer_id;
  end if;

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
      'booking_accepted',
      'Booking Confirmed! Contacts Unlocked',
      format('%s has formally accepted your booking! Direct contact details are now unlocked on your booking ticket.', v_vendor_name),
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object('booking_id', v_booking.booking_id, 'ticket_id', v_booking.ticket_id)
    );
  end if;

  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    format('Booking Accepted: Ticket #%s', v_booking.ticket_id),
    format('Vendor %s has formally accepted booking #%s for customer %s.', v_vendor_name, v_booking.ticket_id, v_booking.customer_name),
    'booking_confirmed',
    '/AdminBookings',
    false
  );

  return jsonb_build_object(
    'success', true,
    'booking_status', 'ACCEPTED',
    'booking_id', v_booking.booking_id,
    'ticket_id', v_booking.ticket_id,
    'contact_unlocked', true
  );
end;
$$;

-- 8. RPC: vendor_reject_booking
create or replace function public.vendor_reject_booking(
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_vendor_name text := 'Wedding Vendor';
  v_refund_amt numeric := 0;
  v_comm public.referral_commissions;
begin
  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not (private.owns_vendor(v_booking.vendor_id) or private.is_admin_or_service()) then
    raise exception 'Unauthorized: Caller does not own this vendor' using errcode = '42501';
  end if;

  if v_booking.booking_status in ('ACCEPTED', 'confirmed') then
    raise exception 'Cannot reject booking after formal vendor acceptance' using errcode = '22023';
  end if;

  if v_booking.booking_status in ('VENDOR_REJECTED', 'CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'cancelled') then
    return jsonb_build_object(
      'success', true,
      'already_rejected', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  v_refund_amt := coalesce(nullif(v_booking.booking_fee_amount, 0), v_booking.advance_amount, 0);

  update public.vendor_bookings
  set booking_status = 'VENDOR_REJECTED',
      vendor_rejected_at = now(),
      cancelled_at = now(),
      cancelled_by = 'vendor',
      rejection_reason = p_reason,
      cancellation_reason = p_reason,
      refund_status = case when v_refund_amt > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amt > 0 then v_refund_amt else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = p_booking_id;

  select coalesce(business_name, 'Wedding Vendor') into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  if v_refund_amt > 0 then
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
      v_refund_amt,
      'pending',
      coalesce(nullif(p_reason, ''), 'Rejected by vendor')
    )
    on conflict (booking_id) do update
      set amount = v_refund_amt,
          status = 'pending',
          reason = coalesce(nullif(p_reason, ''), 'Rejected by vendor');
  end if;

  update public.referral_commissions
  set status = 'cancelled',
      updated_at = now()
  where booking_record_id = p_booking_id
    and status = 'pending'
  returning * into v_comm;

  if found and v_comm.referrer_reward > 0 then
    update public.referral_profiles
    set pending_earnings = greatest(0, pending_earnings - v_comm.referrer_reward),
        updated_at = now()
    where customer_id = v_comm.referrer_id;
  end if;

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
      'booking_rejected_vendor',
      'Booking Request Declined by Vendor',
      case
        when v_refund_amt > 0 then format('Vendor %s was unable to accept your request (%s). Your 100%% booking fee of ₹%s has been queued for a full refund.', v_vendor_name, coalesce(p_reason, 'Vendor unavailable'), v_refund_amt)
        else format('Vendor %s was unable to accept your request (%s).', v_vendor_name, coalesce(p_reason, 'Vendor unavailable'))
      end,
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object('booking_id', v_booking.booking_id, 'refund_amount', v_refund_amt)
    );
  end if;

  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    format('Booking Rejected by Vendor: Ticket #%s', v_booking.ticket_id),
    format('Vendor %s declined booking for %s. Reason: %s. 100%% refund of ₹%s queued.',
      v_vendor_name,
      v_booking.customer_name,
      coalesce(p_reason, 'None'),
      v_refund_amt
    ),
    'booking_cancelled',
    '/AdminBookings',
    false
  );

  return jsonb_build_object(
    'success', true,
    'booking_status', 'VENDOR_REJECTED',
    'refund_amount', v_refund_amt,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 9. RPC: customer_cancel_booking
create or replace function public.customer_cancel_booking(
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_refund_amt numeric := 0;
  v_comm public.referral_commissions;
begin
  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if (v_booking.customer_id is null or auth.uid() <> v_booking.customer_id) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: You do not own this booking' using errcode = '42501';
  end if;

  if v_booking.booking_status in ('ACCEPTED', 'accepted', 'confirmed') then
    raise exception 'Cancellation prohibited: Booking has already been formally accepted by the vendor.' using errcode = '22023';
  end if;

  if v_booking.booking_status in ('CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'VENDOR_REJECTED', 'cancelled') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  v_refund_amt := coalesce(nullif(v_booking.booking_fee_amount, 0), v_booking.advance_amount, 0);

  update public.vendor_bookings
  set booking_status = 'CUSTOMER_CANCELLED',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason = p_reason,
      rejection_reason = p_reason,
      refund_status = case when v_refund_amt > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amt > 0 then v_refund_amt else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = p_booking_id;

  if v_refund_amt > 0 then
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
      v_refund_amt,
      'pending',
      coalesce(nullif(p_reason, ''), 'Cancelled by customer before acceptance')
    )
    on conflict (booking_id) do update
      set amount = v_refund_amt,
          status = 'pending',
          reason = coalesce(nullif(p_reason, ''), 'Cancelled by customer before acceptance');
  end if;

  update public.referral_commissions
  set status = 'cancelled',
      updated_at = now()
  where booking_record_id = p_booking_id
    and status = 'pending'
  returning * into v_comm;

  if found and v_comm.referrer_reward > 0 then
    update public.referral_profiles
    set pending_earnings = greatest(0, pending_earnings - v_comm.referrer_reward),
        updated_at = now()
    where customer_id = v_comm.referrer_id;
  end if;

  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    format('Booking Cancelled by Customer: Ticket #%s', v_booking.ticket_id),
    format('Customer %s cancelled booking #%s before vendor acceptance. Full refund of ₹%s queued in Admin Refunds.',
      v_booking.customer_name,
      v_booking.ticket_id,
      v_refund_amt
    ),
    'booking_cancelled',
    '/AdminBookings',
    false
  );

  return jsonb_build_object(
    'success', true,
    'booking_status', 'CUSTOMER_CANCELLED',
    'refund_amount', v_refund_amt,
    'booking_id', v_booking.booking_id
  );
end;
$$;

-- 10. RPC: process_booking_refund
create or replace function public.process_booking_refund(
  p_booking_id uuid,
  p_refund_status text,
  p_txn_ref text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
begin
  if not private.is_admin_or_service() then
    raise exception 'Unauthorized: Service or admin role required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  update public.booking_refund_requests
  set status = p_refund_status,
      transaction_reference = coalesce(p_txn_ref, transaction_reference),
      notes = coalesce(p_notes, notes),
      processed_at = case when p_refund_status in ('refunded', 'REFUND_SUCCESSFUL') then now() else processed_at end,
      processed_by = auth.uid(),
      updated_at = now()
  where booking_id = p_booking_id;

  update public.vendor_bookings
  set refund_status = p_refund_status,
      refund_notes = coalesce(p_notes, refund_notes),
      refunded_at = case when p_refund_status in ('refunded', 'REFUND_SUCCESSFUL') then now() else refunded_at end,
      updated_at = now()
  where id = p_booking_id;

  if p_refund_status in ('refunded', 'REFUND_SUCCESSFUL') and v_booking.customer_id is not null then
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
      'Refund Completed Successfully',
      format('Your 100%% booking fee refund of ₹%s has been successfully processed to your original payment method. Ref: %s',
        coalesce(v_booking.refund_amount, v_booking.booking_fee_amount, v_booking.advance_amount),
        coalesce(p_txn_ref, 'Standard Gateway Refund')
      ),
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object('booking_id', v_booking.booking_id, 'txn_ref', p_txn_ref)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.booking_id,
    'refund_status', p_refund_status
  );
end;
$$;

-- 11. Updated RPC: get_secure_booking_details
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
  v_is_accepted boolean;
  v_contacts_unlocked boolean;
  v_can_cancel boolean;
  v_sanitized_customer jsonb;
  v_sanitized_vendor jsonb;
  v_fee_amount numeric;
begin
  select * into v_booking
  from public.vendor_bookings
  where id::text = p_booking_ref
     or booking_id = p_booking_ref
     or ticket_id = p_booking_ref
  limit 1;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  select id, business_name, contact_phone, city, logo_url, slug into v_vendor
  from public.vendors
  where id = v_booking.vendor_id;

  v_caller_is_admin := private.is_admin_or_service();
  v_caller_is_vendor := private.owns_vendor(v_booking.vendor_id);
  v_caller_is_customer := (v_booking.customer_id is not null and auth.uid() = v_booking.customer_id);

  if not (v_caller_is_admin or v_caller_is_vendor or v_caller_is_customer) then
    raise exception 'Unauthorized to access this booking' using errcode = '42501';
  end if;

  v_is_accepted := (v_booking.booking_status in ('ACCEPTED', 'accepted', 'confirmed'));
  v_contacts_unlocked := v_is_accepted;

  v_can_cancel := (not v_is_accepted and v_booking.booking_status not in ('CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'VENDOR_REJECTED', 'cancelled'))
                  or v_caller_is_admin;

  v_fee_amount := coalesce(nullif(v_booking.booking_fee_amount, 0), v_booking.advance_amount, 0);

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
    v_sanitized_customer := jsonb_build_object(
      'name', v_booking.customer_name,
      'phone', null,
      'whatsapp', null,
      'email', null,
      'service_map_url', null,
      'booking_description', null
    );
  end if;

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
    'contacts_unlocked', v_contacts_unlocked,
    'can_cancel', v_can_cancel,
    'total_amount', v_booking.total_amount,
    'booking_fee_amount', v_fee_amount,
    'referral_commission_amount', v_booking.referral_commission_amount,
    'royallagn_commission_amount', v_booking.royallagn_commission_amount,
    'advance_amount', v_fee_amount,
    'due_amount', greatest(0, v_booking.total_amount - v_fee_amount),
    'package_title', v_booking.package_title,
    'selected_packages', v_booking.selected_packages,
    'add_ons', v_booking.add_ons,
    'special_notes', v_booking.special_notes,
    'refund_status', v_booking.refund_status,
    'refund_amount', v_booking.refund_amount,
    'rejection_reason', v_booking.rejection_reason,
    'cancellation_reason', coalesce(v_booking.cancellation_reason, v_booking.rejection_reason),
    'cancelled_at', v_booking.cancelled_at,
    'cancelled_by', v_booking.cancelled_by,
    'vendor_accepted_at', v_booking.vendor_accepted_at,
    'admin_verified_at', v_booking.admin_verified_at,
    'forwarded_to_vendor_at', v_booking.forwarded_to_vendor_at,
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

-- 12. Update trigger enforce_booking_cancellation_cutoff: Prohibit post-acceptance cancellation
create or replace function private.enforce_booking_cancellation_cutoff()
returns trigger
language plpgsql
as $$
begin
  if old.booking_status in ('ACCEPTED', 'accepted', 'confirmed')
     and new.booking_status in ('CUSTOMER_CANCELLED', 'VENDOR_REJECTED', 'cancelled', 'cancelled_by_vendor', 'cancelled_by_customer') then
    if not private.is_admin() then
      raise exception 'Cancellation prohibited: Booking has already been formally accepted by the vendor.'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- Grants
grant execute on function public.finalize_connection_booking_fee(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.create_zero_fee_booking to authenticated, service_role;
grant execute on function public.admin_forward_booking_to_vendor(uuid) to authenticated, service_role;
grant execute on function public.admin_cancel_booking(uuid, text) to authenticated, service_role;
grant execute on function public.vendor_accept_booking(uuid) to authenticated, service_role;
grant execute on function public.vendor_reject_booking(uuid, text) to authenticated, service_role;
grant execute on function public.customer_cancel_booking(uuid, text) to authenticated, service_role;
grant execute on function public.process_booking_refund(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.get_secure_booking_details(text) to authenticated, service_role;

commit;
