begin;

create table if not exists public.communication_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists communication_preferences_set_updated_at on public.communication_preferences;
create trigger communication_preferences_set_updated_at
before update on public.communication_preferences
for each row execute function private.set_updated_at();

alter table public.communication_preferences enable row level security;
revoke all on table public.communication_preferences from public, anon, authenticated;
grant select, insert, update on table public.communication_preferences to authenticated;

drop policy if exists communication_preferences_owner_select on public.communication_preferences;
create policy communication_preferences_owner_select
on public.communication_preferences for select to authenticated
using (profile_id = auth.uid());

drop policy if exists communication_preferences_owner_insert on public.communication_preferences;
create policy communication_preferences_owner_insert
on public.communication_preferences for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists communication_preferences_owner_update on public.communication_preferences;
create policy communication_preferences_owner_update
on public.communication_preferences for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

notify pgrst, 'reload schema';

commit;
