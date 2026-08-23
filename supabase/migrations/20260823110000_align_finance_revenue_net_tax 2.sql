begin;

create or replace function public.admin_finance_revenue_trend(period_start date, period_end date, bucket text default 'day')
returns table(bucket_start date, gross numeric, gateway_fee numeric, net numeric, transaction_count integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if bucket not in ('day', 'month') then raise exception 'bucket must be day or month'; end if;
  if period_end <= period_start then raise exception 'period_end must be after period_start'; end if;
  return query select date_trunc(bucket, ft.occurred_on)::date,
    coalesce(sum(case when ft.source not in ('refund', 'adjustment') then ft.amount else 0 end), 0),
    0::numeric,
    coalesce(sum(case when ft.source = 'refund' then -ft.amount when ft.source = 'adjustment' then -ft.amount else ft.amount end), 0),
    count(*) filter (where ft.source not in ('refund', 'adjustment'))::integer
  from public.finance_transactions ft
  where ft.direction = 'revenue' and ft.status = 'recorded' and ft.occurred_on >= period_start and ft.occurred_on < period_end
  group by 1 order by 1;
end;
$$;

create or replace function public.admin_finance_year_summary(target_year_start date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare year_end date;
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if extract(month from target_year_start) <> 4 or extract(day from target_year_start) <> 1 then raise exception 'target_year_start must be April 1 of the financial year'; end if;
  year_end := (target_year_start + interval '1 year')::date;
  return jsonb_build_object(
    'financial_year_start', target_year_start, 'financial_year_end', year_end - 1,
    'revenue', coalesce((select sum(case when source = 'refund' then -amount when source = 'adjustment' then -amount else amount end) from public.finance_transactions where occurred_on >= target_year_start and occurred_on < year_end and direction = 'revenue' and status = 'recorded'), 0),
    'expenses', coalesce((select sum(amount) from public.finance_transactions where occurred_on >= target_year_start and occurred_on < year_end and direction = 'expense' and status = 'recorded'), 0),
    'transaction_count', (select count(*) from public.finance_transactions where occurred_on >= target_year_start and occurred_on < year_end and direction = 'revenue' and status = 'recorded' and source not in ('refund', 'adjustment')));
end;
$$;

create or replace function public.admin_finance_month_summary(target_month date)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare month_end date := (date_trunc('month', target_month) + interval '1 month')::date; month_start date := date_trunc('month', target_month)::date;
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return jsonb_build_object('month_start', month_start,
    'revenue', coalesce((select sum(case when source = 'refund' then -amount when source = 'adjustment' then -amount else amount end) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and direction = 'revenue' and status = 'recorded'), 0),
    'expenses', coalesce((select sum(amount) from public.finance_transactions where occurred_on >= month_start and occurred_on < month_end and direction = 'expense' and status = 'recorded'), 0));
end;
$$;

commit;
