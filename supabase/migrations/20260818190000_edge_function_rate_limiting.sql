begin;

-- Backing store for a simple fixed-window rate limiter used by Edge
-- Functions (create-razorpay-order, verify-razorpay-payment,
-- submit-vendor-application, send-admin-push, admin-delete-clip,
-- admin-logout-all-devices -- see supabase/functions/_shared/rateLimit.ts).
--
-- Purely additive: no existing table, function, or policy is touched.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  rate_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_key_created_idx
  on public.rate_limit_events (rate_key, created_at desc);

alter table public.rate_limit_events enable row level security;

-- No policies are created for anon/authenticated on purpose: this table is
-- written to and read from exclusively by Edge Functions using the
-- service-role key, which bypasses RLS entirely. Revoking direct grants
-- keeps it unreachable to every other role even if RLS were ever
-- accidentally disabled -- there is nothing here worth exposing anyway
-- (no user-identifying data, just an opaque rate-limit key and a
-- timestamp), but the table stays private regardless.
revoke all on public.rate_limit_events from public, anon, authenticated;

commit;
