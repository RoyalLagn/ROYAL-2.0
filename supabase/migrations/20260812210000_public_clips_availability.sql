begin;

insert into public.application_settings(key, value, value_type, description, is_public)
values (
  'public_clips_enabled',
  'true'::jsonb,
  'boolean',
  'Show the Clips experience in the public app.',
  true
)
on conflict (key) do nothing;

create or replace function private.public_clips_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean
        else true
      end
      from public.application_settings
      where key = 'public_clips_enabled'
    ),
    true
  );
$$;

create or replace function public.get_public_clips_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_clips_enabled();
$$;

create or replace function public.admin_set_public_clips_enabled(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  insert into public.application_settings(key, value, value_type, description, is_public, updated_by)
  values (
    'public_clips_enabled',
    to_jsonb(enabled),
    'boolean',
    'Show the Clips experience in the public app.',
    true,
    auth.uid()
  )
  on conflict (key) do update set
    value = excluded.value,
    value_type = excluded.value_type,
    description = excluded.description,
    is_public = true,
    updated_by = auth.uid(),
    updated_at = now();

  return enabled;
end;
$$;

revoke all on function public.get_public_clips_enabled() from public;
revoke all on function public.admin_set_public_clips_enabled(boolean) from public;
grant execute on function public.get_public_clips_enabled() to anon, authenticated;
grant execute on function public.admin_set_public_clips_enabled(boolean) to authenticated;

commit;
