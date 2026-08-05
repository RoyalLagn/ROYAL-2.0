begin;

-- Root cause
-- -----------
-- services/publicAuth.ts completed a public registration with two
-- independent writes: supabase.auth.updateUser({ password }) followed by a
-- client-side INSERT into public.profiles. Nothing tied them together.
--
-- When the second write failed for any reason -- an RLS WITH CHECK miss, the
-- preferred_city_id/preferred_area_id foreign keys, the managed-location
-- trigger, or simply a dropped connection -- the auth user already existed
-- with a confirmed email and a working password, but had no profile row.
-- That half-created account is unusable and unrecoverable from the UI:
--
--   * retrying signup reaches completePublicSignup again and repeats the same
--     failing INSERT;
--   * logging in succeeds at signInWithPassword, then getOwnProfile returns
--     null, so loginPublicUser raises "This account is not a Public User
--     account." and signs the user straight back out.
--
-- The user experiences this as "I completed every step and the account was
-- not created", which is exactly what was reported.
--
-- Fix: move profile creation into one idempotent SECURITY DEFINER RPC that
-- derives identity from the caller's JWT rather than trusting client input,
-- so the operation can be retried safely and can also heal an account that
-- was left half-created by the old code path.

create or replace function public.complete_public_registration(
  full_name text,
  phone text default null,
  preferred_city_id uuid default null,
  preferred_area_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'You must verify your email before creating an account'
      using errcode = '42501';
  end if;
  if caller_email = '' then
    raise exception 'Your verified session does not carry an email address'
      using errcode = '42501';
  end if;
  if btrim(coalesce(full_name, '')) = '' then
    raise exception 'Enter your full name' using errcode = '22023';
  end if;

  -- An existing row belonging to another role must never be silently
  -- rewritten into a public_user profile.
  if exists (
    select 1 from public.profiles p
    where p.id = caller_id and p.role <> 'public_user'
  ) then
    raise exception 'This email is already registered for a different RoyalLagn account'
      using errcode = '42501';
  end if;

  insert into public.profiles as p (
    id, email, full_name, phone, role, is_active,
    preferred_city_id, preferred_area_id
  )
  values (
    caller_id, caller_email, btrim(full_name), nullif(btrim(coalesce(phone, '')), ''),
    'public_user', true, preferred_city_id, preferred_area_id
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, p.phone),
    preferred_city_id = coalesce(excluded.preferred_city_id, p.preferred_city_id),
    preferred_area_id = coalesce(excluded.preferred_area_id, p.preferred_area_id),
    is_active = true
  returning * into result;

  return result;
end;
$$;

revoke all on function public.complete_public_registration(text, text, uuid, uuid)
  from public, anon;
grant execute on function public.complete_public_registration(text, text, uuid, uuid)
  to authenticated;

commit;
