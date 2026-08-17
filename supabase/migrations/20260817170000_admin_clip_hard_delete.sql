begin;

-- No generic admin audit-log table exists in this project (checked:
-- admin_vendor_activity and crm_activities are the only precedents, both
-- narrowly scoped to their own feature, not a shared table). A real,
-- irreversible deletion of a vendor's content on the admin's say-so is
-- exactly the kind of action those precedents exist for, so this follows the
-- same narrow, per-feature pattern rather than introducing a generic
-- audit_log architecture.
create table public.clip_deletion_log (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  clip_title text not null,
  reason text not null,
  deleted_by uuid not null references public.profiles(id) on delete restrict,
  cloudinary_public_id text,
  created_at timestamptz not null default now(),
  constraint clip_deletion_log_reason_not_blank check (btrim(reason) <> '')
);

create index clip_deletion_log_vendor_idx on public.clip_deletion_log (vendor_id, created_at desc);

alter table public.clip_deletion_log enable row level security;
revoke all on public.clip_deletion_log from anon, authenticated;
create policy clip_deletion_log_admin_read
  on public.clip_deletion_log for select to authenticated
  using (private.is_admin());
-- No insert/update/delete policy for anon/authenticated: every row is
-- written exclusively by admin_hard_delete_clip() below (security definer),
-- never directly by a client.

-- Real, permanent deletion — not a status flip. clip_likes/clip_saves/
-- clip_views/clip_reports/clip_watch_history all already declare
-- `references public.clips(id) on delete cascade` (from
-- 20260729150000_create_clips_foundation.sql / 20260730210000), so removing
-- the clips row here cleans up exactly that clip's engagement/analytics rows
-- automatically and cannot touch any other clip's data. Nothing else
-- references clips.id.
create or replace function public.admin_hard_delete_clip(target_clip_id uuid, deletion_reason text)
returns table (vendor_id uuid, cloudinary_public_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  clip record;
  trimmed_reason text := btrim(coalesce(deletion_reason, ''));
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if trimmed_reason = '' then
    raise exception 'A deletion reason is required';
  end if;

  select c.id, c.vendor_id, c.category_id, c.title, c.cloudinary_public_id
  into clip
  from public.clips c
  where c.id = target_clip_id
  for update;

  if clip.id is null then
    raise exception 'Clip not found';
  end if;

  insert into public.clip_deletion_log (
    clip_id, vendor_id, category_id, clip_title, reason, deleted_by, cloudinary_public_id
  ) values (
    clip.id, clip.vendor_id, clip.category_id, clip.title, trimmed_reason, auth.uid(), clip.cloudinary_public_id
  );

  delete from public.clips where id = target_clip_id;

  return query select clip.vendor_id, clip.cloudinary_public_id;
end;
$$;

revoke all on function public.admin_hard_delete_clip(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_clip(uuid, text) to authenticated;

commit;
