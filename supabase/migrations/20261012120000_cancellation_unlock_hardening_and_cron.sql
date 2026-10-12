-- Migration: 20261012120000_cancellation_unlock_hardening_and_cron.sql
-- RoyalLagn 5-Day Cancellation Lock & Contact Unlock: Hardening, Cancellation Reason column, and Scheduled Unlock Routine

begin;

-- 1. Ensure cancellation_reason column exists on public.vendor_bookings
alter table public.vendor_bookings
  add column if not exists cancellation_reason text;

-- 2. Update trigger to strictly enforce cutoff on cancellations
create or replace function private.enforce_booking_cancellation_cutoff()
returns trigger
language plpgsql
as $$
begin
  -- Only trigger when transitioning a confirmed booking to cancelled
  if old.booking_status = 'confirmed'
     and new.booking_status in ('cancelled', 'cancelled_by_vendor', 'cancelled_by_customer') then

    -- Only human admin with explicit cancelled_by = 'admin' can override for dispute mediation
    if not (private.is_admin() and coalesce(new.cancelled_by, '') = 'admin') then
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

-- 3. Update cancel_vendor_booking RPC with is_admin_or_service support and cutoff lock
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
  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not private.owns_vendor(v_booking.vendor_id) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: You do not own this vendor' using errcode = '42501';
  end if;

  if v_booking.booking_status in ('cancelled_by_vendor', 'cancelled', 'cancelled_by_customer') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  -- 120-hour lock: Vendors cannot cancel inside cutoff
  if v_booking.booking_status = 'confirmed' then
    if v_booking.cancellation_cutoff_at is not null and now() >= v_booking.cancellation_cutoff_at then
      raise exception 'Cancellation window closed. Cancellation is unavailable within 5 days (120 hours) of the event.'
        using errcode = '22023';
    end if;
  end if;

  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  v_refund_amount := case
    when v_booking.payment_status = 'paid_advance' then coalesce(v_booking.advance_amount, 0)
    else 0
  end;

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

-- 4. Update cancel_customer_booking RPC with is_admin_or_service support and cutoff lock
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
  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if (v_booking.customer_id is null or auth.uid() <> v_booking.customer_id) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: You do not own this booking' using errcode = '42501';
  end if;

  if v_booking.booking_status in ('cancelled_by_customer', 'cancelled', 'cancelled_by_vendor') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
  end if;

  -- 120-hour lock: Customers cannot cancel inside cutoff
  if v_booking.cancellation_cutoff_at is not null and now() >= v_booking.cancellation_cutoff_at then
    raise exception 'Cancellation window closed. Cancellation is strictly prohibited within 5 days (120 hours) of the event start time.'
      using errcode = '22023';
  end if;

  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  v_refund_amount := case
    when v_booking.payment_status = 'paid_advance' then coalesce(v_booking.advance_amount, 0)
    else 0
  end;

  update public.vendor_bookings
  set booking_status = 'cancelled_by_customer',
      cancellation_reason = cancel_reason,
      cancelled_at = now(),
      cancelled_by = 'customer',
      refund_status = case when v_refund_amount > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amount > 0 then v_refund_amount else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = target_booking_id;

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
      coalesce(nullif(cancel_reason, ''), 'Customer cancelled booking')
    )
    on conflict (booking_id) do nothing;
  end if;

  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path
  ) values (
    'Customer Cancelled Booking: #' || v_booking.ticket_id,
    'Customer ' || coalesce(v_booking.customer_name, 'Customer') || ' cancelled ticket #' || v_booking.ticket_id || ' with ' || coalesce(v_vendor_name, 'Vendor') || '. Refund of ₹' || v_refund_amount::text || ' queued. Reason: ' || coalesce(cancel_reason, 'None'),
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

-- 5. Update report_booking_emergency RPC
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

  if (v_booking.customer_id is not null and auth.uid() = v_booking.customer_id) then
    v_role := 'customer';
  elsif private.owns_vendor(v_booking.vendor_id) then
    v_role := 'vendor';
  elsif private.is_admin_or_service() then
    v_role := 'customer';
  else
    raise exception 'Unauthorized to report emergency for this booking' using errcode = '42501';
  end if;

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

  update public.vendor_bookings
  set emergency_status = 'reported',
      emergency_reported_at = now(),
      emergency_reason = p_reason,
      updated_at = now()
  where id = target_booking_id;

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

-- 6. Update get_secure_booking_details RPC
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

  v_cutoff_passed := (v_booking.cancellation_cutoff_at is not null and now() >= v_booking.cancellation_cutoff_at);
  v_is_confirmed := (v_booking.booking_status = 'confirmed');
  v_contacts_unlocked := (v_is_confirmed and v_cutoff_passed);
  v_can_cancel := (v_is_confirmed and not v_cutoff_passed) or v_caller_is_admin;

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
    'cancellation_reason', coalesce(v_booking.cancellation_reason, v_booking.rejection_reason),
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

-- 7. Automated Scheduled Contact Unlock and Notification Dispatcher
create or replace function public.process_scheduled_booking_contact_unlocks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b record;
  v_count integer := 0;
  v_vendor_name text;
begin
  for v_b in
    select b.id, b.booking_id, b.ticket_id, b.customer_id, b.vendor_id, b.event_date, b.event_type
    from public.vendor_bookings b
    where b.booking_status = 'confirmed'
      and b.cancellation_cutoff_at is not null
      and now() >= b.cancellation_cutoff_at
      and b.contact_unlocked_at is null
    for update skip locked
  loop
    update public.vendor_bookings
    set contact_unlocked_at = now(),
        updated_at = now()
    where id = v_b.id;

    select business_name into v_vendor_name
    from public.vendors
    where id = v_b.vendor_id;

    -- Send customer notification
    if v_b.customer_id is not null then
      insert into public.customer_notifications (
        customer_id,
        type,
        title,
        message,
        target_path,
        metadata
      ) values (
        v_b.customer_id,
        'contact_unlocked',
        'Direct Contacts Unlocked: #' || v_b.ticket_id,
        'Your event is within 5 days! Direct contact details for ' || coalesce(v_vendor_name, 'your vendor') || ' are now unlocked for coordination.',
        '/ticket?ticket_id=' || v_b.ticket_id || '&booking_id=' || v_b.booking_id,
        jsonb_build_object(
          'booking_id', v_b.booking_id,
          'ticket_id', v_b.ticket_id,
          'vendor_id', v_b.vendor_id
        )
      );
    end if;

    -- Send admin log
    insert into public.admin_notifications (
      title,
      body,
      kind,
      target_path
    ) values (
      'Contacts Unlocked: #' || v_b.ticket_id,
      'Booking #' || v_b.ticket_id || ' entered the 120-hour event window. Contacts automatically unlocked for customer & vendor.',
      'contact_unlocked',
      '/AdminBookings?tab=confirmed'
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'unlocked_count', v_count,
    'processed_at', now()
  );
end;
$$;

-- Grant permissions
grant execute on function public.cancel_vendor_booking(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_customer_booking(uuid, text) to authenticated, service_role;
grant execute on function public.report_booking_emergency(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_secure_booking_details(text) to authenticated, service_role;
grant execute on function public.process_scheduled_booking_contact_unlocks() to authenticated, service_role;

commit;
