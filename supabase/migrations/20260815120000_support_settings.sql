begin;

create table public.support_settings (
  id boolean primary key default true check (id),
  support_email text,
  support_phone text,
  show_email boolean not null default true,
  show_phone boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint support_settings_email_length check (support_email is null or char_length(support_email) <= 254),
  constraint support_settings_phone_length check (support_phone is null or char_length(support_phone) <= 40),
  constraint support_settings_email_format check (
    support_email is null or btrim(support_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint support_settings_phone_format check (
    support_phone is null or (
      btrim(support_phone) ~ '^\+?[0-9() -]+$'
      and char_length(regexp_replace(support_phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  ),
  constraint support_settings_visible_method check (
    (show_email and nullif(btrim(support_email), '') is not null)
    or (show_phone and nullif(btrim(support_phone), '') is not null)
  )
);

insert into public.support_settings (id, support_email, support_phone, show_email, show_phone)
values (true, 'support@royallagn.com', null, true, false)
on conflict (id) do nothing;

alter table public.support_settings enable row level security;
alter table public.support_settings replica identity full;

revoke all on public.support_settings from anon, authenticated;
grant select on public.support_settings to anon, authenticated;
grant update on public.support_settings to authenticated;

create policy support_settings_public_read
on public.support_settings for select to anon, authenticated using (true);

create policy support_settings_admin_update
on public.support_settings for update to authenticated
using (private.is_admin()) with check (private.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'support_settings'
    )
  then
    alter publication supabase_realtime add table public.support_settings;
  end if;
end
$$;

commit;
