begin;

-- Packages are a core vendor-profile setup feature. They must remain available
-- even when a paid subscription is not active; other premium feature gates are
-- intentionally unchanged.
drop policy if exists "vendor_services_owner_or_admin_insert" on public.vendor_services;
drop policy if exists "vendor_services_owner_or_admin_update" on public.vendor_services;
drop policy if exists "vendor_services_owner_or_admin_delete" on public.vendor_services;

create policy "vendor_services_owner_or_admin_insert"
on public.vendor_services for insert to authenticated
with check (private.is_admin() or private.owns_vendor(vendor_id));

create policy "vendor_services_owner_or_admin_update"
on public.vendor_services for update to authenticated
using (private.is_admin() or private.owns_vendor(vendor_id))
with check (private.is_admin() or private.owns_vendor(vendor_id));

create policy "vendor_services_owner_or_admin_delete"
on public.vendor_services for delete to authenticated
using (private.is_admin() or private.owns_vendor(vendor_id));

drop policy if exists "vendor_service_items_owner_insert" on public.vendor_service_items;
drop policy if exists "vendor_service_items_owner_update" on public.vendor_service_items;
drop policy if exists "vendor_service_items_owner_delete" on public.vendor_service_items;

create policy "vendor_service_items_owner_insert"
on public.vendor_service_items for insert to authenticated
with check (
  exists (
    select 1 from public.vendor_services package
    where package.id = service_id
      and (private.is_admin() or private.owns_vendor(package.vendor_id))
  )
);

create policy "vendor_service_items_owner_update"
on public.vendor_service_items for update to authenticated
using (
  exists (
    select 1 from public.vendor_services package
    where package.id = service_id
      and (private.is_admin() or private.owns_vendor(package.vendor_id))
  )
)
with check (
  exists (
    select 1 from public.vendor_services package
    where package.id = service_id
      and (private.is_admin() or private.owns_vendor(package.vendor_id))
  )
);

create policy "vendor_service_items_owner_delete"
on public.vendor_service_items for delete to authenticated
using (
  exists (
    select 1 from public.vendor_services package
    where package.id = service_id
      and (private.is_admin() or private.owns_vendor(package.vendor_id))
  )
);

create or replace function public.save_vendor_package(
  target_package_id uuid,
  package_data jsonb,
  package_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid := (package_data->>'vendor_id')::uuid;
  saved_id uuid;
  item jsonb;
  item_order integer := 0;
  normalized_status text := coalesce(nullif(package_data->>'status', ''), 'draft');
  normalized_price_type text := coalesce(nullif(package_data->>'price_type', ''), 'starting');
  normalized_price numeric(12, 2);
  normalized_discount numeric(12, 2);
  normalized_events integer;
begin
  if target_vendor_id is null then raise exception 'Vendor is required'; end if;
  if not (private.is_admin() or private.owns_vendor(target_vendor_id)) then
    raise exception 'Package management access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(package_data->>'title', ''))) not between 2 and 120 then
    raise exception 'Package name must contain 2 to 120 characters';
  end if;
  if normalized_status not in ('draft', 'active', 'inactive') then raise exception 'Invalid package status'; end if;
  if normalized_price_type not in ('starting', 'fixed', 'contact') then raise exception 'Invalid package price type'; end if;

  if normalized_price_type <> 'contact' then
    begin normalized_price := nullif(package_data->>'price', '')::numeric(12, 2);
    exception when others then raise exception 'Enter a valid package price'; end;
    if normalized_price is null or normalized_price < 0 then raise exception 'A non-negative package price is required'; end if;
  end if;
  begin normalized_discount := nullif(package_data->>'discounted_price', '')::numeric(12, 2);
  exception when others then raise exception 'Enter a valid offer price'; end;
  if normalized_discount is not null and (
    normalized_discount < 0 or normalized_price is null or normalized_discount >= normalized_price
  ) then raise exception 'Offer price must be lower than the regular price'; end if;
  begin normalized_events := nullif(package_data->>'events_covered', '')::integer;
  exception when others then raise exception 'Events covered must be a whole number'; end;
  if normalized_events is not null and normalized_events < 1 then raise exception 'Events covered must be at least one'; end if;
  if jsonb_typeof(package_items) <> 'array' or jsonb_array_length(package_items) > 80 then
    raise exception 'Package items must be an array with no more than 80 entries';
  end if;

  if target_package_id is null then
    insert into public.vendor_services (
      vendor_id, title, description, price, discounted_price, price_type,
      service_category, duration_label, events_covered, delivery_details,
      terms, status, is_active, display_order
    ) values (
      target_vendor_id, btrim(package_data->>'title'), nullif(btrim(package_data->>'description'), ''),
      normalized_price, normalized_discount, normalized_price_type,
      nullif(btrim(package_data->>'service_category'), ''), nullif(btrim(package_data->>'duration_label'), ''),
      normalized_events, nullif(btrim(package_data->>'delivery_details'), ''),
      nullif(btrim(package_data->>'terms'), ''), normalized_status, normalized_status = 'active',
      coalesce((select max(display_order) + 1 from public.vendor_services where vendor_id = target_vendor_id), 0)
    ) returning id into saved_id;
  else
    select id into saved_id from public.vendor_services
    where id = target_package_id and vendor_id = target_vendor_id for update;
    if saved_id is null then raise exception 'Package not found'; end if;
    update public.vendor_services set
      title = btrim(package_data->>'title'),
      description = nullif(btrim(package_data->>'description'), ''),
      price = normalized_price,
      discounted_price = normalized_discount,
      price_type = normalized_price_type,
      service_category = nullif(btrim(package_data->>'service_category'), ''),
      duration_label = nullif(btrim(package_data->>'duration_label'), ''),
      events_covered = normalized_events,
      delivery_details = nullif(btrim(package_data->>'delivery_details'), ''),
      terms = nullif(btrim(package_data->>'terms'), ''),
      status = normalized_status,
      is_active = normalized_status = 'active'
    where id = saved_id;
    delete from public.vendor_service_items where service_id = saved_id;
  end if;

  for item in select value from jsonb_array_elements(package_items)
  loop
    if coalesce(item->>'item_type', '') not in ('included', 'excluded', 'add_on') then raise exception 'Invalid package item type'; end if;
    if char_length(btrim(coalesce(item->>'title', ''))) not between 1 and 160 then raise exception 'Every package item requires a title'; end if;
    item_order := item_order + 1;
    insert into public.vendor_service_items (service_id, item_type, title, description, price, display_order)
    values (
      saved_id, item->>'item_type', btrim(item->>'title'), nullif(btrim(item->>'description'), ''),
      case when item->>'item_type' = 'add_on' then nullif(item->>'price', '')::numeric(12, 2) else null end,
      item_order
    );
  end loop;
  return saved_id;
end;
$$;

create or replace function public.reorder_vendor_packages(
  target_vendor_id uuid,
  ordered_package_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare invalid_count integer;
begin
  if not (private.is_admin() or private.owns_vendor(target_vendor_id)) then
    raise exception 'Package management access denied' using errcode = '42501';
  end if;
  select count(*) into invalid_count
  from unnest(ordered_package_ids) package_id
  where not exists (
    select 1 from public.vendor_services package
    where package.id = package_id and package.vendor_id = target_vendor_id
  );
  if invalid_count > 0 then raise exception 'One or more packages do not belong to this vendor'; end if;
  update public.vendor_services package
  set display_order = ordering.position - 1
  from unnest(ordered_package_ids) with ordinality ordering(id, position)
  where package.id = ordering.id and package.vendor_id = target_vendor_id;
end;
$$;

commit;
