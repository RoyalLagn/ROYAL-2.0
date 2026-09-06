alter table public.admin_notifications
  add column if not exists body text,
  add column if not exists kind text not null default 'vendor_application',
  add column if not exists target_path text,
  add column if not exists deletion_request_id uuid unique references public.account_deletion_requests(id) on delete cascade;

update public.admin_notifications
set target_path = '/VendorApplicationDetails?id=' || application_id::text
where application_id is not null and target_path is null;

create index if not exists admin_notifications_kind_created_idx
  on public.admin_notifications(kind, created_at desc);

create or replace function private.notify_admin_vendor_deletion_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare business_name text;
begin
  if new.account_type <> 'vendor' or new.status not in ('pending','verified') then return new; end if;
  business_name := nullif(btrim(new.vendor_snapshot->>'business_name'), '');
  insert into public.admin_notifications(title, body, kind, target_path, deletion_request_id)
  values (
    'Vendor deletion request' || case when business_name is not null then ' · ' || business_name else '' end,
    'A vendor verified their registered email and requested account deletion.',
    'vendor_deletion',
    '/AdminVendorDeletionRequests?requestId=' || new.id::text,
    new.id
  ) on conflict (deletion_request_id) do nothing;
  return new;
end $$;

drop trigger if exists account_deletion_notify_admin on public.account_deletion_requests;
create trigger account_deletion_notify_admin
after insert on public.account_deletion_requests
for each row execute function private.notify_admin_vendor_deletion_request();

insert into public.admin_notifications(title, body, kind, target_path, deletion_request_id)
select
  'Vendor deletion request' || case when nullif(btrim(request.vendor_snapshot->>'business_name'), '') is not null then ' · ' || btrim(request.vendor_snapshot->>'business_name') else '' end,
  'A vendor verified their registered email and requested account deletion.',
  'vendor_deletion',
  '/AdminVendorDeletionRequests?requestId=' || request.id::text,
  request.id
from public.account_deletion_requests request
where request.account_type='vendor' and request.status in ('pending','verified','processing')
on conflict (deletion_request_id) do nothing;

create or replace function private.resolve_admin_vendor_deletion_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.account_type = 'vendor' and new.status in ('completed','rejected','cancelled') then
    update public.admin_notifications set is_read=true where deletion_request_id=new.id;
  end if;
  return new;
end $$;

drop trigger if exists account_deletion_resolve_admin_notification on public.account_deletion_requests;
create trigger account_deletion_resolve_admin_notification
after update of status on public.account_deletion_requests
for each row when (new.status is distinct from old.status)
execute function private.resolve_admin_vendor_deletion_notification();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='admin_notifications') then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;
