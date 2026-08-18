begin;

-- Admin Subscriptions > Subscribers: category visibility/filtering only.
-- Reuses the existing marketplace public.categories table (the same one
-- Vendors/Enquiries/etc. already use via vendors.category_id) — no new
-- category table, no per-category queries.

-- ----------------------------------------------------------------------------
-- Extend the existing admin_list_vendor_subscriptions RPC: adds category_id/
-- category_name to its single already-joined dataset (one more left join,
-- same query, same single round trip) and a category_filter parameter that
-- combines with the existing search_text/status_filter/plan_filter exactly
-- like they already combine with each other. Return type changes, so the
-- old signature must be dropped before recreating.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_vendor_subscriptions(text, text, uuid, integer, integer);

create or replace function public.admin_list_vendor_subscriptions(
  search_text text default null,
  status_filter text default null,
  plan_filter uuid default null,
  page_size integer default 50,
  page_offset integer default 0,
  category_filter uuid default null
) returns table (
  vendor_id uuid,
  business_name text,
  owner_name text,
  email text,
  phone text,
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  status text,
  access_source text,
  start_date timestamptz,
  expiry_date timestamptz,
  days_remaining integer,
  last_payment_status text,
  last_payment_amount numeric,
  category_id uuid,
  category_name text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select
      vendor.id vendor_id,
      vendor.business_name,
      vendor.owner_name,
      coalesce(vendor.contact_email, profile.email) email,
      coalesce(vendor.contact_phone, profile.phone) phone,
      subscription.id subscription_id,
      subscription.plan_id,
      plan.name plan_name,
      coalesce(subscription.status, 'expired') status,
      subscription.access_source,
      subscription.start_date,
      subscription.expiry_date,
      case when subscription.expiry_date is null then null else
        greatest(0, ceil(extract(epoch from (subscription.expiry_date - now())) / 86400.0)::integer)
      end days_remaining,
      payment.payment_status last_payment_status,
      payment.amount last_payment_amount,
      vendor.category_id,
      category.name category_name
    from public.vendors vendor
    left join public.profiles profile on profile.id = vendor.profile_id
    left join public.categories category on category.id = vendor.category_id
    left join lateral (
      select candidate.* from public.vendor_subscriptions candidate
      where candidate.vendor_id = vendor.id
      order by
        case when candidate.status in ('pending','trial','launch_offer','active','past_due','grace_period','suspended') then 0 else 1 end,
        candidate.updated_at desc
      limit 1
    ) subscription on true
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    left join lateral (
      select candidate.payment_status, candidate.amount
      from public.subscription_payments candidate
      where candidate.vendor_id = vendor.id
      order by candidate.created_at desc limit 1
    ) payment on true
    where private.is_admin()
  ), filtered as (
    select * from rows row
    where (
      nullif(btrim(search_text), '') is null
      or row.business_name ilike '%' || btrim(search_text) || '%'
      or row.owner_name ilike '%' || btrim(search_text) || '%'
      or row.email ilike '%' || btrim(search_text) || '%'
      or row.phone ilike '%' || btrim(search_text) || '%'
      or row.vendor_id::text = btrim(search_text)
    )
    and (status_filter is null or status_filter = 'all' or row.status = status_filter)
    and (plan_filter is null or row.plan_id = plan_filter)
    and (category_filter is null or row.category_id = category_filter)
  )
  select filtered.*, count(*) over ()
  from filtered
  order by expiry_date asc nulls last, business_name asc
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_offset, 0);
$$;

revoke all on function public.admin_list_vendor_subscriptions(text, text, uuid, integer, integer, uuid) from public, anon;
grant execute on function public.admin_list_vendor_subscriptions(text, text, uuid, integer, integer, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- One aggregate query (never one query per category) for the category filter
-- chips' counts — every real category (even ones with zero vendors, via the
-- left join) plus an "Uncategorized" row only when such vendors actually
-- exist. Counts every vendor exactly like admin_list_vendor_subscriptions
-- does (one row per vendor regardless of subscription state), so the two
-- RPCs can never disagree about what a "subscriber" is.
-- ----------------------------------------------------------------------------
create or replace function public.admin_subscriber_category_counts()
returns table (
  category_id uuid,
  category_name text,
  subscriber_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select c.id as category_id, c.name as category_name, count(v.id) as subscriber_count
    from public.categories c
    left join public.vendors v on v.category_id = c.id
    where private.is_admin()
    group by c.id, c.name

    union all

    select null::uuid, 'Uncategorized', count(*)
    from public.vendors v
    where private.is_admin() and v.category_id is null
    having count(*) > 0
  ) combined
  order by category_name;
$$;

revoke all on function public.admin_subscriber_category_counts() from public, anon;
grant execute on function public.admin_subscriber_category_counts() to authenticated;

commit;
