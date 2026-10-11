-- Migration: 20261007171500_sync_referral_profile_balances.sql
-- Synchronizes referral_profiles wallet balances strictly with the ledger (referral_commissions & referral_payout_requests)

begin;

-- 1. Ledger Reconciliation Function (Idempotent single source of truth)
create or replace function public.reconcile_referral_profile_balances(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending numeric(12, 2);
  v_earned numeric(12, 2);
  v_paid numeric(12, 2);
  v_succ_count int;
  v_tot_count int;
begin
  if p_customer_id is null then
    return;
  end if;

  select coalesce(sum(referrer_reward), 0)
  into v_pending
  from public.referral_commissions
  where referrer_id = p_customer_id and status = 'pending';

  select coalesce(sum(amount), 0)
  into v_paid
  from public.referral_payout_requests
  where customer_id = p_customer_id and status = 'processed';

  select coalesce(sum(referrer_reward), 0)
  into v_earned
  from public.referral_commissions
  where referrer_id = p_customer_id and status = 'earned';

  select coalesce(count(*), 0)
  into v_succ_count
  from public.referral_commissions
  where referrer_id = p_customer_id and status = 'earned';

  select greatest(
    coalesce((select count(*) from public.referral_attributions where referrer_customer_id = p_customer_id), 0),
    coalesce((select count(*) from public.referral_commissions where referrer_id = p_customer_id), 0)
  )
  into v_tot_count;

  update public.referral_profiles
  set pending_earnings = v_pending,
      earned_balance = greatest(0, v_earned - v_paid),
      total_paid_out = v_paid,
      successful_referrals = v_succ_count,
      total_referrals = v_tot_count,
      updated_at = timezone('utc', now())
  where customer_id = p_customer_id;
end;
$$;

-- 2. Trigger functions for automatic ledger synchronization
create or replace function public.trigger_sync_referral_commission_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.reconcile_referral_profile_balances(NEW.referrer_id);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    perform public.reconcile_referral_profile_balances(NEW.referrer_id);
    if OLD.referrer_id is not null and OLD.referrer_id <> NEW.referrer_id then
      perform public.reconcile_referral_profile_balances(OLD.referrer_id);
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    perform public.reconcile_referral_profile_balances(OLD.referrer_id);
    return OLD;
  end if;
  return null;
end;
$$;

create or replace function public.trigger_sync_payout_request_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP in ('INSERT', 'UPDATE') then
    perform public.reconcile_referral_profile_balances(NEW.customer_id);
    if TG_OP = 'UPDATE' and OLD.customer_id is not null and OLD.customer_id <> NEW.customer_id then
      perform public.reconcile_referral_profile_balances(OLD.customer_id);
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    perform public.reconcile_referral_profile_balances(OLD.customer_id);
    return OLD;
  end if;
  return null;
end;
$$;

create or replace function public.trigger_sync_attribution_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP in ('INSERT', 'UPDATE') then
    perform public.reconcile_referral_profile_balances(NEW.referrer_customer_id);
    if TG_OP = 'UPDATE' and OLD.referrer_customer_id is not null and OLD.referrer_customer_id <> NEW.referrer_customer_id then
      perform public.reconcile_referral_profile_balances(OLD.referrer_customer_id);
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    perform public.reconcile_referral_profile_balances(OLD.referrer_customer_id);
    return OLD;
  end if;
  return null;
end;
$$;

-- 3. Attach triggers to tables
drop trigger if exists trig_sync_referral_commissions on public.referral_commissions;
create trigger trig_sync_referral_commissions
after insert or update of status, referrer_reward, referrer_id or delete
on public.referral_commissions
for each row execute function public.trigger_sync_referral_commission_balances();

drop trigger if exists trig_sync_referral_payouts on public.referral_payout_requests;
create trigger trig_sync_referral_payouts
after insert or update of status, amount, customer_id or delete
on public.referral_payout_requests
for each row execute function public.trigger_sync_payout_request_balances();

drop trigger if exists trig_sync_referral_attributions on public.referral_attributions;
create trigger trig_sync_referral_attributions
after insert or update of referrer_customer_id or delete
on public.referral_attributions
for each row execute function public.trigger_sync_attribution_counts();

-- 4. Update record_booking_referral_commission to rely on reconciliation
create or replace function public.record_booking_referral_commission(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_ref_code text;
  v_referrer_id uuid;
  v_calc jsonb;
  v_ref_reward numeric;
  v_rl_cut numeric;
  v_total_cut numeric;
  v_slab text;
  v_comm_rec public.referral_commissions;
begin
  select * into v_booking
  from public.vendor_bookings
  where id = p_booking_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'booking_not_found');
  end if;

  -- RULE 1 GUARD: Commission MUST NOT be created before payment is verified!
  if coalesce(v_booking.payment_status, '') not in ('paid_advance', 'paid')
     or v_booking.booking_status in ('pending_payment', 'cancelled_by_vendor', 'cancelled_by_customer', 'cancelled') then
    return jsonb_build_object('success', false, 'reason', 'payment_not_verified');
  end if;

  -- RULE 8 GUARD: Check if commission record already exists (idempotency & duplicate protection)
  select * into v_comm_rec
  from public.referral_commissions
  where booking_record_id = p_booking_id;

  if found then
    return jsonb_build_object(
      'success', true,
      'already_exists', true,
      'commission_id', v_comm_rec.id,
      'status', v_comm_rec.status
    );
  end if;

  -- RULE 9 GUARD: PERSISTED ATTRIBUTION IS THE SOURCE OF TRUTH
  if v_booking.customer_id is not null then
    select referrer_customer_id, referral_code into v_referrer_id, v_ref_code
    from public.referral_attributions
    where referred_customer_id = v_booking.customer_id;
  end if;

  if v_referrer_id is null then
    v_ref_code := upper(trim(coalesce(v_booking.referral_code, '')));

    if v_ref_code <> '' then
      select customer_id into v_referrer_id
      from public.referral_profiles
      where referral_code = v_ref_code;

      if not found then
        select id into v_referrer_id
        from public.profiles
        where referral_code = v_ref_code;
      end if;

      if v_referrer_id is not null and v_booking.customer_id is not null and v_referrer_id <> v_booking.customer_id then
        insert into public.referral_attributions (
          referrer_customer_id,
          referred_customer_id,
          referral_code,
          attribution_source
        ) values (
          v_referrer_id,
          v_booking.customer_id,
          v_ref_code,
          'checkout'
        )
        on conflict (referred_customer_id) do nothing;
      end if;
    end if;
  end if;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_referrer');
  end if;

  -- RULE 14 GUARD: Self-referral prevention
  if v_referrer_id = v_booking.customer_id then
    return jsonb_build_object('success', false, 'reason', 'self_referral_blocked');
  end if;

  -- RULE 4 GUARD: Calculate commission strictly on TOTAL BOOKING VALUE
  v_calc := public.calculate_referral_commission(v_booking.total_amount);
  v_ref_reward := (v_calc ->> 'referrer_reward')::numeric;
  v_rl_cut := (v_calc ->> 'royallagn_commission')::numeric;
  v_total_cut := (v_calc ->> 'total_commission')::numeric;
  v_slab := v_calc ->> 'slab';

  if v_ref_reward <= 0 and v_rl_cut <= 0 then
    return jsonb_build_object(
      'success', true,
      'zero_commission', true,
      'booking_total', v_booking.total_amount,
      'slab', v_slab
    );
  end if;

  insert into public.referral_commissions (
    booking_id,
    booking_record_id,
    ticket_id,
    referrer_id,
    referred_customer_id,
    referral_code,
    booking_total,
    advance_paid,
    remaining_due,
    commission_slab,
    referrer_reward,
    royallagn_commission,
    total_commission,
    status,
    payout_status
  ) values (
    v_booking.booking_id,
    v_booking.id,
    v_booking.ticket_id,
    v_referrer_id,
    v_booking.customer_id,
    v_ref_code,
    coalesce(v_booking.total_amount, 0),
    coalesce(v_booking.advance_amount, 0),
    coalesce(v_booking.due_amount, 0),
    v_slab,
    v_ref_reward,
    v_rl_cut,
    v_total_cut,
    'pending',
    'unpaid'
  )
  returning * into v_comm_rec;

  -- Reconcile balances from ledger
  perform public.reconcile_referral_profile_balances(v_referrer_id);

  -- Notify referrer about pending reward
  insert into public.customer_notifications (
    customer_id,
    type,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_referrer_id,
    'referral_pending',
    'Pending Referral Reward: ₹' || v_ref_reward::text,
    'A friend booked with your referral code! You have ₹' || v_ref_reward::text || ' pending commission awaiting vendor confirmation.',
    '/(tabs)/referral',
    jsonb_build_object(
      'commission_id', v_comm_rec.id,
      'booking_id', v_booking.booking_id,
      'reward_amount', v_ref_reward,
      'slab', v_slab
    )
  );

  return jsonb_build_object(
    'success', true,
    'commission_id', v_comm_rec.id,
    'referrer_reward', v_ref_reward,
    'royallagn_commission', v_rl_cut,
    'slab', v_slab,
    'status', 'pending'
  );
end;
$$;

-- 5. Update confirm_vendor_booking to rely on reconciliation
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
  v_comm record;
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

  if v_booking.booking_status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'booking_id', v_booking.booking_id,
      'ticket_id', v_booking.ticket_id
    );
  end if;

  if v_booking.booking_status not in ('pending_vendor_confirmation', 'pending') then
    raise exception 'Booking cannot be confirmed from current status: %', v_booking.booking_status using errcode = '22023';
  end if;

  v_ticket_id := coalesce(nullif(v_booking.ticket_id, ''), 'RL-' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8)));

  select business_name into v_vendor_name
  from public.vendors
  where id = v_booking.vendor_id;

  update public.vendor_bookings
  set booking_status = 'confirmed',
      ticket_id = v_ticket_id,
      soft_lock_expires_at = null,
      updated_at = now()
  where id = target_booking_id;

  -- Transition referral commission from PENDING -> EARNED
  update public.referral_commissions
  set status = 'earned',
      ticket_id = v_ticket_id,
      updated_at = now()
  where booking_record_id = target_booking_id and status = 'pending'
  returning * into v_comm;

  if v_comm.id is not null then
    -- Reconcile balances from ledger
    perform public.reconcile_referral_profile_balances(v_comm.referrer_id);

    -- Notify referrer
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_comm.referrer_id,
      'referral_earned',
      'Referral Reward Earned: ₹' || v_comm.referrer_reward::text,
      'Vendor confirmed booking #' || v_ticket_id || '! ₹' || v_comm.referrer_reward::text || ' has been added to your withdrawable balance.',
      '/(tabs)/referral',
      jsonb_build_object(
        'commission_id', v_comm.id,
        'reward_amount', v_comm.referrer_reward,
        'ticket_id', v_ticket_id
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

  return jsonb_build_object(
    'success', true,
    'booking_status', 'confirmed',
    'ticket_id', v_ticket_id,
    'booking_id', v_booking.booking_id,
    'referral_earned', (v_comm.id is not null)
  );
end;
$$;

-- 6. Update cancel_vendor_booking to rely on reconciliation
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

    -- Reconcile balances from ledger
    perform public.reconcile_referral_profile_balances(v_ref_id);

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

-- 7. Update process_admin_refund to rely on reconciliation
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

    -- Reconcile balances from ledger
    perform public.reconcile_referral_profile_balances(v_ref_id);
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

-- 8. One-time ledger reconciliation for all existing referral profiles
do $$
declare
  r record;
begin
  for r in select customer_id from public.referral_profiles loop
    perform public.reconcile_referral_profile_balances(r.customer_id);
  end loop;
end;
$$;

-- 9. Grants
grant execute on function public.reconcile_referral_profile_balances(uuid) to authenticated, anon, service_role;
grant execute on function public.trigger_sync_referral_commission_balances() to authenticated, anon, service_role;
grant execute on function public.trigger_sync_payout_request_balances() to authenticated, anon, service_role;
grant execute on function public.trigger_sync_attribution_counts() to authenticated, anon, service_role;

commit;
