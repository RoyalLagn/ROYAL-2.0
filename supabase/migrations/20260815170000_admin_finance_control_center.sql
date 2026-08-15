begin;

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_name text not null,
  direction text not null check (direction in ('revenue', 'expense')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_categories_name_valid check (char_length(btrim(name)) between 2 and 80),
  constraint finance_categories_group_valid check (char_length(btrim(group_name)) between 2 and 80)
);

create unique index if not exists finance_categories_direction_name_idx
  on public.finance_categories(direction, lower(btrim(name)));

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  direction text not null check (direction in ('revenue', 'expense')),
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  gateway_fee numeric(14, 2) not null default 0 check (gateway_fee >= 0),
  source text not null default 'manual'
    check (source in ('manual', 'subscription_payment', 'refund', 'adjustment')),
  source_payment_id uuid unique references public.subscription_payments(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  payment_method text,
  counterparty text,
  reference_number text,
  is_recurring boolean not null default false,
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_transactions_counterparty_length check (counterparty is null or char_length(counterparty) <= 160),
  constraint finance_transactions_reference_length check (reference_number is null or char_length(reference_number) <= 120),
  constraint finance_transactions_notes_length check (notes is null or char_length(notes) <= 2000)
);

create index if not exists finance_transactions_period_idx
  on public.finance_transactions(occurred_on desc, direction, status);
create index if not exists finance_transactions_category_idx
  on public.finance_transactions(category_id, occurred_on desc);

create table if not exists public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  name text not null,
  revenue_target numeric(14, 2) not null default 0 check (revenue_target >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_budgets_first_day check (month_start = date_trunc('month', month_start)::date),
  constraint finance_budgets_name_valid check (char_length(btrim(name)) between 2 and 120)
);

create table if not exists public.finance_budget_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.finance_budgets(id) on delete cascade,
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_id, category_id)
);

create table if not exists public.finance_tax_records (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  tax_type text not null check (tax_type in ('gst_collected', 'gst_input_credit', 'gst_paid', 'income_tax_provision', 'income_tax_paid', 'other_provision')),
  amount numeric(14, 2) not null check (amount >= 0),
  is_estimate boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_tax_period_order check (period_end >= period_start)
);

create index if not exists finance_tax_records_period_idx
  on public.finance_tax_records(period_start, period_end, tax_type);

create table if not exists public.finance_cloudinary_usage (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  storage_percent numeric(5, 2) check (storage_percent between 0 and 100),
  bandwidth_percent numeric(5, 2) check (bandwidth_percent between 0 and 100),
  transformations_percent numeric(5, 2) check (transformations_percent between 0 and 100),
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14, 2) not null default 0 check (actual_cost >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_cloudinary_usage_first_day check (month_start = date_trunc('month', month_start)::date)
);

create table if not exists public.finance_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_vendors integer not null default 0 check (total_vendors >= 0),
  free_percent numeric(5, 2) not null default 0 check (free_percent between 0 and 100),
  premium_percent numeric(5, 2) not null default 0 check (premium_percent between 0 and 100),
  elite_percent numeric(5, 2) not null default 0 check (elite_percent between 0 and 100),
  premium_price numeric(14, 2) not null default 0 check (premium_price >= 0),
  elite_price numeric(14, 2) not null default 0 check (elite_price >= 0),
  monthly_fixed_expenses numeric(14, 2) not null default 0 check (monthly_fixed_expenses >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_scenario_name_valid check (char_length(btrim(name)) between 2 and 100),
  constraint finance_scenario_percent_total check (free_percent + premium_percent + elite_percent = 100)
);

create table if not exists public.finance_monthly_closures (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  status text not null default 'closed' check (status in ('closed', 'reopened')),
  checklist jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_monthly_closures_first_day check (month_start = date_trunc('month', month_start)::date)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'finance_categories', 'finance_transactions', 'finance_budgets',
    'finance_budget_items', 'finance_tax_records', 'finance_cloudinary_usage',
    'finance_scenarios', 'finance_monthly_closures'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name, table_name);
  end loop;
end $$;

insert into public.finance_categories(name, group_name, direction, is_system) values
  ('Subscription Revenue', 'Subscriptions', 'revenue', true),
  ('Add-on Revenue', 'Other Revenue', 'revenue', true),
  ('Other Revenue', 'Other Revenue', 'revenue', true),
  ('Cloudinary', 'Technology', 'expense', true),
  ('Vercel', 'Technology', 'expense', true),
  ('Database', 'Technology', 'expense', true),
  ('Domain & Email', 'Technology', 'expense', true),
  ('SMS & WhatsApp', 'Technology', 'expense', true),
  ('App Stores', 'Technology', 'expense', true),
  ('APIs & Software', 'Technology', 'expense', true),
  ('Digital Advertising', 'Marketing', 'expense', true),
  ('Influencers & Content', 'Marketing', 'expense', true),
  ('Print & Events', 'Marketing', 'expense', true),
  ('Salaries & Sales Team', 'Operations', 'expense', true),
  ('Travel & Petrol', 'Operations', 'expense', true),
  ('Office & Connectivity', 'Operations', 'expense', true),
  ('Equipment', 'Operations', 'expense', true),
  ('Legal & Accounting', 'Business', 'expense', true),
  ('GST & Bank Charges', 'Business', 'expense', true),
  ('Payment Gateway Fees', 'Business', 'expense', true),
  ('Professional Services', 'Business', 'expense', true),
  ('Miscellaneous', 'Business', 'expense', true)
on conflict (direction, (lower(btrim(name)))) do nothing;

create or replace function private.finance_month_is_closed(target_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.finance_monthly_closures closure
    where closure.month_start = date_trunc('month', target_date)::date
      and closure.status = 'closed'
  );
$$;

create or replace function private.finance_range_touches_closed(period_start date, period_end date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.finance_monthly_closures closure
    where closure.status = 'closed'
      and closure.month_start <= period_end
      and (closure.month_start + interval '1 month - 1 day')::date >= period_start
  );
$$;

create or replace function private.sync_verified_payment_to_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  revenue_category_id uuid;
  vendor_name text;
  source_date date;
  posting_date date;
  existing_date date;
begin
  select id into revenue_category_id
  from public.finance_categories
  where direction = 'revenue' and name = 'Subscription Revenue'
  limit 1;

  select business_name into vendor_name from public.vendors where id = new.vendor_id;
  source_date := coalesce(new.verified_at, new.paid_at, new.created_at)::date;
  posting_date := source_date;
  select occurred_on into existing_date
  from public.finance_transactions
  where source_payment_id = new.id;

  if new.payment_status = 'verified' and new.amount > 0 then
    if existing_date is not null and private.finance_month_is_closed(existing_date) then return new; end if;
    -- Never mutate a closed statement. A late verification is posted to the
    -- current open month as a traceable adjustment; if that month is also
    -- closed, payment verification still succeeds and reconciliation remains
    -- an explicit administrator task.
    if private.finance_month_is_closed(source_date) then
      if private.finance_month_is_closed(current_date) then return new; end if;
      posting_date := current_date;
    end if;
    insert into public.finance_transactions(
      occurred_on, direction, category_id, amount, gateway_fee, source,
      source_payment_id, vendor_id, payment_method, counterparty,
      reference_number, status, notes
    ) values (
      posting_date,
      'revenue', revenue_category_id, new.amount, 0, 'subscription_payment',
      new.id, new.vendor_id, new.payment_method, vendor_name,
      coalesce(new.razorpay_payment_id, new.razorpay_order_id), 'recorded',
      case when posting_date = source_date
        then 'Automatically recorded from a verified subscription payment.'
        else format('Late verified payment dated %s, posted to the current open finance month.', source_date)
      end
    ) on conflict (source_payment_id) do update set
      occurred_on = excluded.occurred_on,
      amount = excluded.amount,
      payment_method = excluded.payment_method,
      counterparty = excluded.counterparty,
      reference_number = excluded.reference_number,
      status = 'recorded',
      updated_at = now();
  elsif tg_op = 'UPDATE' and old.payment_status = 'verified' and old.amount > 0 then
    if existing_date is not null and private.finance_month_is_closed(existing_date) then return new; end if;
    update public.finance_transactions
    set status = 'void', updated_at = now()
    where source_payment_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_payments_sync_finance on public.subscription_payments;
create trigger subscription_payments_sync_finance
after insert or update of payment_status, amount, verified_at, paid_at
on public.subscription_payments
for each row execute function private.sync_verified_payment_to_finance();

insert into public.finance_transactions(
  occurred_on, direction, category_id, amount, source, source_payment_id,
  vendor_id, payment_method, counterparty, reference_number, status, notes
)
select
  coalesce(payment.verified_at, payment.paid_at, payment.created_at)::date,
  'revenue', category.id, payment.amount, 'subscription_payment', payment.id,
  payment.vendor_id, payment.payment_method, vendor.business_name,
  coalesce(payment.razorpay_payment_id, payment.razorpay_order_id), 'recorded',
  'Backfilled from a verified subscription payment.'
from public.subscription_payments payment
join public.finance_categories category
  on category.direction = 'revenue' and category.name = 'Subscription Revenue'
left join public.vendors vendor on vendor.id = payment.vendor_id
where payment.payment_status = 'verified'
  and payment.amount > 0
on conflict (source_payment_id) do nothing;

create or replace function private.prevent_closed_finance_month_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_date date;
begin
  if tg_op = 'DELETE' then
    affected_date := old.occurred_on;
  else
    affected_date := new.occurred_on;
  end if;
  if private.finance_month_is_closed(affected_date)
    or (tg_op = 'UPDATE' and private.finance_month_is_closed(old.occurred_on)) then
    raise exception 'This finance month is closed. A super administrator must reopen it before corrections.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists finance_transactions_closed_month_guard on public.finance_transactions;
create trigger finance_transactions_closed_month_guard
before insert or update or delete on public.finance_transactions
for each row execute function private.prevent_closed_finance_month_change();

create or replace function private.prevent_closed_finance_period_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_date date;
  previous_date date;
  affected_budget_id uuid;
  touches_closed boolean := false;
begin
  if tg_table_name = 'finance_budgets' then
    affected_date := case when tg_op = 'DELETE' then old.month_start else new.month_start end;
    if tg_op = 'UPDATE' then previous_date := old.month_start; end if;
  elsif tg_table_name = 'finance_budget_items' then
    affected_budget_id := case when tg_op = 'DELETE' then old.budget_id else new.budget_id end;
    select month_start into affected_date from public.finance_budgets where id = affected_budget_id;
    if tg_op = 'UPDATE' then select month_start into previous_date from public.finance_budgets where id = old.budget_id; end if;
  elsif tg_table_name = 'finance_tax_records' then
    if tg_op = 'DELETE' then
      touches_closed := private.finance_range_touches_closed(old.period_start, old.period_end);
    else
      touches_closed := private.finance_range_touches_closed(new.period_start, new.period_end);
      if tg_op = 'UPDATE' then
        touches_closed := touches_closed or private.finance_range_touches_closed(old.period_start, old.period_end);
      end if;
    end if;
  elsif tg_table_name = 'finance_cloudinary_usage' then
    affected_date := case when tg_op = 'DELETE' then old.month_start else new.month_start end;
    if tg_op = 'UPDATE' then previous_date := old.month_start; end if;
  end if;
  if touches_closed
    or (affected_date is not null and private.finance_month_is_closed(affected_date))
    or (previous_date is not null and private.finance_month_is_closed(previous_date)) then
    raise exception 'This finance month is closed. A super administrator must reopen it before corrections.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists finance_budgets_closed_month_guard on public.finance_budgets;
create trigger finance_budgets_closed_month_guard before insert or update or delete on public.finance_budgets
for each row execute function private.prevent_closed_finance_period_record_change();
drop trigger if exists finance_budget_items_closed_month_guard on public.finance_budget_items;
create trigger finance_budget_items_closed_month_guard before insert or update or delete on public.finance_budget_items
for each row execute function private.prevent_closed_finance_period_record_change();
drop trigger if exists finance_tax_records_closed_month_guard on public.finance_tax_records;
create trigger finance_tax_records_closed_month_guard before insert or update or delete on public.finance_tax_records
for each row execute function private.prevent_closed_finance_period_record_change();
drop trigger if exists finance_cloudinary_usage_closed_month_guard on public.finance_cloudinary_usage;
create trigger finance_cloudinary_usage_closed_month_guard before insert or update or delete on public.finance_cloudinary_usage
for each row execute function private.prevent_closed_finance_period_record_change();

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
    'revenue', coalesce((select sum(amount - gateway_fee) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and direction = 'revenue' and status = 'recorded'), 0),
    'expenses', coalesce((select sum(amount) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and direction = 'expense' and status = 'recorded'), 0),
    'estimated_tax', coalesce((select sum(amount) from public.finance_tax_records where period_start < month_end and period_end >= month_start and is_estimate), 0),
    'budget', coalesce((select sum(item.amount) from public.finance_budgets budget join public.finance_budget_items item on item.budget_id = budget.id where budget.month_start = month_start), 0),
    'transaction_count', (select count(*) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and status = 'recorded'),
    'closed', exists(select 1 from public.finance_monthly_closures where finance_monthly_closures.month_start = month_start and status = 'closed')
  );
end;
$$;

create or replace function public.admin_close_finance_month(target_month date, completed_checklist jsonb)
returns public.finance_monthly_closures
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  required_key text;
  result public.finance_monthly_closures;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  foreach required_key in array array['revenue_recorded','expenses_recorded','fees_recorded','cloudinary_recorded','marketing_recorded','refunds_recorded','tax_reviewed']
  loop
    if coalesce((completed_checklist->>required_key)::boolean, false) is not true then
      raise exception 'Complete every monthly closing check before closing the month';
    end if;
  end loop;
  update public.finance_budgets set status = 'closed', updated_by = auth.uid()
  where finance_budgets.month_start = month_start;
  insert into public.finance_monthly_closures(month_start, status, checklist, snapshot, closed_by, closed_at)
  values (month_start, 'closed', completed_checklist, public.admin_finance_month_summary(month_start), auth.uid(), now())
  on conflict (month_start) do update set
    status = 'closed', checklist = excluded.checklist, snapshot = excluded.snapshot,
    closed_by = auth.uid(), closed_at = now(), reopened_by = null,
    reopened_at = null, correction_reason = null, updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.admin_reopen_finance_month(target_month date, reason text)
returns public.finance_monthly_closures
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  result public.finance_monthly_closures;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role::text = 'super_admin' and is_active) then
    raise exception 'Super administrator access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 8 then
    raise exception 'Provide a correction reason of at least 8 characters';
  end if;
  update public.finance_monthly_closures set
    status = 'reopened', reopened_by = auth.uid(), reopened_at = now(),
    correction_reason = btrim(reason), updated_at = now()
  where finance_monthly_closures.month_start = month_start
  returning * into result;
  if result.id is null then raise exception 'Closed finance month not found'; end if;
  update public.finance_budgets set status = 'open', updated_by = auth.uid()
  where finance_budgets.month_start = month_start;
  return result;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'finance_categories', 'finance_transactions', 'finance_budgets',
    'finance_budget_items', 'finance_tax_records', 'finance_cloudinary_usage',
    'finance_scenarios', 'finance_monthly_closures'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I_admin_all on public.%I', table_name, table_name);
    execute format('create policy %I_admin_all on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())', table_name, table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end $$;

revoke all on function public.admin_finance_month_summary(date) from public, anon;
revoke all on function public.admin_close_finance_month(date, jsonb) from public, anon;
revoke all on function public.admin_reopen_finance_month(date, text) from public, anon;
grant execute on function public.admin_finance_month_summary(date) to authenticated;
grant execute on function public.admin_close_finance_month(date, jsonb) to authenticated;
grant execute on function public.admin_reopen_finance_month(date, text) to authenticated;

commit;
