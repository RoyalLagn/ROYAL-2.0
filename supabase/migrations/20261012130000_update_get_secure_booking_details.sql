-- Migration: 20261012130000_update_get_secure_booking_details.sql
-- Ensure contacts_unlocked reports true policy state for booking (confirmed AND cutoff passed)

begin;

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
  -- Policy state for the booking itself: contacts unlock strictly when confirmed AND cutoff has passed
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

grant execute on function public.get_secure_booking_details(text) to authenticated, service_role;

commit;
