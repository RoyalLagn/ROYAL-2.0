grant select, insert, update, delete on public.account_deletion_requests to service_role;
grant select, insert, update on public.admin_notifications to service_role;

comment on table public.account_deletion_requests is
  'Identity-verified deletion requests. Service-role access is required only by the authenticated request and Admin processing Edge Functions.';
