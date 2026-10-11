-- Fix refresh_my_subscription_access returning 403 for non-vendor users
create or replace function public.refresh_my_subscription_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid := private.subscription_vendor_for_user();
begin
  if target_vendor_id is null then
    return '{}'::jsonb;
  end if;
  perform public.process_subscription_lifecycle(now());
  return private.reconcile_vendor_subscription_media(target_vendor_id);
end;
$$;

grant execute on function public.refresh_my_subscription_access() to authenticated, anon;
