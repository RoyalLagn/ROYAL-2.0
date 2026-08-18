create or replace function public.update_terms_and_conditions(target_content text)
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
    raise exception 'Terms & Conditions cannot be empty' using errcode = '22023';
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
    'terms_and_conditions',
    jsonb_build_object('content', normalized_content),
    'json',
    'Public RoyalLagn Terms & Conditions managed from the admin workspace.',
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

revoke all on function public.update_terms_and_conditions(text) from public, anon;
grant execute on function public.update_terms_and_conditions(text) to authenticated;
