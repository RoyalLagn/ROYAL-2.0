begin;

-- Fix: admin_finance_revenue_trend's RETURNS TABLE(..., gateway_fee numeric, ...)
-- implicitly creates a PL/pgSQL OUT variable named gateway_fee, which
-- collides with the real finance_transactions.gateway_fee column referenced
-- unqualified inside the query body — Postgres raises
-- "column reference gateway_fee is ambiguous" (42702) at call time. This is
-- why the Revenue trend chart failed with "Unable to load the revenue
-- trend." No formula or access-control change — purely qualifying every
-- column reference with a table alias to remove the ambiguity.
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
    date_trunc(bucket, ft.occurred_on)::date as bucket_start,
    sum(case when ft.source = 'refund' then -ft.amount else ft.amount end) as gross,
    sum(case when ft.source = 'refund' then 0 else ft.gateway_fee end) as gateway_fee,
    sum(case when ft.source = 'refund' then -ft.amount else ft.amount - ft.gateway_fee end) as net,
    count(*)::integer as transaction_count
  from public.finance_transactions ft
  where ft.direction = 'revenue' and ft.status = 'recorded'
    and ft.occurred_on >= period_start and ft.occurred_on < period_end
  group by 1
  order by 1;
end;
$$;

revoke all on function public.admin_finance_revenue_trend(date, date, text) from public, anon;
grant execute on function public.admin_finance_revenue_trend(date, date, text) to authenticated;

commit;
