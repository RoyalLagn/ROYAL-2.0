begin;

-- Finance -> Taxes is now exclusively the yearly partnership tax model; the
-- old monthly GST / income-tax-provision / income-tax-paid / other-provision
-- UI has been removed from that page (finance_tax_records itself is
-- untouched — it is still read by the Revenue tab's "Tax summary" card and
-- by the monthly Overview/Profit & Loss "Estimated tax provision" figure).
--
-- "Tax Paid" for the yearly model must therefore stop being written into
-- finance_tax_records (an FY-spanning income_tax_paid row there would still
-- show up in the Revenue tab's per-month Tax summary breakdown for every
-- month in the year — a stray monthly-looking artifact of a yearly figure).
-- It is now stored directly on finance_annual_tax_adjustments, the table
-- already dedicated to this financial-year model.

alter table public.finance_annual_tax_adjustments
  add column if not exists tax_paid numeric(14, 2) not null default 0 check (tax_paid >= 0);

-- admin_finance_year_summary no longer needs to touch finance_tax_records at
-- all: Annual Revenue/Expenses come from finance_transactions only, and Tax
-- Paid now comes from finance_annual_tax_adjustments.tax_paid.
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
    'transaction_count', (select count(*) from public.finance_transactions where occurred_on >= year_start and occurred_on < year_end and status = 'recorded')
  );
end;
$$;

revoke all on function public.admin_finance_year_summary(date) from public, anon;
grant execute on function public.admin_finance_year_summary(date) to authenticated;

commit;
