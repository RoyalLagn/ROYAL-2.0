begin;

-- Single-row admin settings table for the CRM, mirroring
-- public.location_settings — currently just holds the monthly vendor
-- registration target used by the Reports "Sales Target" progress ring.

create table public.crm_settings (
  id boolean primary key default true check (id),
  monthly_vendor_target integer not null default 50,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crm_settings_target_positive check (monthly_vendor_target >= 0)
);

insert into public.crm_settings (id, monthly_vendor_target)
values (true, 50)
on conflict (id) do nothing;

create trigger crm_settings_set_updated_at before update on public.crm_settings
for each row execute function private.set_updated_at();

alter table public.crm_settings enable row level security;
revoke all on public.crm_settings from public, anon, authenticated;
grant select, update on public.crm_settings to authenticated;

create policy crm_settings_admin_all on public.crm_settings for all to authenticated
using (private.is_admin()) with check (private.is_admin());

commit;
