begin;

-- Distinguishes phone calls from in-person meetings/visits so the Phase 4
-- Tasks screen can show separate "Today's Calls" and "Today's Meetings"
-- lists instead of lumping every follow-up together.

create type public.crm_followup_type as enum ('call', 'meeting', 'visit', 'other');

alter table public.crm_followups
  add column type public.crm_followup_type not null default 'call';

create index crm_followups_type_schedule_idx
  on public.crm_followups (type, scheduled_date, status);

commit;
