begin;

create table if not exists public.admin_equity_splits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  equity_percentage numeric(7, 4) not null,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_equity_splits_name_valid check (char_length(btrim(name)) between 1 and 120),
  constraint admin_equity_splits_percentage_valid check (equity_percentage > 0 and equity_percentage <= 100)
);

create unique index if not exists admin_equity_splits_name_unique_idx
  on public.admin_equity_splits(lower(btrim(name)));
create index if not exists admin_equity_splits_display_order_idx
  on public.admin_equity_splits(display_order, created_at);

drop trigger if exists admin_equity_splits_set_updated_at on public.admin_equity_splits;
create trigger admin_equity_splits_set_updated_at
before update on public.admin_equity_splits
for each row execute function private.set_updated_at();

alter table public.admin_equity_splits enable row level security;

drop policy if exists admin_equity_splits_admin_read on public.admin_equity_splits;
create policy admin_equity_splits_admin_read
on public.admin_equity_splits for select to authenticated
using (private.is_admin());

grant select on public.admin_equity_splits to authenticated;
revoke insert, update, delete on public.admin_equity_splits from anon, authenticated;

create or replace function public.admin_save_equity_split(members jsonb)
returns setof public.admin_equity_splits
language plpgsql
security definer
set search_path = ''
as $$
declare
  member jsonb;
  member_name text;
  member_percentage numeric(7, 4);
  member_order integer := 0;
  percentage_total numeric(9, 4) := 0;
  normalized_names text[] := '{}';
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(members) <> 'array' or jsonb_array_length(members) = 0 then
    raise exception 'At least one equity member is required';
  end if;

  for member in select value from jsonb_array_elements(members)
  loop
    member_name := btrim(coalesce(member->>'name', ''));
    begin
      member_percentage := (member->>'equity_percentage')::numeric(7, 4);
    exception when others then
      raise exception 'Every equity percentage must be a valid number';
    end;
    if char_length(member_name) not between 1 and 120 then
      raise exception 'Every member requires a name between 1 and 120 characters';
    end if;
    if member_percentage <= 0 or member_percentage > 100 then
      raise exception 'Every equity percentage must be greater than 0 and no more than 100';
    end if;
    if lower(member_name) = any(normalized_names) then
      raise exception 'Equity member names must be unique';
    end if;
    normalized_names := array_append(normalized_names, lower(member_name));
    percentage_total := percentage_total + member_percentage;
  end loop;

  if percentage_total <> 100.0000 then
    raise exception 'Total equity must equal exactly 100%%';
  end if;

  delete from public.admin_equity_splits;
  for member in select value from jsonb_array_elements(members)
  loop
    member_order := member_order + 1;
    insert into public.admin_equity_splits (
      name, equity_percentage, display_order, created_by
    ) values (
      btrim(member->>'name'),
      (member->>'equity_percentage')::numeric(7, 4),
      member_order,
      auth.uid()
    );
  end loop;

  return query
    select split.* from public.admin_equity_splits split
    order by split.display_order, split.created_at;
end;
$$;

revoke all on function public.admin_save_equity_split(jsonb) from public, anon;
grant execute on function public.admin_save_equity_split(jsonb) to authenticated;

commit;
