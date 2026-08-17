begin;

-- ============================================================================
-- Real Razorpay gateway fee/tax capture.
--
-- These columns are populated ONLY by the payment webhook and
-- checkout-verification Edge Functions (server-side, using service-role
-- credentials, from Razorpay's own authoritative payment record). NULL means
-- "not captured" (payments verified before this migration, or Razorpay had
-- not yet reported fee/tax at capture time) and must never be treated as, or
-- displayed as, zero.
-- ============================================================================

alter table public.subscription_payments
  add column if not exists gateway_fee_minor bigint,
  add column if not exists gateway_tax_minor bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_payments_gateway_fee_nonnegative'
  ) then
    alter table public.subscription_payments
      add constraint subscription_payments_gateway_fee_nonnegative check (gateway_fee_minor is null or gateway_fee_minor >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_payments_gateway_tax_nonnegative'
  ) then
    alter table public.subscription_payments
      add constraint subscription_payments_gateway_tax_nonnegative check (gateway_tax_minor is null or gateway_tax_minor >= 0);
  end if;
end $$;

-- finance_transactions.gateway_fee already exists (numeric, default 0) but
-- cannot distinguish "genuinely zero" from "never captured". This flag lets
-- the Revenue dashboard show "Unavailable" for historical/uncaptured rows
-- instead of a fabricated zero.
alter table public.finance_transactions
  add column if not exists gateway_fee_captured boolean not null default false;

-- ----------------------------------------------------------------------------
-- Extend the existing verified-payment sync trigger to carry real gateway
-- fee/tax figures into the finance ledger when present. All existing refund,
-- closed-month-guard, and idempotency (source_event_key) behavior from the
-- prior definition is preserved unchanged.
-- ----------------------------------------------------------------------------
create or replace function private.sync_verified_payment_to_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  revenue_category_id uuid;
  vendor_name text;
  receipt_date date;
  refund_date date;
  receipt_key text := 'payment:' || new.id::text || ':receipt';
  refund_key text := 'payment:' || new.id::text || ':refund';
  receipt_existing_date date;
  refund_existing_date date;
  refund_amount numeric := 0;
  fee_captured boolean := new.gateway_fee_minor is not null;
  captured_fee numeric := case when new.gateway_fee_minor is not null
    then round((coalesce(new.gateway_fee_minor, 0) + coalesce(new.gateway_tax_minor, 0))::numeric / 100, 2)
    else 0
  end;
begin
  if new.amount <= 0 then return new; end if;

  select id into revenue_category_id
  from public.finance_categories
  where direction = 'revenue' and name = 'Subscription Revenue'
  limit 1;
  if revenue_category_id is null then return new; end if;

  select business_name into vendor_name from public.vendors where id = new.vendor_id;
  receipt_date := coalesce(new.verified_at, new.paid_at, new.created_at)::date;
  refund_date := coalesce(new.refunded_at, now())::date;
  select occurred_on into receipt_existing_date from public.finance_transactions where source_event_key = receipt_key;
  select occurred_on into refund_existing_date from public.finance_transactions where source_event_key = refund_key;
  refund_amount := case
    when new.payment_status = 'refunded' then new.amount
    when new.payment_status = 'partially_refunded'
      and coalesce(new.metadata->>'refunded_amount', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
      then least(new.amount, (new.metadata->>'refunded_amount')::numeric)
    else 0
  end;

  if new.payment_status in ('verified', 'refunded', 'partially_refunded') then
    if receipt_existing_date is null and not private.finance_month_is_closed(receipt_date) then
      insert into public.finance_transactions(
        occurred_on, direction, category_id, amount, gateway_fee, gateway_fee_captured, source,
        source_payment_id, source_event_key, vendor_id, payment_method,
        counterparty, reference_number, status, notes
      ) values (
        receipt_date, 'revenue', revenue_category_id, new.amount, captured_fee, fee_captured,
        'subscription_payment', new.id, receipt_key, new.vendor_id,
        new.payment_method, vendor_name,
        coalesce(new.razorpay_payment_id, new.razorpay_order_id), 'recorded',
        'Automatically recorded from a verified subscription payment.'
      );
    elsif receipt_existing_date is not null and not private.finance_month_is_closed(receipt_existing_date) then
      update public.finance_transactions set
        amount = new.amount,
        gateway_fee = case when fee_captured then captured_fee else gateway_fee end,
        gateway_fee_captured = gateway_fee_captured or fee_captured,
        payment_method = new.payment_method,
        counterparty = vendor_name,
        reference_number = coalesce(new.razorpay_payment_id, new.razorpay_order_id),
        status = 'recorded',
        updated_at = now()
      where source_event_key = receipt_key;
    end if;
  end if;

  if new.payment_status in ('refunded', 'partially_refunded') and refund_amount > 0 then
    if refund_existing_date is not null and private.finance_month_is_closed(refund_existing_date) then return new; end if;
    if private.finance_month_is_closed(refund_date) then
      if private.finance_month_is_closed(current_date) then return new; end if;
      refund_date := current_date;
    end if;
    insert into public.finance_transactions(
      occurred_on, direction, category_id, amount, gateway_fee, source,
      source_payment_id, source_event_key, vendor_id, payment_method,
      counterparty, reference_number, status, notes
    ) values (
      refund_date, 'revenue', revenue_category_id, refund_amount, 0, 'refund',
      new.id, refund_key, new.vendor_id, new.payment_method, vendor_name,
      coalesce(new.razorpay_payment_id, new.razorpay_order_id), 'recorded',
      case when new.payment_status = 'refunded'
        then 'Automatically recorded from a fully refunded subscription payment.'
        else 'Automatically recorded from a partially refunded subscription payment.'
      end
    ) on conflict (source_event_key) where source_event_key is not null do update set
      amount = excluded.amount,
      occurred_on = excluded.occurred_on,
      status = 'recorded',
      updated_at = now();
  elsif new.payment_status = 'verified' and refund_existing_date is not null
    and not private.finance_month_is_closed(refund_existing_date) then
    update public.finance_transactions set status = 'void', updated_at = now()
    where source_event_key = refund_key;
  elsif tg_op = 'UPDATE'
    and old.payment_status in ('verified', 'partially_refunded')
    and new.payment_status not in ('verified', 'refunded', 'partially_refunded')
    and receipt_existing_date is not null
    and not private.finance_month_is_closed(receipt_existing_date) then
    update public.finance_transactions set status = 'void', updated_at = now()
    where source_event_key = receipt_key;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_payments_sync_finance on public.subscription_payments;
create trigger subscription_payments_sync_finance
after insert or update of payment_status, amount, verified_at, paid_at, refunded_at,
  payment_method, razorpay_payment_id, razorpay_order_id, gateway_fee_minor, gateway_tax_minor
on public.subscription_payments
for each row execute function private.sync_verified_payment_to_finance();

-- admin_finance_month_summary's revenue formula (sum(amount - gateway_fee)
-- for receipts, minus refunds) is unchanged by this migration: fee capture
-- only changes how much of that already-summed gateway_fee is a *real*
-- figure instead of a 0 placeholder. No redefinition needed here.

-- ============================================================================
-- Revenue trend: a true server-side aggregate query (not row-level client
-- fetch+sum) backing the Revenue dashboard's trend chart. Uses the same
-- accounting model as admin_finance_month_summary / summarizeFinance
-- (gross - gateway_fee = net, refunds negative).
-- ============================================================================
create or replace function public.admin_finance_revenue_trend(period_start date, period_end date, bucket text default 'day')
returns table(bucket_start date, gross numeric, gateway_fee numeric, net numeric, transaction_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if bucket not in ('day', 'month') then
    raise exception 'bucket must be day or month';
  end if;
  if period_end <= period_start then
    raise exception 'period_end must be after period_start';
  end if;
  return query
  select
    date_trunc(bucket, occurred_on)::date as bucket_start,
    sum(case when source = 'refund' then -amount else amount end) as gross,
    sum(case when source = 'refund' then 0 else gateway_fee end) as gateway_fee,
    sum(case when source = 'refund' then -amount else amount - gateway_fee end) as net,
    count(*)::integer as transaction_count
  from public.finance_transactions
  where direction = 'revenue' and status = 'recorded'
    and occurred_on >= period_start and occurred_on < period_end
  group by 1
  order by 1;
end;
$$;

revoke all on function public.admin_finance_revenue_trend(date, date, text) from public, anon;
grant execute on function public.admin_finance_revenue_trend(date, date, text) to authenticated;

commit;
