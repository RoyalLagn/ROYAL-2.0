create unique index if not exists account_deletion_requests_one_active_vendor_idx
  on public.account_deletion_requests (vendor_id)
  where account_type = 'vendor'
    and vendor_id is not null
    and status in ('pending', 'verified', 'processing');

comment on index public.account_deletion_requests_one_active_vendor_idx is
  'Prevents concurrent duplicate vendor deletion requests while allowing a new request after rejection or cancellation.';
