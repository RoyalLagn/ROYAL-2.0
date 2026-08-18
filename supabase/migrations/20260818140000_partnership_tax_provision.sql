begin;

-- Partnership Tax Model (yearly) additive migration.
--
-- Reuses the existing finance_transactions / finance_tax_records
-- architecture for everything it can:
--   - Annual Revenue / Annual Business Expenses are aggregated straight from
--     finance_transactions (same "amount - gateway_fee" / "amount" formulas
--     already used by admin_finance_month_summary), never re-typed by hand.
--   - "Tax Paid" reuses the existing finance_tax_records tax_type
--     'income_tax_paid' — an admin records a payment against the financial
--     year period (Apr 1 - Mar 31) exactly like any other tax record.
--
-- The ONE new table below exists only because no existing column can safely
-- hold a signed, financial-year-scoped "Tax Adjustment" figure:
--   - finance_tax_records.amount is constrained >= 0 (it holds tax amounts,
--     never a CA add-back/deduction adjustment to accounting profit), and
--   - inserting a row that *spans* a full financial year into
--     finance_tax_records would make it overlap every month inside that
--     year (its period-overlap query is how admin_finance_month_summary
--     finds tax rows for a given month), silently inflating the existing
--     monthly "Estimated tax provision" figure for every month in the year.
-- A one-row-per-financial-year table avoids both problems and leaves the
-- monthly Finance screens completely untouched.

create table if not exists public.finance_annual_tax_adjustments (
  financial_year_start date primary key,
  adjustment numeric(14, 2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_annual_tax_adjustments_fy_start check (
    extract(month from financial_year_start) = 4 and extract(day from financial_year_start) = 1
  ),
  constraint finance_annual_tax_adjustments_notes_length check (notes is null or char_length(notes) <= 2000)
);

drop trigger if exists finance_annual_tax_adjustments_set_updated_at on public.finance_annual_tax_adjustments;
create trigger finance_annual_tax_adjustments_set_updated_at
before update on public.finance_annual_tax_adjustments
for each row execute function private.set_updated_at();

alter table public.finance_annual_tax_adjustments enable row level security;
drop policy if exists finance_annual_tax_adjustments_admin_all on public.finance_annual_tax_adjustments;
create policy finance_annual_tax_adjustments_admin_all on public.finance_annual_tax_adjustments
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
grant select, insert, update, delete on public.finance_annual_tax_adjustments to authenticated;
revoke all on public.finance_annual_tax_adjustments from anon;

-- Server-side aggregate for a full financial year (Apr 1 - Mar 31), mirroring
-- admin_finance_month_summary's formulas exactly so "Annual Revenue" /
-- "Annual Business Expenses" can never drift from what the monthly screens
-- already compute. Also folds in the existing income_tax_paid tax records
-- for the same period so "Tax Paid" reuses existing data rather than a new
-- calculation.
create or replace function public.admin_finance_year_summary(target_year_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  year_start date;
  year_end date;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if extract(month from target_year_start) <> 4 or extract(day from target_year_start) <> 1 then
    raise exception 'target_year_start must be April 1 of the financial year';
  end if;
  year_start := target_year_start;
  year_end := (target_year_start + interval '1 year')::date;
  return jsonb_build_object(
    'financial_year_start', year_start,
    'financial_year_end', (year_end - interval '1 day')::date,
    'revenue', coalesce((select sum(amount - gateway_fee) from public.finance_transactions where occurred_on >= year_start and occurred_on < year_end and direction = 'revenue' and status = 'recorded'), 0),
    'expenses', coalesce((select sum(amount) from public.finance_transactions where occurred_on >= year_start and occurred_on < year_end and direction = 'expense' and status = 'recorded'), 0),
    'tax_paid', coalesce((select sum(amount) from public.finance_tax_records where tax_type = 'income_tax_paid' and period_start < year_end and period_end >= year_start), 0),
    'transaction_count', (select count(*) from public.finance_transactions where occurred_on >= year_start and occurred_on < year_end and status = 'recorded')
  );
end;
$$;

revoke all on function public.admin_finance_year_summary(date) from public, anon;
grant execute on function public.admin_finance_year_summary(date) to authenticated;

commit;
