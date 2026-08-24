begin;

-- PL/pgSQL treats an unqualified identifier that matches both a local
-- variable and a column as ambiguous. Keep the public RPC signatures stable,
-- but prefix local variables so month-close and budget operations compile and
-- execute deterministically on the linked database.
create or replace function public.admin_finance_month_summary(target_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', target_month)::date;
  v_month_end date := (date_trunc('month', target_month) + interval '1 month')::date;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month_start', v_month_start,
    'revenue', coalesce((
      select sum(case when source = 'refund' then -amount else amount - gateway_fee end)
      from public.finance_transactions
      where occurred_on >= v_month_start and occurred_on < v_month_end
        and direction = 'revenue' and status = 'recorded'
    ), 0),
    'expenses', coalesce((
      select sum(amount) from public.finance_transactions
      where occurred_on >= v_month_start and occurred_on < v_month_end
        and direction = 'expense' and status = 'recorded'
    ), 0),
    'estimated_tax', coalesce((
      select sum(amount) from public.finance_tax_records
      where period_start < v_month_end and period_end >= v_month_start and is_estimate
    ), 0),
    'budget', coalesce((
      select sum(item.amount)
      from public.finance_budgets budget
      join public.finance_budget_items item on item.budget_id = budget.id
      where budget.month_start = v_month_start
    ), 0),
    'transaction_count', (
      select count(*) from public.finance_transactions
      where occurred_on >= v_month_start and occurred_on < v_month_end and status = 'recorded'
    ),
    'closed', exists(
      select 1 from public.finance_monthly_closures closure
      where closure.month_start = v_month_start and closure.status = 'closed'
    )
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
  v_month_start date := date_trunc('month', target_month)::date;
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

  update public.finance_budgets budget
  set status = 'closed', updated_by = auth.uid()
  where budget.month_start = v_month_start;

  insert into public.finance_monthly_closures(month_start, status, checklist, snapshot, closed_by, closed_at)
  values (v_month_start, 'closed', completed_checklist, public.admin_finance_month_summary(v_month_start), auth.uid(), now())
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
  v_month_start date := date_trunc('month', target_month)::date;
  result public.finance_monthly_closures;
begin
  if not exists(
    select 1 from public.profiles
    where id = auth.uid() and role::text = 'super_admin' and is_active
  ) then
    raise exception 'Super administrator access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 8 then
    raise exception 'Provide a correction reason of at least 8 characters';
  end if;

  update public.finance_monthly_closures closure
  set status = 'reopened', reopened_by = auth.uid(), reopened_at = now(),
      correction_reason = btrim(reason), updated_at = now()
  where closure.month_start = v_month_start
  returning * into result;
  if result.id is null then
    raise exception 'Closed finance month not found';
  end if;

  update public.finance_budgets budget
  set status = 'open', updated_by = auth.uid()
  where budget.month_start = v_month_start;
  return result;
end;
$$;

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
  v_month_start date := date_trunc('month', target_month)::date;
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
    select 1
    from jsonb_to_recordset(coalesce(budget_items, '[]'::jsonb)) as item(category_id uuid, amount numeric)
    left join public.finance_categories category
      on category.id = item.category_id and category.direction = 'expense' and category.is_active
    where item.category_id is null or item.amount is null or item.amount < 0 or category.id is null
  ) then
    raise exception 'Every budget item requires an active expense category and a non-negative amount';
  end if;

  insert into public.finance_budgets(month_start, name, revenue_target, created_by, updated_by)
  values (v_month_start, to_char(v_month_start, 'FMMonth YYYY') || ' budget', target_revenue, auth.uid(), auth.uid())
  on conflict (month_start) do update set
    revenue_target = excluded.revenue_target,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into saved_budget_id;

  insert into public.finance_budget_items(budget_id, category_id, amount)
  select saved_budget_id, item.category_id, item.amount
  from jsonb_to_recordset(coalesce(budget_items, '[]'::jsonb)) as item(category_id uuid, amount numeric)
  where item.amount > 0
  on conflict (budget_id, category_id) do update
  set amount = excluded.amount, updated_at = now();

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

commit;
