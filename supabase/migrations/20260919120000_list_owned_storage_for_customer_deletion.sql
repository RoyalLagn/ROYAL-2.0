begin;

create or replace function public.list_own_storage_objects_for_account_deletion()
returns table (
  storage_bucket_id text,
  storage_object_name text
)
language sql
security definer
set search_path = ''
as $$
  select objects.bucket_id, objects.name
  from storage.objects as objects
  where objects.owner_id = auth.uid()::text;
$$;

revoke all on function public.list_own_storage_objects_for_account_deletion() from public, anon;
grant execute on function public.list_own_storage_objects_for_account_deletion() to authenticated;

comment on function public.list_own_storage_objects_for_account_deletion() is
  'Lists only the authenticated user owned Storage objects so verified account deletion can remove them through the Storage API before deleting the Auth identity.';

commit;
