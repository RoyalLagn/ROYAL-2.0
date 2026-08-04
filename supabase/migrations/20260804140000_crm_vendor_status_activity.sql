begin;

-- Status-change RPC for the Phase 3 vendor list/profile: mirrors
-- admin_manage_vendor — updates crm_vendors.status and logs a crm_activities
-- row (crm_activities has no direct insert policy, so this RPC is the only
-- way rows are written to it).

create or replace function public.admin_crm_update_vendor_status(
  target_vendor_id uuid,
  new_status public.crm_vendor_status,
  note text default null
) returns public.crm_vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_vendors;
  previous_status public.crm_vendor_status;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select status into previous_status from public.crm_vendors where id = target_vendor_id;
  if previous_status is null then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;

  update public.crm_vendors
  set status = new_status, updated_by = auth.uid(), updated_at = now()
  where id = target_vendor_id
  returning * into result;

  insert into public.crm_activities (vendor_id, actor_id, action, from_status, to_status, metadata)
  values (
    target_vendor_id, auth.uid(), 'status_change', previous_status, new_status,
    case when note is null or btrim(note) = '' then '{}'::jsonb else jsonb_build_object('note', note) end
  );

  return result;
end;
$$;

revoke all on function public.admin_crm_update_vendor_status(uuid, public.crm_vendor_status, text) from public, anon;
grant execute on function public.admin_crm_update_vendor_status(uuid, public.crm_vendor_status, text) to authenticated;

commit;
