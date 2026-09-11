begin;

create table if not exists public.admin_clip_finance_monthly_results (
  month_start date primary key,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_clip_finance_month_start_valid
    check (month_start = date_trunc('month', month_start)::date),
  constraint admin_clip_finance_input_snapshot_object
    check (jsonb_typeof(input_snapshot) = 'object'),
  constraint admin_clip_finance_result_snapshot_object
    check (jsonb_typeof(result_snapshot) = 'object')
);

drop trigger if exists admin_clip_finance_monthly_results_set_updated_at
  on public.admin_clip_finance_monthly_results;
create trigger admin_clip_finance_monthly_results_set_updated_at
before update on public.admin_clip_finance_monthly_results
for each row execute function private.set_updated_at();

alter table public.admin_clip_finance_monthly_results enable row level security;
drop policy if exists admin_clip_finance_monthly_results_admin_all
  on public.admin_clip_finance_monthly_results;
create policy admin_clip_finance_monthly_results_admin_all
on public.admin_clip_finance_monthly_results
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

grant select, insert, update, delete
  on public.admin_clip_finance_monthly_results to authenticated;
revoke all on public.admin_clip_finance_monthly_results from anon;

commit;
