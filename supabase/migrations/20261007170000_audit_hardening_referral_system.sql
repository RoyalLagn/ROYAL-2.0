-- Migration: 20261007170000_audit_hardening_referral_system.sql
-- 1. Strictly enforce that referral commissions are NEVER created before payment verification.
-- 2. Strictly enforce that persisted referral_attributions is the authoritative source of truth (client cannot override).

begin;

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
  -- Booking must be in paid_advance / paid status, and not in pending_payment or cancelled state.
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
  -- 1. If customer exists, check persisted attribution first (client cannot override)
  if v_booking.customer_id is not null then
    select referrer_customer_id, referral_code into v_referrer_id, v_ref_code
    from public.referral_attributions
    where referred_customer_id = v_booking.customer_id;
  end if;

  -- 2. If no persisted attribution exists yet, inspect referral code from booking
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

      -- If valid code found and booking has customer, persist attribution now (first-touch immutable)
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

  -- No valid referrer found
  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_referrer');
  end if;

  -- RULE 14 GUARD: Self-referral prevention (customer cannot refer themselves)
  if v_referrer_id = v_booking.customer_id then
    return jsonb_build_object('success', false, 'reason', 'self_referral_blocked');
  end if;

  -- RULE 4 GUARD: Calculate commission strictly on TOTAL BOOKING VALUE (NEVER on advance)
  v_calc := public.calculate_referral_commission(v_booking.total_amount);
  v_ref_reward := (v_calc ->> 'referrer_reward')::numeric;
  v_rl_cut := (v_calc ->> 'royallagn_commission')::numeric;
  v_total_cut := (v_calc ->> 'total_commission')::numeric;
  v_slab := v_calc ->> 'slab';

  -- Nil slab check (bookings < 2,999 earn 0)
  if v_ref_reward <= 0 and v_rl_cut <= 0 then
    return jsonb_build_object(
      'success', true,
      'zero_commission', true,
      'booking_total', v_booking.total_amount,
      'slab', v_slab
    );
  end if;

  -- Insert pending commission row (protected by UNIQUE on booking_record_id)
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

  -- Update referrer's pending balance
  update public.referral_profiles
  set pending_earnings = pending_earnings + v_ref_reward,
      updated_at = now()
  where customer_id = v_referrer_id;

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

commit;
