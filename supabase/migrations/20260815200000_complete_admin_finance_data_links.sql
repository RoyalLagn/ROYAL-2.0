begin;

-- A payment can produce both a receipt and a later refund. Keep both events
-- linked to the source payment instead of rewriting financial history.
alter table public.finance_transactions
  drop constraint if exists finance_transactions_source_payment_id_key;
alter table public.finance_transactions
  add column if not exists source_event_key text;

update public.finance_transactions
set source_event_key = 'payment:' || source_payment_id::text || ':receipt'
where source_payment_id is not null
  and source_event_key is null
  and source = 'subscription_payment';

create unique index if not exists finance_transactions_source_event_key_idx
  on public.finance_transactions(source_event_key)
  where source_event_key is not null;
create index if not exists finance_transactions_source_payment_idx
  on public.finance_transactions(source_payment_id)
  where source_payment_id is not null;

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
        occurred_on, direction, category_id, amount, gateway_fee, source,
        source_payment_id, source_event_key, vendor_id, payment_method,
        counterparty, reference_number, status, notes
      ) values (
        receipt_date, 'revenue', revenue_category_id, new.amount, 0,
        'subscription_payment', new.id, receipt_key, new.vendor_id,
        new.payment_method, vendor_name,
        coalesce(new.razorpay_payment_id, new.razorpay_order_id), 'recorded',
        'Automatically recorded from a verified subscription payment.'
      );
    elsif receipt_existing_date is not null and not private.finance_month_is_closed(receipt_existing_date) then
      update public.finance_transactions set
        amount = new.amount,
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
  payment_method, razorpay_payment_id, razorpay_order_id
on public.subscription_payments
for each row execute function private.sync_verified_payment_to_finance();

-- Reconcile historical receipts and full refunds idempotently.
insert into public.finance_transactions(
  occurred_on, direction, category_id, amount, source, source_payment_id,
  source_event_key, vendor_id, payment_method, counterparty,
  reference_number, status, notes
)
select
  coalesce(payment.verified_at, payment.paid_at, payment.created_at)::date,
  'revenue', category.id, payment.amount, 'subscription_payment', payment.id,
  'payment:' || payment.id::text || ':receipt', payment.vendor_id,
  payment.payment_method, vendor.business_name,
  coalesce(payment.razorpay_payment_id, payment.razorpay_order_id), 'recorded',
  'Reconciled from a verified subscription payment.'
from public.subscription_payments payment
join public.finance_categories category
  on category.direction = 'revenue' and category.name = 'Subscription Revenue'
left join public.vendors vendor on vendor.id = payment.vendor_id
where payment.payment_status in ('verified', 'refunded', 'partially_refunded')
  and payment.amount > 0
on conflict (source_event_key) where source_event_key is not null do nothing;

insert into public.finance_transactions(
  occurred_on, direction, category_id, amount, source, source_payment_id,
  source_event_key, vendor_id, payment_method, counterparty,
  reference_number, status, notes
)
select
  coalesce(payment.refunded_at, payment.updated_at)::date,
  'revenue', category.id,
  case when payment.payment_status = 'refunded' then payment.amount else (payment.metadata->>'refunded_amount')::numeric end,
  'refund', payment.id,
  'payment:' || payment.id::text || ':refund', payment.vendor_id,
  payment.payment_method, vendor.business_name,
  coalesce(payment.razorpay_payment_id, payment.razorpay_order_id), 'recorded',
  case when payment.payment_status = 'refunded'
    then 'Reconciled from a fully refunded subscription payment.'
    else 'Reconciled from a partially refunded subscription payment.'
  end
from public.subscription_payments payment
join public.finance_categories category
  on category.direction = 'revenue' and category.name = 'Subscription Revenue'
left join public.vendors vendor on vendor.id = payment.vendor_id
where payment.payment_status in ('refunded', 'partially_refunded')
  and payment.amount > 0
  and (
    payment.payment_status = 'refunded'
    or coalesce(payment.metadata->>'refunded_amount', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
  )
on conflict (source_event_key) where source_event_key is not null do nothing;

create or replace function public.admin_save_finance_budget(
  target_month date,
  target_revenue numeric,
  budget_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  saved_budget_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_revenue < 0 then raise exception 'Revenue target cannot be negative'; end if;
  if jsonb_typeof(coalesce(budget_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Budget items must be an array';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(budget_items, '[]'::jsonb)) as item(category_id uuid, amount numeric)
    left join public.finance_categories category on category.id = item.category_id and category.direction = 'expense' and category.is_active
    where item.category_id is null or item.amount is null or item.amount < 0 or category.id is null
  ) then
    raise exception 'Every budget item requires an active expense category and a non-negative amount';
  end if;

  insert into public.finance_budgets(month_start, name, revenue_target, created_by, updated_by)
  values (month_start, to_char(month_start, 'FMMonth YYYY') || ' budget', target_revenue, auth.uid(), auth.uid())
  on conflict (month_start) do update set
    revenue_target = excluded.revenue_target,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into saved_budget_id;

  insert into public.finance_budget_items(budget_id, category_id, amount)
  select saved_budget_id, item.category_id, item.amount
  from jsonb_to_recordset(coalesce(budget_items, '[]'::jsonb)) as item(category_id uuid, amount numeric)
  where item.amount > 0
  on conflict (budget_id, category_id) do update set amount = excluded.amount, updated_at = now();

  delete from public.finance_budget_items existing
  where existing.budget_id = saved_budget_id
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(budget_items, '[]'::jsonb)) as item(category_id uuid, amount numeric)
      where item.category_id = existing.category_id and item.amount > 0
    );
  return saved_budget_id;
end;
$$;

revoke all on function public.admin_save_finance_budget(date, numeric, jsonb) from public, anon;
grant execute on function public.admin_save_finance_budget(date, numeric, jsonb) to authenticated;

create or replace function public.admin_finance_month_summary(target_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  month_end date := (date_trunc('month', target_month) + interval '1 month')::date;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month_start', month_start,
    'revenue', coalesce((select sum(case when source = 'refund' then -amount else amount - gateway_fee end) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and direction = 'revenue' and status = 'recorded'), 0),
    'expenses', coalesce((select sum(amount) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and direction = 'expense' and status = 'recorded'), 0),
    'estimated_tax', coalesce((select sum(amount) from public.finance_tax_records where period_start < month_end and period_end >= month_start and is_estimate), 0),
    'budget', coalesce((select sum(item.amount) from public.finance_budgets budget join public.finance_budget_items item on item.budget_id = budget.id where budget.month_start = month_start), 0),
    'transaction_count', (select count(*) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and status = 'recorded'),
    'closed', exists(select 1 from public.finance_monthly_closures where finance_monthly_closures.month_start = month_start and status = 'closed')
  );
end;
$$;

-- The client already subscribes to these tables; publish them so changes made
-- in other admin sessions actually reach that subscription.
do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'finance_transactions', 'finance_budgets', 'finance_budget_items',
      'finance_tax_records', 'finance_cloudinary_usage', 'finance_scenarios',
      'finance_monthly_closures'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end $$;

commit;
