insert into public.application_settings (
  key,
  value,
  value_type,
  description,
  is_public
)
values (
  'privacy_policy',
  jsonb_build_object(
    'content',
    E'RoyalLagn uses the account, profile and activity information you provide, such as your name, contact details, favourites and enquiries, to operate your account and connect you with wedding vendors.\n\nRoyalLagn does not sell your personal information. Information is used to operate the marketplace, support enquiries, protect the platform and improve your experience.\n\nInformation is retained only for as long as it is needed for the purposes described in this policy or to meet legal and security requirements.'
  ),
  'json',
  'Public RoyalLagn Privacy Policy managed from the admin workspace.',
  true
)
on conflict (key) do nothing;

create or replace function public.update_privacy_policy(target_content text)
returns table (value jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_content text := btrim(target_content);
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'super_admin')
      and is_active
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if normalized_content = '' then
    raise exception 'Privacy Policy cannot be empty' using errcode = '22023';
  end if;

  return query
  insert into public.application_settings (
    key,
    value,
    value_type,
    description,
    is_public,
    updated_by
  )
  values (
    'privacy_policy',
    jsonb_build_object('content', normalized_content),
    'json',
    'Public RoyalLagn Privacy Policy managed from the admin workspace.',
    true,
    auth.uid()
  )
  on conflict (key) do update set
    value = excluded.value,
    value_type = excluded.value_type,
    description = excluded.description,
    is_public = true,
    updated_by = excluded.updated_by
  returning application_settings.value, application_settings.updated_at;
end;
$$;

revoke all on function public.update_privacy_policy(text) from public, anon;
grant execute on function public.update_privacy_policy(text) to authenticated;
