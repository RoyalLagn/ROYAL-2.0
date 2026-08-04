begin;

-- =========================================================================
-- Vendor Public Profile Platform (Phase 2)
-- New public-profile content (awards/languages/business hours/FAQs — display
-- only, no editor yet) and event-level analytics feeding the vendor
-- dashboard's Public Profile card.
-- =========================================================================

alter table public.vendors
  add column if not exists awards text[] not null default '{}',
  add column if not exists languages text[] not null default '{}',
  add column if not exists business_hours jsonb;

create table if not exists public.vendor_faqs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  question text not null,
  answer text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint vendor_faqs_question_not_blank check (btrim(question) <> ''),
  constraint vendor_faqs_answer_not_blank check (btrim(answer) <> '')
);

create index if not exists vendor_faqs_vendor_idx
  on public.vendor_faqs(vendor_id, display_order);

alter table public.vendor_faqs enable row level security;
grant select on public.vendor_faqs to anon, authenticated;

create policy "vendor_faqs_public_owner_admin_read"
on public.vendor_faqs for select
to anon, authenticated
using (
  (select private.vendor_is_public(vendor_id))
  or (select private.owns_vendor(vendor_id))
  or (select private.is_admin())
);

-- ---------------------------------------------------------------------
-- Event-level analytics
-- ---------------------------------------------------------------------

create table if not exists public.vendor_profile_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  event_type text not null check (event_type in (
    'view', 'qr_scan', 'link_share', 'copy_link',
    'call_click', 'whatsapp_click', 'website_click', 'instagram_click', 'enquiry'
  )),
  source text,
  guest_session_id text,
  created_at timestamptz not null default now()
);

create index if not exists vendor_profile_events_vendor_idx
  on public.vendor_profile_events(vendor_id, event_type, created_at desc);

alter table public.vendor_profile_events enable row level security;

create policy "vendor_profile_events_owner_or_admin_read"
on public.vendor_profile_events for select
to authenticated
using (
  (select private.owns_vendor(vendor_id))
  or (select private.is_admin())
);

create or replace function public.record_vendor_profile_event(
  target_vendor_id uuid,
  event_type text,
  source text default null,
  guest_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if event_type not in (
    'view', 'qr_scan', 'link_share', 'copy_link',
    'call_click', 'whatsapp_click', 'website_click', 'instagram_click', 'enquiry'
  ) then
    raise exception 'Invalid event type' using errcode = '22023';
  end if;

  if not exists (select 1 from public.vendors v where v.id = target_vendor_id) then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;

  insert into public.vendor_profile_events (vendor_id, event_type, source, guest_session_id)
  values (target_vendor_id, event_type, nullif(btrim(coalesce(source, '')), ''), nullif(btrim(coalesce(guest_id, '')), ''));
end;
$$;

revoke all on function public.record_vendor_profile_event(uuid, text, text, text) from public;
grant execute on function public.record_vendor_profile_event(uuid, text, text, text) to anon, authenticated;

create or replace function public.get_vendor_profile_analytics(target_vendor_id uuid)
returns table (
  event_type text,
  source text,
  event_count bigint,
  unique_visitors bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.event_type,
    coalesce(e.source, 'unknown') source,
    count(*) event_count,
    count(distinct e.guest_session_id) filter (where e.guest_session_id is not null) unique_visitors
  from public.vendor_profile_events e
  where e.vendor_id = target_vendor_id
    and (
      (select private.owns_vendor(target_vendor_id))
      or (select private.is_admin())
    )
  group by e.event_type, coalesce(e.source, 'unknown')
$$;

revoke all on function public.get_vendor_profile_analytics(uuid) from public;
grant execute on function public.get_vendor_profile_analytics(uuid) to authenticated;

commit;
