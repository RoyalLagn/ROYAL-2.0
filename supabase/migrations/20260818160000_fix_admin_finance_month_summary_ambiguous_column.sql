begin;

-- Bug fix, pre-existing and unrelated to the Monthly Tax Estimate feature:
-- admin_finance_month_summary declared a plpgsql variable named
-- "month_start", which collides with finance_monthly_closures.month_start
-- (and finance_budgets.month_start) once those tables appear in a FROM
-- clause. With Postgres's default plpgsql variable_conflict = error, the
-- bare "month_start" on the right-hand side of
-- `finance_monthly_closures.month_start = month_start` is ambiguous between
-- the exposed table column and the plpgsql variable, and every call to this
-- function fails with: column reference "month_start" is ambiguous.
--
-- This was latent since the original Finance migration (only ever invoked
-- internally by admin_close_finance_month, which nothing in this
-- environment had exercised yet) and surfaced now because the Monthly Tax
-- Estimate view is the first caller to invoke it directly and repeatedly.
-- Fix: rename the local variables so they no longer shadow any table
-- column. No formula, signature, or return shape changes.
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
    'revenue', coalesce((select sum(amount - gateway_fee) from public.finance_transactions where occurred_on >= v_month_start and occurred_on < v_month_end and direction = 'revenue' and status = 'recorded'), 0),
    'expenses', coalesce((select sum(amount) from public.finance_transactions where occurred_on >= v_month_start and occurred_on < v_month_end and direction = 'expense' and status = 'recorded'), 0),
    'estimated_tax', coalesce((select sum(amount) from public.finance_tax_records where period_start < v_month_end and period_end >= v_month_start and is_estimate), 0),
    'budget', coalesce((select sum(item.amount) from public.finance_budgets budget join public.finance_budget_items item on item.budget_id = budget.id where budget.month_start = v_month_start), 0),
    'transaction_count', (select count(*) from public.finance_transactions where occurred_on >= v_month_start and occurred_on < v_month_end and status = 'recorded'),
    'closed', exists(select 1 from public.finance_monthly_closures where finance_monthly_closures.month_start = v_month_start and status = 'closed')
  );
end;
$$;

commit;
