begin;

-- Strengthen inbox realtime + ownership for customer/vendor notification panels.
-- Admin push_campaigns history is untouched; deletes only remove a user's own rows.

alter table public.customer_notifications replica identity full;
alter table public.vendor_notifications replica identity full;

create index if not exists customer_notifications_owner_unread_idx
  on public.customer_notifications (customer_id, is_read, created_at desc);

create index if not exists vendor_notifications_owner_unread_idx
  on public.vendor_notifications (vendor_id, is_read, created_at desc);

-- Re-affirm customer ownership policies (select/update/delete own rows only).
drop policy if exists customer_notifications_owner_select on public.customer_notifications;
create policy customer_notifications_owner_select
on public.customer_notifications for select to authenticated
using (customer_id = auth.uid());

drop policy if exists customer_notifications_owner_update on public.customer_notifications;
create policy customer_notifications_owner_update
on public.customer_notifications for update to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

drop policy if exists customer_notifications_owner_delete on public.customer_notifications;
create policy customer_notifications_owner_delete
on public.customer_notifications for delete to authenticated
using (customer_id = auth.uid());

-- Vendor inbox remains owner-managed (includes delete of own vendor rows only).
drop policy if exists notifications_owner_manage on public.vendor_notifications;
create policy notifications_owner_manage
on public.vendor_notifications
for all to authenticated
using (private.workspace_vendor_owned(vendor_id))
with check (private.workspace_vendor_owned(vendor_id));

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
end $$;

notify pgrst, 'reload schema';

commit;
