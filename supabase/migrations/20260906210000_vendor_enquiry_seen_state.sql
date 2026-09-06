begin;

alter table public.vendor_enquiries
  add column if not exists vendor_seen_at timestamptz;

create index if not exists vendor_enquiries_unseen_idx
  on public.vendor_enquiries (vendor_id, created_at desc)
  where vendor_seen_at is null;

create or replace function public.mark_vendor_enquiry_seen(target_enquiry_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  seen_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.vendor_enquiries e
  set vendor_seen_at = coalesce(e.vendor_seen_at, now())
  where e.id = target_enquiry_id
    and private.workspace_vendor_owned(e.vendor_id)
  returning e.vendor_seen_at into seen_at;

  if seen_at is null then
    raise exception 'Enquiry not found or access denied';
  end if;

  return seen_at;
end;
$$;

revoke all on function public.mark_vendor_enquiry_seen(uuid) from public, anon;
grant execute on function public.mark_vendor_enquiry_seen(uuid) to authenticated;

commit;
