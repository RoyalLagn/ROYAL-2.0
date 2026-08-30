begin;

create or replace function public.get_vendor_profile_analytics(target_vendor_id uuid)
returns table (
  event_type text,
  source text,
  event_count bigint,
  unique_visitors bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized_events as (
    select
      e.event_type,
      coalesce(e.source, 'unknown') source,
      e.guest_session_id
    from public.vendor_profile_events e
    where e.vendor_id = target_vendor_id
      and (
        (select private.owns_vendor(target_vendor_id))
        or (select private.is_admin())
      )
  ),
  source_counts as (
    select
      ae.event_type,
      ae.source,
      count(*) event_count
    from authorized_events ae
    group by ae.event_type, ae.source
  ),
  global_unique_counts as (
    select
      ae.event_type,
      count(distinct ae.guest_session_id) filter (where ae.guest_session_id is not null) unique_visitors
    from authorized_events ae
    group by ae.event_type
  ),
  ranked_source_counts as (
    select
      sc.event_type,
      sc.source,
      sc.event_count,
      row_number() over (partition by sc.event_type order by sc.source) source_rank
    from source_counts sc
  )
  select
    rsc.event_type,
    rsc.source,
    rsc.event_count,
    case
      when rsc.source_rank = 1 then guc.unique_visitors
      else 0::bigint
    end unique_visitors
  from ranked_source_counts rsc
  join global_unique_counts guc on guc.event_type = rsc.event_type
$$;

revoke all on function public.get_vendor_profile_analytics(uuid) from public;
grant execute on function public.get_vendor_profile_analytics(uuid) to authenticated;

commit;
