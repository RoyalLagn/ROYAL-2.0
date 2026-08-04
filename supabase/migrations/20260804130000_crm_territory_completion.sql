begin;

-- Extends admin_crm_list_territory with a registered_count alongside
-- vendor_count so Phase 2 territory cards can show a completion percentage
-- (registered_count / vendor_count). Postgres requires drop+recreate when a
-- function's return columns change.

drop function if exists public.admin_crm_list_territory(text, uuid);

create or replace function public.admin_crm_list_territory(
  target_level text,
  parent_filter uuid default null
)
returns table (
  id uuid,
  name text,
  slug text,
  display_order integer,
  is_active boolean,
  parent_id uuid,
  child_count bigint,
  vendor_count bigint,
  registered_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_level = 'state' then
    return query
      select s.id, s.name, s.slug, s.display_order, s.is_active, null::uuid,
        (select count(*) from public.crm_districts d where d.state_id = s.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          join public.crm_talukas t on t.id = cl.taluka_id
          where t.district_id in (select d.id from public.crm_districts d where d.state_id = s.id)),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          join public.crm_talukas t on t.id = cl.taluka_id
          where t.district_id in (select d.id from public.crm_districts d where d.state_id = s.id)
            and v.status in ('registered_on_royallagn', 'subscription_pending', 'premium_customer'))
      from public.crm_states s
      order by s.display_order, s.name;
  elsif target_level = 'district' then
    return query
      select d.id, d.name, d.slug, d.display_order, d.is_active, d.state_id,
        (select count(*) from public.crm_talukas t where t.district_id = d.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          join public.crm_talukas t on t.id = cl.taluka_id
          where t.district_id = d.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          join public.crm_talukas t on t.id = cl.taluka_id
          where t.district_id = d.id
            and v.status in ('registered_on_royallagn', 'subscription_pending', 'premium_customer'))
      from public.crm_districts d
      where parent_filter is null or d.state_id = parent_filter
      order by d.display_order, d.name;
  elsif target_level = 'taluka' then
    return query
      select t.id, t.name, t.slug, t.display_order, t.is_active, t.district_id,
        (select count(*) from public.crm_clusters cl where cl.taluka_id = t.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          where cl.taluka_id = t.id),
        (select count(*) from public.crm_vendors v
          join public.crm_clusters cl on cl.id = v.cluster_id
          where cl.taluka_id = t.id
            and v.status in ('registered_on_royallagn', 'subscription_pending', 'premium_customer'))
      from public.crm_talukas t
      where parent_filter is null or t.district_id = parent_filter
      order by t.display_order, t.name;
  elsif target_level = 'cluster' then
    return query
      select cl.id, cl.name, cl.slug, cl.display_order, cl.is_active, cl.taluka_id,
        (select count(*) from public.crm_vendors v where v.cluster_id = cl.id),
        (select count(*) from public.crm_vendors v where v.cluster_id = cl.id),
        (select count(*) from public.crm_vendors v where v.cluster_id = cl.id
          and v.status in ('registered_on_royallagn', 'subscription_pending', 'premium_customer'))
      from public.crm_clusters cl
      where parent_filter is null or cl.taluka_id = parent_filter
      order by cl.display_order, cl.name;
  else
    raise exception 'Unknown territory level: %', target_level;
  end if;
end;
$$;

revoke all on function public.admin_crm_list_territory(text, uuid) from public, anon;
grant execute on function public.admin_crm_list_territory(text, uuid) to authenticated;

commit;
