begin;

-- Time-first access supports the admin-wide reporting window. The existing
-- (clip_id, viewed_at) index remains optimal for single-clip drill-downs.
create index if not exists clip_views_time_clip_idx
  on public.clip_views (viewed_at desc, clip_id);

create or replace function public.admin_clip_analytics(
  p_start_date date,
  p_end_date date,
  p_aggregation text,
  p_vendor_id uuid,
  p_clip_id uuid,
  p_category_id uuid,
  p_city_id uuid,
  p_area_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_step interval;
  period_days integer;
  previous_start date;
  previous_end date;
  current_views bigint := 0;
  previous_views bigint := 0;
  current_watch numeric := 0;
  previous_watch numeric := 0;
  trend_json jsonb := '[]'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Invalid analytics date range';
  end if;
  if p_aggregation not in ('day', 'month') then
    raise exception 'Analytics aggregation must be day or month';
  end if;

  bucket_step := case when p_aggregation = 'month' then interval '1 month' else interval '1 day' end;
  period_days := p_end_date - p_start_date + 1;
  previous_end := p_start_date - 1;
  previous_start := previous_end - period_days + 1;

  select count(*), coalesce(sum(view.watch_duration_seconds), 0) / 3600
    into current_views, current_watch
  from public.clip_views view
  join public.clips clip on clip.id = view.clip_id
  join public.vendors vendor on vendor.id = clip.vendor_id
  where view.viewed_at >= p_start_date::timestamptz
    and view.viewed_at < (p_end_date + 1)::timestamptz
    and (p_vendor_id is null or clip.vendor_id = p_vendor_id)
    and (p_clip_id is null or clip.id = p_clip_id)
    and (p_category_id is null or clip.category_id = p_category_id)
    and (p_city_id is null or vendor.primary_city_id = p_city_id)
    and (p_area_id is null or vendor.primary_area_id = p_area_id);

  select count(*), coalesce(sum(view.watch_duration_seconds), 0) / 3600
    into previous_views, previous_watch
  from public.clip_views view
  join public.clips clip on clip.id = view.clip_id
  join public.vendors vendor on vendor.id = clip.vendor_id
  where view.viewed_at >= previous_start::timestamptz
    and view.viewed_at < (previous_end + 1)::timestamptz
    and (p_vendor_id is null or clip.vendor_id = p_vendor_id)
    and (p_clip_id is null or clip.id = p_clip_id)
    and (p_category_id is null or clip.category_id = p_category_id)
    and (p_city_id is null or vendor.primary_city_id = p_city_id)
    and (p_area_id is null or vendor.primary_area_id = p_area_id);

  with buckets as (
    select generate_series(
      case when p_aggregation = 'month' then date_trunc('month', p_start_date::timestamp) else p_start_date::timestamp end,
      case when p_aggregation = 'month' then date_trunc('month', p_end_date::timestamp) else p_end_date::timestamp end,
      bucket_step
    ) as bucket
  ), filtered as (
    select view.*, clip.title
    from public.clip_views view
    join public.clips clip on clip.id = view.clip_id
    join public.vendors vendor on vendor.id = clip.vendor_id
    where view.viewed_at >= p_start_date::timestamptz
      and view.viewed_at < (p_end_date + 1)::timestamptz
      and (p_vendor_id is null or clip.vendor_id = p_vendor_id)
      and (p_clip_id is null or clip.id = p_clip_id)
      and (p_category_id is null or clip.category_id = p_category_id)
      and (p_city_id is null or vendor.primary_city_id = p_city_id)
      and (p_area_id is null or vendor.primary_area_id = p_area_id)
  ), aggregated as (
    select
      date_trunc(p_aggregation, viewed_at)::date as bucket,
      count(*)::bigint as views,
      coalesce(sum(watch_duration_seconds), 0) / 3600 as watch_hours,
      count(distinct clip_id)::bigint as clips_viewed,
      count(distinct coalesce(viewer_id::text, session_hash))::bigint as unique_viewers
    from filtered group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(b.bucket, 'YYYY-MM-DD'),
    'views', coalesce(a.views, 0),
    'watchTimeHours', round(coalesce(a.watch_hours, 0), 2),
    'clipsViewed', coalesce(a.clips_viewed, 0),
    'uniqueViewers', coalesce(a.unique_viewers, 0),
    'topClip', (
      select f.title from filtered f
      where date_trunc(p_aggregation, f.viewed_at)::date = b.bucket::date
      group by f.clip_id, f.title order by count(*) desc, f.title limit 1
    )
  ) order by b.bucket), '[]'::jsonb)
  into trend_json
  from buckets b left join aggregated a on a.bucket = b.bucket::date;

  return jsonb_build_object(
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date, 'aggregation', p_aggregation),
    'summary', jsonb_build_object(
      'views', current_views,
      'previousViews', previous_views,
      'viewsChangePercent', case when previous_views = 0 then case when current_views > 0 then 100 else 0 end else round((current_views - previous_views)::numeric / previous_views * 100, 2) end,
      'watchTimeHours', round(current_watch, 2),
      'previousWatchTimeHours', round(previous_watch, 2),
      'watchTimeChangePercent', case when previous_watch = 0 then case when current_watch > 0 then 100 else 0 end else round((current_watch - previous_watch) / previous_watch * 100, 2) end
    ),
    'trend', trend_json,
    'comparison', jsonb_build_object(
      'currentViews', current_views, 'previousViews', previous_views,
      'difference', current_views - previous_views,
      'changePercent', case when previous_views = 0 then case when current_views > 0 then 100 else 0 end else round((current_views - previous_views)::numeric / previous_views * 100, 2) end
    )
  );
end;
$$;

create or replace function public.admin_clip_analytics_daily_details(
  p_date date,
  p_vendor_id uuid,
  p_clip_id uuid,
  p_category_id uuid,
  p_city_id uuid,
  p_area_id uuid
)
returns table (
  clip_id uuid,
  clip_title text,
  vendor_name text,
  views bigint,
  watch_time_hours numeric,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
    select clip.id, clip.title, vendor.business_name, count(*)::bigint,
      round(coalesce(sum(view.watch_duration_seconds), 0) / 3600, 2), clip.published_at
    from public.clip_views view
    join public.clips clip on clip.id = view.clip_id
    join public.vendors vendor on vendor.id = clip.vendor_id
    where view.viewed_at >= p_date::timestamptz
      and view.viewed_at < (p_date + 1)::timestamptz
      and (p_vendor_id is null or clip.vendor_id = p_vendor_id)
      and (p_clip_id is null or clip.id = p_clip_id)
      and (p_category_id is null or clip.category_id = p_category_id)
      and (p_city_id is null or vendor.primary_city_id = p_city_id)
      and (p_area_id is null or vendor.primary_area_id = p_area_id)
    group by clip.id, clip.title, vendor.business_name, clip.published_at
    order by count(*) desc, clip.title
    limit 100;
end;
$$;

revoke all on function public.admin_clip_analytics(date,date,text,uuid,uuid,uuid,uuid,uuid) from public;
revoke all on function public.admin_clip_analytics_daily_details(date,uuid,uuid,uuid,uuid,uuid) from public;
grant execute on function public.admin_clip_analytics(date,date,text,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_clip_analytics_daily_details(date,uuid,uuid,uuid,uuid,uuid) to authenticated;

commit;
