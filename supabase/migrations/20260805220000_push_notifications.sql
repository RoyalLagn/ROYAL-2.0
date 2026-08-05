begin;

-- =========================================================================
-- Push Notifications
-- Device tokens + admin campaign history. Inbox rows continue to live in
-- customer_notifications / vendor_notifications so existing bells/screens
-- keep working unchanged.
-- =========================================================================

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  token text not null,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_not_blank check (btrim(token) <> ''),
  constraint push_tokens_platform_valid check (
    platform in ('ios', 'android', 'web', 'unknown')
  ),
  constraint push_tokens_role_valid check (
    role in ('public_user', 'vendor', 'admin')
  )
);

create unique index if not exists push_tokens_profile_token_unique_idx
  on public.push_tokens (profile_id, token);

create index if not exists push_tokens_role_idx
  on public.push_tokens (role, updated_at desc);

create index if not exists push_tokens_token_idx
  on public.push_tokens (token);

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function private.set_updated_at();

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  image_url text,
  audience text not null,
  target_vendor_id uuid references public.vendors (id) on delete set null,
  target_path text,
  status text not null default 'pending',
  inbox_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_campaigns_title_not_blank check (btrim(title) <> ''),
  constraint push_campaigns_message_not_blank check (btrim(message) <> ''),
  constraint push_campaigns_audience_valid check (
    audience in ('customers', 'vendors', 'everyone', 'vendor')
  ),
  constraint push_campaigns_status_valid check (
    status in ('pending', 'sending', 'sent', 'partial', 'failed')
  ),
  constraint push_campaigns_vendor_required check (
    audience <> 'vendor' or target_vendor_id is not null
  ),
  constraint push_campaigns_counts_nonnegative check (
    inbox_count >= 0 and sent_count >= 0 and failed_count >= 0
  )
);

create index if not exists push_campaigns_created_at_idx
  on public.push_campaigns (created_at desc);

create index if not exists push_campaigns_audience_idx
  on public.push_campaigns (audience, created_at desc);

drop trigger if exists push_campaigns_set_updated_at on public.push_campaigns;
create trigger push_campaigns_set_updated_at
before update on public.push_campaigns
for each row execute function private.set_updated_at();

alter table public.push_tokens enable row level security;
alter table public.push_campaigns enable row level security;

revoke all on table public.push_tokens from public, anon, authenticated;
revoke all on table public.push_campaigns from public, anon, authenticated;

grant select, insert, update, delete on table public.push_tokens to authenticated;
grant select on table public.push_campaigns to authenticated;

-- Users manage only their own device tokens.
drop policy if exists push_tokens_owner_select on public.push_tokens;
create policy push_tokens_owner_select
on public.push_tokens for select to authenticated
using (profile_id = auth.uid() or private.is_admin());

drop policy if exists push_tokens_owner_insert on public.push_tokens;
create policy push_tokens_owner_insert
on public.push_tokens for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists push_tokens_owner_update on public.push_tokens;
create policy push_tokens_owner_update
on public.push_tokens for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists push_tokens_owner_delete on public.push_tokens;
create policy push_tokens_owner_delete
on public.push_tokens for delete to authenticated
using (profile_id = auth.uid() or private.is_admin());

-- Campaign history is admin-only (writes go through the Edge Function / service role).
drop policy if exists push_campaigns_admin_select on public.push_campaigns;
create policy push_campaigns_admin_select
on public.push_campaigns for select to authenticated
using (private.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'push_campaigns'
    ) then
      alter publication supabase_realtime add table public.push_campaigns;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
