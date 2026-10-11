-- Migration: 20261007160000_final_referral_commission_system.sql
-- RoyalLagn Final Referral + Commission System
-- Fixed Slabs calculated strictly on TOTAL BOOKING VALUE:
--   0 - 2,998: Referrer 0, RoyalLagn 0 (Total 0)
--   2,999 - 9,999: Referrer 250, RoyalLagn 250 (Total 500)
--   10,000 - 29,999: Referrer 500, RoyalLagn 500 (Total 1,000)
--   30,000 - 49,999: Referrer 1,000, RoyalLagn 1,000 (Total 2,000)
--   50,000 - 69,999: Referrer 2,000, RoyalLagn 2,000 (Total 4,000)
--   70,000 - 99,999: Referrer 3,000, RoyalLagn 3,000 (Total 6,000)
--   1,00,000 - 1,29,999: Referrer 4,000, RoyalLagn 4,000 (Total 8,000)
--   1,30,000 - 1,49,999: Referrer 5,000, RoyalLagn 5,000 (Total 10,000)
--   1,50,000 and above: Referrer 6,000, RoyalLagn 6,000 (Total 12,000, Capped)

begin;

-- 1. Ensure referral_code column exists on public.profiles
alter table if exists public.profiles
  add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_uniq_idx
  on public.profiles(referral_code)
  where referral_code is not null;

-- 2. Customer Referral Profiles Table
create table if not exists public.referral_profiles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null unique,
  referral_url text not null,
  total_referrals integer not null default 0,
  successful_referrals integer not null default 0,
  pending_earnings numeric(12, 2) not null default 0 check (pending_earnings >= 0),
  earned_balance numeric(12, 2) not null default 0 check (earned_balance >= 0),
  total_paid_out numeric(12, 2) not null default 0 check (total_paid_out >= 0),
  payout_mobile text,
  payout_beneficiary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_profiles_code_idx
  on public.referral_profiles(referral_code);

-- 3. Customer Referral Attributions Table (First-touch, immutable, no self-referral)
create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references auth.users(id) on delete cascade,
  referred_customer_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  attribution_source text not null default 'link',
  attributed_at timestamptz not null default now(),
  constraint referral_attributions_no_self_referral check (referrer_customer_id <> referred_customer_id)
);

create index if not exists referral_attributions_referrer_idx
  on public.referral_attributions(referrer_customer_id);

-- 4. Referral Commissions Ledger Table (Tied to direct bookings, 1 booking = max 1 commission)
create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null,
  booking_record_id uuid not null unique references public.vendor_bookings(id) on delete cascade,
  ticket_id text,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_customer_id uuid references auth.users(id) on delete set null,
  referral_code text not null,
  booking_total numeric(12, 2) not null check (booking_total >= 0),
  advance_paid numeric(12, 2) not null check (advance_paid >= 0),
  remaining_due numeric(12, 2) not null check (remaining_due >= 0),
  commission_slab text not null,
  referrer_reward numeric(12, 2) not null check (referrer_reward >= 0),
  royallagn_commission numeric(12, 2) not null check (royallagn_commission >= 0),
  total_commission numeric(12, 2) not null check (total_commission >= 0),
  status text not null default 'pending' check (status in ('pending', 'earned', 'cancelled', 'reversed')),
  payout_status text not null default 'unpaid' check (payout_status in ('unpaid', 'requested', 'paid', 'reversed')),
  payout_requested_at timestamptz,
  payout_paid_at timestamptz,
  payout_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_commissions_referrer_idx
  on public.referral_commissions(referrer_id, status);

create index if not exists referral_commissions_booking_rec_idx
  on public.referral_commissions(booking_record_id);

-- 5. Referral Payout Requests Table
create table if not exists public.referral_payout_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 500),
  mobile text not null,
  beneficiary_name text not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'rejected')),
  transaction_ref text,
  notes text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists referral_payout_requests_customer_idx
  on public.referral_payout_requests(customer_id, status);

-- 6. Updated at triggers
drop trigger if exists referral_profiles_set_updated_at on public.referral_profiles;
create trigger referral_profiles_set_updated_at
before update on public.referral_profiles
for each row execute function private.set_updated_at();

drop trigger if exists referral_commissions_set_updated_at on public.referral_commissions;
create trigger referral_commissions_set_updated_at
before update on public.referral_commissions
for each row execute function private.set_updated_at();

-- 7. Authoritative Commission Slab Calculator (IMMUTABLE)
create or replace function public.calculate_referral_commission(p_booking_total numeric)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_total numeric := coalesce(p_booking_total, 0);
  v_ref_reward numeric := 0;
  v_rl_commission numeric := 0;
  v_slab text := '0 - 2,998';
begin
  if v_total < 2999 then
    v_ref_reward := 0;
    v_rl_commission := 0;
    v_slab := '0 - 2,998';
  elsif v_total < 10000 then
    v_ref_reward := 250;
    v_rl_commission := 250;
    v_slab := '2,999 - 9,999';
  elsif v_total < 30000 then
    v_ref_reward := 500;
    v_rl_commission := 500;
    v_slab := '10,000 - 29,999';
  elsif v_total < 50000 then
    v_ref_reward := 1000;
    v_rl_commission := 1000;
    v_slab := '30,000 - 49,999';
  elsif v_total < 70000 then
    v_ref_reward := 2000;
    v_rl_commission := 2000;
    v_slab := '50,000 - 69,999';
  elsif v_total < 100000 then
    v_ref_reward := 3000;
    v_rl_commission := 3000;
    v_slab := '70,000 - 99,999';
  elsif v_total < 130000 then
    v_ref_reward := 4000;
    v_rl_commission := 4000;
    v_slab := '1,00,000 - 1,29,999';
  elsif v_total < 150000 then
    v_ref_reward := 5000;
    v_rl_commission := 5000;
    v_slab := '1,30,000 - 1,49,999';
  else
    v_ref_reward := 6000;
    v_rl_commission := 6000;
    v_slab := '1,50,000 and above';
  end if;

  return jsonb_build_object(
    'booking_total', v_total,
    'referrer_reward', v_ref_reward,
    'royallagn_commission', v_rl_commission,
    'total_commission', (v_ref_reward + v_rl_commission),
    'slab', v_slab
  );
end;
$$;

-- 8. Unique Referral Code Generator
create or replace function public.generate_unique_referral_code(p_prefix text default 'RL')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_len int := 6;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := coalesce(nullif(trim(p_prefix), ''), 'RL');
    for i in 1..v_len loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;

    if not exists (select 1 from public.referral_profiles where referral_code = v_code)
       and not exists (select 1 from public.profiles where referral_code = v_code) then
      return v_code;
    end if;

    if v_attempt > 50 then
      return 'RL' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    end if;
  end loop;
end;
$$;

-- 9. Ensure Customer Referral Profile (Auto-Provisioning)
create or replace function public.ensure_customer_referral_profile(
  p_customer_id uuid
)
returns public.referral_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.referral_profiles;
  v_prof public.profiles;
  v_code text;
  v_url text;
begin
  -- Check if profile already exists
  select * into v_rec
  from public.referral_profiles
  where customer_id = p_customer_id;

  if found then
    -- Ensure profiles table also has the code mirrored
    update public.profiles
    set referral_code = v_rec.referral_code
    where id = p_customer_id and (referral_code is null or referral_code <> v_rec.referral_code);

    return v_rec;
  end if;

  -- Verify user exists in public.profiles
  select * into v_prof
  from public.profiles
  where id = p_customer_id;

  if not found then
    raise exception 'Customer profile not found for id %', p_customer_id using errcode = 'P0002';
  end if;

  -- Generate code
  if v_prof.referral_code is not null and length(trim(v_prof.referral_code)) >= 4 then
    v_code := upper(trim(v_prof.referral_code));
  else
    v_code := public.generate_unique_referral_code('RL');
  end if;

  v_url := 'https://royallagn.com/?ref=' || v_code;

  -- Insert referral profile
  insert into public.referral_profiles (
    customer_id,
    referral_code,
    referral_url,
    total_referrals,
    successful_referrals,
    pending_earnings,
    earned_balance,
    total_paid_out
  ) values (
    p_customer_id,
    v_code,
    v_url,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (customer_id) do update set
    updated_at = now()
  returning * into v_rec;

  -- Mirror onto public.profiles
  update public.profiles
  set referral_code = v_code
  where id = p_customer_id;

  return v_rec;
end;
$$;

-- 10. Attribute Customer Referral Function (Handles Link / QR attribution)
create or replace function public.attribute_customer_referral(
  p_referred_id uuid,
  p_referral_code text,
  p_source text default 'link'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean_code text := upper(trim(coalesce(p_referral_code, '')));
  v_referrer_id uuid;
  v_existing record;
begin
  if v_clean_code = '' then
    return jsonb_build_object('success', false, 'reason', 'missing_code');
  end if;

  -- Find referrer customer ID
  select customer_id into v_referrer_id
  from public.referral_profiles
  where referral_code = v_clean_code;

  if not found then
    select id into v_referrer_id
    from public.profiles
    where referral_code = v_clean_code;
  end if;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'reason', 'invalid_code');
  end if;

  -- Block self-referral
  if v_referrer_id = p_referred_id then
    return jsonb_build_object('success', false, 'reason', 'self_referral_blocked');
  end if;

  -- Check if already attributed (immutable first touch)
  select * into v_existing
  from public.referral_attributions
  where referred_customer_id = p_referred_id;

  if found then
    return jsonb_build_object(
      'success', false,
      'reason', 'already_attributed',
      'referrer_id', v_existing.referrer_customer_id,
      'referral_code', v_existing.referral_code
    );
  end if;

  -- Insert attribution
  insert into public.referral_attributions (
    referrer_customer_id,
    referred_customer_id,
    referral_code,
    attribution_source
  ) values (
    v_referrer_id,
    p_referred_id,
    v_clean_code,
    coalesce(nullif(p_source, ''), 'link')
  );

  -- Increment total_referrals counter on referrer profile
  update public.referral_profiles
  set total_referrals = total_referrals + 1,
      updated_at = now()
  where customer_id = v_referrer_id;

  return jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'referral_code', v_clean_code
  );
end;
$$;

-- 11. Record Pending Commission for Booking Function
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
  v_referrer_id uuid;
  v_ref_code text;
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

  -- Check if commission record already exists (idempotency)
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

  -- Determine referrer
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
  end if;

  -- If not on booking, check customer's attribution
  if v_referrer_id is null and v_booking.customer_id is not null then
    select referrer_customer_id, referral_code into v_referrer_id, v_ref_code
    from public.referral_attributions
    where referred_customer_id = v_booking.customer_id;
  end if;

  -- No valid referrer found
  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_referrer');
  end if;

  -- Self-referral prevention: customer cannot refer themselves
  if v_referrer_id = v_booking.customer_id then
    return jsonb_build_object('success', false, 'reason', 'self_referral_blocked');
  end if;

  -- Calculate commission strictly on TOTAL BOOKING VALUE (NEVER on advance)
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

  -- Insert pending commission row
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

-- 12. Trigger on Customer Signup to auto-create referral profile
create or replace function public.trig_auto_provision_referral_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'public_user' then
    perform public.ensure_customer_referral_profile(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_public_profile_created_referral on public.profiles;
create trigger on_public_profile_created_referral
after insert or update of role on public.profiles
for each row execute function public.trig_auto_provision_referral_profile();

-- 13. Update complete_public_registration to guarantee referral profile provisioning
create or replace function public.complete_public_registration(
  full_name text,
  phone text default null,
  preferred_city_id uuid default null,
  preferred_area_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'You must verify your email before creating an account'
      using errcode = '42501';
  end if;
  if caller_email = '' then
    raise exception 'Your verified session does not carry an email address'
      using errcode = '42501';
  end if;
  if btrim(coalesce(full_name, '')) = '' then
    raise exception 'Enter your full name' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = caller_id and p.role <> 'public_user'
  ) then
    raise exception 'This email is already registered for a different RoyalLagn account'
      using errcode = '42501';
  end if;

  insert into public.profiles as p (
    id, email, full_name, phone, role, is_active,
    preferred_city_id, preferred_area_id
  )
  values (
    caller_id, caller_email, btrim(full_name), nullif(btrim(coalesce(phone, '')), ''),
    'public_user', true, preferred_city_id, preferred_area_id
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, p.phone),
    preferred_city_id = coalesce(excluded.preferred_city_id, p.preferred_city_id),
    preferred_area_id = coalesce(excluded.preferred_area_id, p.preferred_area_id),
    is_active = true
  returning * into result;

  -- Ensure referral account is provisioned immediately
  perform public.ensure_customer_referral_profile(caller_id);

  return result;
end;
$$;

-- 14. Update confirm_vendor_booking to transition commission from PENDING -> EARNED
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
    -- Move funds from pending to earned balance and increment successful referrals
    update public.referral_profiles
    set pending_earnings = greatest(0, pending_earnings - v_comm.referrer_reward),
        earned_balance = earned_balance + v_comm.referrer_reward,
        successful_referrals = successful_referrals + 1,
        updated_at = now()
    where customer_id = v_comm.referrer_id;

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

-- 15. Update cancel_vendor_booking to transition commission from PENDING -> CANCELLED
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

  -- Transition referral commission to CANCELLED
  declare
    v_old_status text;
    v_ref_id uuid;
    v_reward numeric;
  begin
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
  end;

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

-- 16. Update process_admin_refund to ensure commission is REVERSED
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

  -- Ensure referral commission is marked REVERSED
  declare
    v_old_status text;
    v_ref_id uuid;
    v_reward numeric;
  begin
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
  end;

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

-- 17. Security & Row Level Security (RLS)
alter table public.referral_profiles enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_commissions enable row level security;
alter table public.referral_payout_requests enable row level security;

-- referral_profiles policies
drop policy if exists "referral_profiles_own_select" on public.referral_profiles;
create policy "referral_profiles_own_select"
on public.referral_profiles for select to authenticated
using (customer_id = auth.uid() or private.is_admin());

drop policy if exists "referral_profiles_own_update" on public.referral_profiles;
create policy "referral_profiles_own_update"
on public.referral_profiles for update to authenticated
using (customer_id = auth.uid() or private.is_admin())
with check (customer_id = auth.uid() or private.is_admin());

-- referral_attributions policies
drop policy if exists "referral_attributions_own_select" on public.referral_attributions;
create policy "referral_attributions_own_select"
on public.referral_attributions for select to authenticated
using (referrer_customer_id = auth.uid() or referred_customer_id = auth.uid() or private.is_admin());

-- referral_commissions policies
drop policy if exists "referral_commissions_own_select" on public.referral_commissions;
create policy "referral_commissions_own_select"
on public.referral_commissions for select to authenticated
using (referrer_id = auth.uid() or private.is_admin());

-- referral_payout_requests policies
drop policy if exists "referral_payout_requests_own_select" on public.referral_payout_requests;
create policy "referral_payout_requests_own_select"
on public.referral_payout_requests for select to authenticated
using (customer_id = auth.uid() or private.is_admin());

drop policy if exists "referral_payout_requests_own_insert" on public.referral_payout_requests;
create policy "referral_payout_requests_own_insert"
on public.referral_payout_requests for insert to authenticated
with check (customer_id = auth.uid());

-- 18. Grants
grant execute on function public.calculate_referral_commission(numeric) to anon, authenticated, service_role;
grant execute on function public.generate_unique_referral_code(text) to anon, authenticated, service_role;
grant execute on function public.ensure_customer_referral_profile(uuid) to anon, authenticated, service_role;
grant execute on function public.attribute_customer_referral(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.record_booking_referral_commission(uuid) to anon, authenticated, service_role;

grant select, insert, update on public.referral_profiles to authenticated, service_role;
grant select, insert, update on public.referral_attributions to authenticated, service_role;
grant select, insert, update on public.referral_commissions to authenticated, service_role;
grant select, insert, update on public.referral_payout_requests to authenticated, service_role;

grant select on public.referral_profiles to anon;

-- 19. Backfill all existing public_user profiles
do $$
declare
  r record;
begin
  for r in (select id from public.profiles where role = 'public_user') loop
    perform public.ensure_customer_referral_profile(r.id);
  end loop;
end;
$$;

commit;
