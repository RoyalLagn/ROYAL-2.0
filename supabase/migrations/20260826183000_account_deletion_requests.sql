create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  account_type text not null check (account_type in ('customer', 'vendor')),
  email text not null,
  full_name text,
  phone text,
  reason text,
  requester_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'processing', 'completed', 'rejected', 'cancelled')),
  admin_notes text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_status_requested_idx
  on public.account_deletion_requests (status, requested_at desc);
create index if not exists account_deletion_requests_email_idx
  on public.account_deletion_requests (lower(email));

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

create policy account_deletion_requests_admin_read
  on public.account_deletion_requests for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

create policy account_deletion_requests_admin_update
  on public.account_deletion_requests for update to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

comment on table public.account_deletion_requests is
  'Identity-verified customer and vendor account deletion requests. Submission is only through the rate-limited Edge Function.';
