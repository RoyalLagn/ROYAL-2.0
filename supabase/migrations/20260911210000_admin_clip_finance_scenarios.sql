begin;

create table if not exists public.admin_clip_finance_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_vendors integer not null default 100 check (total_vendors >= 0),
  free_percent numeric(5,2) not null default 60 check (free_percent between 0 and 100),
  premium_percent numeric(5,2) not null default 30 check (premium_percent between 0 and 100),
  elite_percent numeric(5,2) not null default 10 check (elite_percent between 0 and 100),
  monthly_clip_viewers integer not null default 2000 check (monthly_clip_viewers >= 0),
  monthly_operating_expenses numeric(14,2) not null default 0 check (monthly_operating_expenses >= 0),
  income_tax_percent numeric(5,2) not null default 32.5 check (income_tax_percent between 0 and 100),
  bandwidth_network text not null default 'volume' check (bandwidth_network in ('volume', 'asia')),
  on_season_months integer not null default 9 check (on_season_months between 0 and 12),
  off_season_percent numeric(5,2) not null default 40 check (off_season_percent between 0 and 100),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_clip_finance_scenario_name_valid check (char_length(btrim(name)) between 2 and 100),
  constraint admin_clip_finance_scenario_percent_total check (free_percent + premium_percent + elite_percent = 100)
);

drop trigger if exists admin_clip_finance_scenarios_set_updated_at on public.admin_clip_finance_scenarios;
create trigger admin_clip_finance_scenarios_set_updated_at before update on public.admin_clip_finance_scenarios
for each row execute function private.set_updated_at();

alter table public.admin_clip_finance_scenarios enable row level security;
drop policy if exists admin_clip_finance_scenarios_admin_all on public.admin_clip_finance_scenarios;
create policy admin_clip_finance_scenarios_admin_all on public.admin_clip_finance_scenarios
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
grant select, insert, update, delete on public.admin_clip_finance_scenarios to authenticated;
revoke all on public.admin_clip_finance_scenarios from anon;

commit;
