alter table public.account_deletion_requests
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists vendor_snapshot jsonb,
  add column if not exists email_verified_at timestamptz,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists processing_stage text,
  add column if not exists processing_error text;

create index if not exists account_deletion_requests_vendor_idx
  on public.account_deletion_requests(vendor_id, requested_at desc);

drop policy if exists account_deletion_requests_admin_read on public.account_deletion_requests;
create policy account_deletion_requests_admin_read
  on public.account_deletion_requests for select to authenticated
  using (exists (select 1 from public.profiles where id=auth.uid() and role = 'admin' and is_active));
drop policy if exists account_deletion_requests_admin_update on public.account_deletion_requests;
create policy account_deletion_requests_admin_update
  on public.account_deletion_requests for update to authenticated
  using (exists (select 1 from public.profiles where id=auth.uid() and role = 'admin' and is_active))
  with check (exists (select 1 from public.profiles where id=auth.uid() and role = 'admin' and is_active));

create or replace function public.admin_prepare_vendor_deletion(target_request_id uuid, admin_reason text)
returns table(vendor_id uuid, profile_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare selected_request public.account_deletion_requests%rowtype;
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role = 'admin' and is_active) then raise exception 'Administrator access required'; end if;
  if nullif(btrim(admin_reason), '') is null then raise exception 'An approval reason is required'; end if;
  select * into selected_request from public.account_deletion_requests where id = target_request_id for update;
  if selected_request.id is null or selected_request.account_type <> 'vendor' then raise exception 'Vendor deletion request not found'; end if;
  if selected_request.status not in ('pending', 'verified') then raise exception 'This request is no longer pending'; end if;
  if selected_request.email_verified_at is null then raise exception 'Vendor email is not verified'; end if;
  update public.account_deletion_requests set status='processing', decided_by=auth.uid(), decided_at=now(), decision_reason=btrim(admin_reason), processing_stage='database', processing_error=null, updated_at=now() where id=target_request_id;
  return query select v.id, v.profile_id from public.vendors v where v.id=selected_request.vendor_id;
end $$;

create or replace function public.admin_complete_vendor_deletion(target_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare selected_request public.account_deletion_requests%rowtype;
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role = 'admin' and is_active) then raise exception 'Administrator access required'; end if;
  select * into selected_request from public.account_deletion_requests where id=target_request_id for update;
  if selected_request.status <> 'processing' then raise exception 'Request is not processing'; end if;
  delete from public.clips where vendor_id=selected_request.vendor_id;
  delete from public.vendor_applications where profile_id=selected_request.requester_user_id;
  delete from public.vendors where id=selected_request.vendor_id;
  update public.account_deletion_requests set status='processing', processing_stage='auth', processing_error=null, updated_at=now() where id=target_request_id;
end $$;

revoke all on function public.admin_prepare_vendor_deletion(uuid,text) from public, anon;
revoke all on function public.admin_complete_vendor_deletion(uuid) from public, anon;
grant execute on function public.admin_prepare_vendor_deletion(uuid,text) to authenticated;
grant execute on function public.admin_complete_vendor_deletion(uuid) to authenticated;
