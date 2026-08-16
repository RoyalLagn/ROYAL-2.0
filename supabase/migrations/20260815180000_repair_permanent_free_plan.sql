begin;

-- Vendor approval automatically assigns the permanent Free baseline. Repair
-- environments where an admin edit made that plan non-permanent and caused
-- the entire approval transaction to roll back.
update public.subscription_plans
set is_permanent = true,
    status = 'active',
    is_active = true,
    archived_at = null,
    updated_at = now()
where lower(slug) = 'free';

do $$
begin
  if not exists (
    select 1
    from public.subscription_plans
    where lower(slug) = 'free'
      and is_permanent
      and status = 'active'
      and archived_at is null
  ) then
    raise exception 'Cannot repair subscriptions: an active permanent Free plan is required';
  end if;
end;
$$;

update public.application_settings
set value = to_jsonb((
      select plan.id::text
      from public.subscription_plans plan
      where lower(plan.slug) = 'free'
        and plan.is_permanent
        and plan.status = 'active'
        and plan.archived_at is null
      limit 1
    )),
    updated_at = now()
where key = 'subscription_default_plan_id';

-- Free is infrastructure, not an optional commercial plan. Prevent it from
-- being renamed, archived, deleted, or made temporary by any future client.
create or replace function private.enforce_free_subscription_plan_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if lower(old.slug) = 'free' then
      raise exception 'The Free subscription plan cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and lower(old.slug) = 'free'
    and lower(new.slug) <> 'free'
  then
    raise exception 'The Free subscription plan slug cannot be changed';
  end if;

  if tg_op <> 'DELETE'
    and lower(new.slug) = 'free'
    and (
      not new.is_permanent
      or new.status <> 'active'
      or not new.is_active
      or new.archived_at is not null
    )
  then
    raise exception 'The Free subscription plan must remain active and permanent';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_free_subscription_plan_invariant()
from public, anon, authenticated;

drop trigger if exists subscription_plans_enforce_free_invariant
on public.subscription_plans;
create trigger subscription_plans_enforce_free_invariant
before insert or update or delete on public.subscription_plans
for each row execute function private.enforce_free_subscription_plan_invariant();

commit;
