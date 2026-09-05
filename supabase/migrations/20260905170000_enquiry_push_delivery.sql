begin;

create table if not exists public.enquiry_push_deliveries (
  enquiry_id uuid primary key references public.vendor_enquiries(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_summary text,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.enquiry_push_deliveries enable row level security;
revoke all on public.enquiry_push_deliveries from public, anon, authenticated;
grant usage on schema public to service_role;
grant select on public.vendor_enquiries, public.vendors, public.push_tokens to service_role;
grant select, insert, update on public.enquiry_push_deliveries to service_role;

commit;
