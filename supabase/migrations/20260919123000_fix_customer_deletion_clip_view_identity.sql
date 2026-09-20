begin;

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

  -- profiles.id is deleted by the Auth cascade. clip_views.viewer_id uses
  -- ON DELETE SET NULL, but clip_views_identity_required rejects that update
  -- unless the retained analytics row has an anonymous session identity.
  -- Give every affected row a unique opaque identity before deleting Auth.
  update public.clip_views
  set session_hash = coalesce(
    nullif(btrim(session_hash), ''),
    'deleted:' || gen_random_uuid()::text
  )
  where viewer_id = current_user_id;

  -- vendor_enquiries_actor_check likewise requires either a customer or guest
  -- actor. Retain the enquiry anonymously while removing customer PII.
  update public.vendor_enquiries
  set customer_id = null,
      guest_session_id = coalesce(guest_session_id, gen_random_uuid()),
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
  'Anonymizes retained customer enquiries and clip-view analytics before the verified customer auth user is permanently deleted.';

commit;
