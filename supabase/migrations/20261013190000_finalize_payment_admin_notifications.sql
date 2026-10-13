-- Migration: 20261013190000_finalize_payment_admin_notifications.sql
-- Updates finalize_verified_booking_payment to atomically insert into public.admin_notifications

begin;

create or replace function public.finalize_verified_booking_payment(
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

  -- Cannot finalize payment on cancelled or rejected bookings
  if v_booking.booking_status in ('cancelled', 'rejected') then
    raise exception 'Cannot finalize payment for % booking', v_booking.booking_status using errcode = '22000';
  end if;

  -- Validate order ID match if both are present
  if v_booking.razorpay_order_id is not null and p_order_id is not null and v_booking.razorpay_order_id <> p_order_id then
    raise exception 'Order ID mismatch: reservation order is %, provided order is %', v_booking.razorpay_order_id, p_order_id
      using errcode = '22000';
  end if;

  -- Idempotent: If already marked as paid/confirmed, return immediately without duplicate notifications
  if v_booking.booking_status in ('pending_vendor_confirmation', 'confirmed')
     and v_booking.payment_status = 'paid_advance' then
    return jsonb_build_object(
      'success', true,
      'already_finalized', true,
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id,
      'booking_status', v_booking.booking_status
    );
  end if;

  -- Finalize booking payment atomically
  update public.vendor_bookings
  set booking_status = 'pending_vendor_confirmation',
      payment_status = 'paid_advance',
      razorpay_payment_id = p_payment_id,
      razorpay_order_id = coalesce(p_order_id, razorpay_order_id),
      soft_lock_expires_at = null,
      updated_at = now()
  where id = p_booking_id;

  -- Fetch vendor business name for notification
  select coalesce(business_name, 'Wedding Vendor') into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  -- Create vendor notification
  insert into public.vendor_notifications (
    vendor_id,
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    v_booking.vendor_id,
    'New Booking Request (30% Advance Received)!',
    format('%s booked for %s. Advance of ₹%s paid via Razorpay. Please review and confirm within 24 hours.',
      v_booking.customer_name,
      to_char(v_booking.event_date, 'DD Mon YYYY'),
      v_booking.advance_amount
    ),
    'booking_request',
    '/VendorBookings',
    false
  );

  -- Create admin notification
  insert into public.admin_notifications (
    title,
    body,
    kind,
    target_path,
    is_read
  ) values (
    format('New Booking: %s (Ticket #%s)', coalesce(v_booking.package_title, 'Wedding Service'), v_booking.ticket_id),
    format('%s booked %s with %s. 30%% Advance of ₹%s paid via Razorpay.',
      v_booking.customer_name,
      coalesce(v_booking.package_title, 'Service'),
      v_vendor_name,
      v_booking.advance_amount
    ),
    'booking_request',
    '/AdminBookings',
    false
  );

  -- Create customer notification if customer user exists
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
      'booking_pending_confirmation',
      'Booking Request Sent to Vendor',
      format('Your 30%% advance of ₹%s has been received. Your booking request is awaiting vendor confirmation.', v_booking.advance_amount),
      format('/ticket?ticket_id=%s&booking_id=%s', v_booking.ticket_id, v_booking.booking_id),
      jsonb_build_object('booking_id', v_booking.booking_id, 'ticket_id', v_booking.ticket_id)
    );
  end if;

  -- Record referral commission if eligible
  begin
    perform public.record_booking_referral_commission(p_booking_id);
  exception when others then
    -- Non-fatal to payment finalization
  end;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.booking_id,
    'ticket_id', v_booking.ticket_id,
    'booking_status', 'pending_vendor_confirmation'
  );
end;
$$;

revoke execute on function public.finalize_verified_booking_payment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_verified_booking_payment(uuid, text, text, text) to service_role;

commit;
