-- Migration: 20261007163000_fix_referral_reversal_rpc.sql
-- Ensure cancel_vendor_booking and process_admin_refund inspect previous commission status before updating

begin;

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
  v_comm record;
  v_old_status text;
  v_ref_id uuid;
  v_reward numeric;
begin
  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not private.owns_vendor(v_booking.vendor_id) and not private.is_admin_or_service() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if v_booking.booking_status in ('cancelled_by_vendor', 'cancelled') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'booking_id', v_booking.booking_id,
      'refund_status', v_booking.refund_status
    );
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
      refund_status = case when v_refund_amount > 0 then 'pending' else null end,
      refund_amount = case when v_refund_amount > 0 then v_refund_amount else 0 end,
      soft_lock_expires_at = now(),
      updated_at = now()
  where id = target_booking_id;

  -- Create or update booking_refund_requests
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
    on conflict (booking_id) do update set
      amount = excluded.amount,
      status = 'pending',
      reason = excluded.reason,
      updated_at = now();
  end if;

  -- Transition referral commission to CANCELLED and revert balance correctly
  select status, referrer_id, referrer_reward into v_old_status, v_ref_id, v_reward
  from public.referral_commissions
  where booking_record_id = target_booking_id and status in ('pending', 'earned');

  if found then
    update public.referral_commissions
    set status = 'cancelled',
        updated_at = now()
    where booking_record_id = target_booking_id and status in ('pending', 'earned')
    returning * into v_comm;

    if v_old_status = 'pending' then
      update public.referral_profiles
      set pending_earnings = greatest(0, pending_earnings - v_reward),
          updated_at = now()
      where customer_id = v_ref_id;
    elsif v_old_status = 'earned' then
      update public.referral_profiles
      set earned_balance = greatest(0, earned_balance - v_reward),
          successful_referrals = greatest(0, successful_referrals - 1),
          updated_at = now()
      where customer_id = v_ref_id;
    end if;

    -- Notify referrer
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_ref_id,
      'referral_cancelled',
      'Referral Commission Cancelled',
      'Booking #' || v_booking.booking_id || ' was cancelled by the vendor. The associated referral commission has been reversed.',
      '/(tabs)/referral',
      jsonb_build_object(
        'commission_id', v_comm.id,
        'booking_id', v_booking.booking_id
      )
    );
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
  v_comm record;
  v_old_status text;
  v_ref_id uuid;
  v_reward numeric;
begin
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.vendor_bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  update public.vendor_bookings
  set refund_status = 'refunded',
      refunded_at = now(),
      refund_notes = coalesce(nullif(ref_notes, ''), 'Processed by admin'),
      updated_at = now()
  where id = target_booking_id;

  update public.booking_refund_requests
  set status = 'refunded',
      processed_at = now(),
      processed_by = auth.uid(),
      transaction_reference = txn_ref,
      notes = coalesce(nullif(ref_notes, ''), notes),
      updated_at = now()
  where booking_id = target_booking_id;

  -- Ensure referral commission is marked REVERSED and balances adjusted
  select status, referrer_id, referrer_reward into v_old_status, v_ref_id, v_reward
  from public.referral_commissions
  where booking_record_id = target_booking_id and status in ('pending', 'earned');

  if found then
    update public.referral_commissions
    set status = 'reversed',
        payout_status = case when payout_status = 'paid' then 'reversed' else payout_status end,
        updated_at = now()
    where booking_record_id = target_booking_id and status in ('pending', 'earned')
    returning * into v_comm;

    if v_old_status = 'pending' then
      update public.referral_profiles
      set pending_earnings = greatest(0, pending_earnings - v_reward),
          updated_at = now()
      where customer_id = v_ref_id;
    elsif v_old_status = 'earned' then
      update public.referral_profiles
      set earned_balance = greatest(0, earned_balance - v_reward),
          successful_referrals = greatest(0, successful_referrals - 1),
          updated_at = now()
      where customer_id = v_ref_id;
    end if;
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
      'refund_completed',
      'Refund Completed',
      'Your refund of ₹' || coalesce(v_booking.refund_amount, v_booking.advance_amount, 0)::text || ' for booking #' || v_booking.ticket_id || ' has been successfully processed.',
      '/ticket?ticket_id=' || v_booking.ticket_id || '&booking_id=' || v_booking.booking_id,
      jsonb_build_object(
        'ticket_id', v_booking.ticket_id,
        'booking_id', v_booking.booking_id,
        'refund_amount', coalesce(v_booking.refund_amount, v_booking.advance_amount, 0),
        'transaction_reference', txn_ref
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
