create or replace function public.prepare_customer_account_deletion()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = current_user_id and role = 'public_user'
  ) then
    raise exception 'Only customer accounts can use self-service deletion';
  end if;

  if exists (select 1 from public.vendors where profile_id = current_user_id) then
    raise exception 'Vendor accounts require an administrator-reviewed deletion request';
  end if;

  -- Keep the operational enquiry event while permanently removing customer PII.
  update public.vendor_enquiries
  set customer_id = null,
      customer_name = 'Deleted customer',
      customer_email = null,
      customer_phone = null,
      message = 'Customer account deleted.',
      event_date = null,
      event_type = null,
      updated_at = now()
  where customer_id = current_user_id;
end;
$$;

revoke all on function public.prepare_customer_account_deletion() from public, anon;
grant execute on function public.prepare_customer_account_deletion() to authenticated;

comment on function public.prepare_customer_account_deletion() is
  'Anonymizes retained customer enquiry records before the verified customer auth user is permanently deleted.';
