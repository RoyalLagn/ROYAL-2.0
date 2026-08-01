-- Persistent, account-scoped notification state for customers and vendors.

alter table public.vendor_notifications
  add column if not exists read_at timestamptz,
  add column if not exists target_path text;

update public.vendor_notifications
set read_at = coalesce(read_at, created_at)
where is_read and read_at is null;

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'admin_announcement',
  title text not null,
  message text not null,
  target_path text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_notifications_recent_idx
  on public.customer_notifications(customer_id, created_at desc);

create index if not exists customer_notifications_unread_idx
  on public.customer_notifications(customer_id, created_at desc)
  where not is_read;

create or replace function private.sync_notification_read_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_read then
    new.read_at := coalesce(new.read_at, now());
  else
    new.read_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_notifications_sync_read_at on public.vendor_notifications;
create trigger vendor_notifications_sync_read_at
before insert or update of is_read on public.vendor_notifications
for each row execute function private.sync_notification_read_at();

drop trigger if exists customer_notifications_sync_read_at on public.customer_notifications;
create trigger customer_notifications_sync_read_at
before insert or update of is_read on public.customer_notifications
for each row execute function private.sync_notification_read_at();

alter table public.customer_notifications enable row level security;

grant select, insert, update, delete on public.customer_notifications to authenticated;

drop policy if exists customer_notifications_owner_select on public.customer_notifications;
create policy customer_notifications_owner_select
on public.customer_notifications for select to authenticated
using (customer_id = auth.uid());

drop policy if exists customer_notifications_owner_insert on public.customer_notifications;
create policy customer_notifications_owner_insert
on public.customer_notifications for insert to authenticated
with check (
  customer_id = auth.uid()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'public_user'
  )
);

drop policy if exists customer_notifications_owner_update on public.customer_notifications;
create policy customer_notifications_owner_update
on public.customer_notifications for update to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

drop policy if exists customer_notifications_owner_delete on public.customer_notifications;
create policy customer_notifications_owner_delete
on public.customer_notifications for delete to authenticated
using (customer_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'customer_notifications'
    ) then
      alter publication supabase_realtime add table public.customer_notifications;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vendor_notifications'
    ) then
      alter publication supabase_realtime add table public.vendor_notifications;
    end if;
  end if;
end;
$$;
