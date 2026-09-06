grant select, update on public.account_deletion_requests to authenticated;

comment on policy account_deletion_requests_admin_read on public.account_deletion_requests is
  'Authenticated sessions may read only when the row-level policy confirms an active Admin profile.';
comment on policy account_deletion_requests_admin_update on public.account_deletion_requests is
  'Authenticated sessions may update only when the row-level policy confirms an active Admin profile.';
