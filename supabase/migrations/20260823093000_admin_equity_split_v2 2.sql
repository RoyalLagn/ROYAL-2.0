-- Save one complete ownership split atomically. Existing rows retain their
-- IDs; new rows are inserted, edited rows are updated, and only rows explicitly
-- absent from the submitted editor state are removed.
create or replace function public.admin_save_equity_split_v2(p_members jsonb)
returns setof public.admin_equity_splits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_name text;
  v_percentage numeric(7, 4);
  v_total numeric(9, 4) := 0;
  v_order integer := 0;
  v_names text[] := '{}';
  v_ids uuid[] := '{}'::uuid[];
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'Add at least one equity member before saving';
  end if;

  for v_member in
    select * from jsonb_to_recordset(p_members) as item(id uuid, name text, equity_percentage numeric)
  loop
    v_name := btrim(coalesce(v_member.name, ''));
    v_percentage := v_member.equity_percentage;

    if char_length(v_name) not between 1 and 120 then
      raise exception 'Every member needs a name between 1 and 120 characters';
    end if;
    if v_percentage is null or v_percentage <= 0 or v_percentage > 100 then
      raise exception 'Every equity percentage must be greater than 0 and no more than 100';
    end if;
    if lower(v_name) = any(v_names) then
      raise exception 'Equity member names must be unique';
    end if;
    if v_member.id is not null and not exists (
      select 1 from public.admin_equity_splits as split where split.id = v_member.id
    ) then
      raise exception 'An equity member was changed elsewhere. Refresh and try again.';
    end if;
    if v_member.id is not null and v_member.id = any(v_ids) then
      raise exception 'Each equity member can appear only once';
    end if;

    v_names := array_append(v_names, lower(v_name));
    if v_member.id is not null then v_ids := array_append(v_ids, v_member.id); end if;
    v_total := v_total + v_percentage;
  end loop;

  if v_total <> 100.0000 then
    raise exception 'Total equity must equal exactly 100%%';
  end if;

  -- This is a targeted delete of only rows the administrator removed in the
  -- editor. It does not delete/recreate the full split.
  delete from public.admin_equity_splits as split
  where split.id <> all(v_ids);

  for v_member in
    select * from jsonb_to_recordset(p_members) as item(id uuid, name text, equity_percentage numeric)
  loop
    v_order := v_order + 1;
    if v_member.id is null then
      insert into public.admin_equity_splits (name, equity_percentage, display_order, created_by)
      values (btrim(v_member.name), v_member.equity_percentage, v_order, auth.uid());
    else
      update public.admin_equity_splits as split
      set name = btrim(v_member.name), equity_percentage = v_member.equity_percentage, display_order = v_order
      where split.id = v_member.id;
    end if;
  end loop;

  return query
    select split.*
    from public.admin_equity_splits as split
    order by split.display_order, split.created_at;
end;
$$;

revoke all on function public.admin_save_equity_split_v2(jsonb) from public, anon;
grant execute on function public.admin_save_equity_split_v2(jsonb) to authenticated;
