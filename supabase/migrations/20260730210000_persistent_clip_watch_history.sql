begin;

create table public.clip_watch_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  clip_id uuid not null references public.clips(id) on delete cascade,
  watched_at timestamptz not null default clock_timestamp(),
  watch_duration_seconds numeric(7,3) not null,
  watch_percentage numeric(5,2),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, clip_id),
  constraint clip_watch_history_duration_valid check (watch_duration_seconds >= 3),
  constraint clip_watch_history_percentage_valid check (
    watch_percentage is null or watch_percentage between 0 and 100
  )
);

create index clip_watch_history_user_time_idx
  on public.clip_watch_history (user_id, watched_at desc);
create index clip_watch_history_clip_time_idx
  on public.clip_watch_history (clip_id, watched_at desc);

create trigger clip_watch_history_touch_updated_at
before update on public.clip_watch_history
for each row execute function private.touch_clip_updated_at();

alter table public.clip_watch_history enable row level security;
grant select, insert, update on public.clip_watch_history to authenticated;

create policy clip_watch_history_read_own
on public.clip_watch_history for select to authenticated
using (user_id = auth.uid() or private.is_admin());

create policy clip_watch_history_insert_own
on public.clip_watch_history for insert to authenticated
with check (user_id = auth.uid());

create policy clip_watch_history_update_own
on public.clip_watch_history for update to authenticated
using (user_id = auth.uid() or private.is_admin())
with check (user_id = auth.uid() or private.is_admin());

-- Preserve qualified authenticated watches recorded before this history table
-- existed, so cooldown behavior starts working immediately after deployment.
insert into public.clip_watch_history (
  user_id,
  clip_id,
  watched_at,
  watch_duration_seconds,
  watch_percentage
)
select
  view.viewer_id,
  view.clip_id,
  view.viewed_at,
  greatest(view.watch_duration_seconds, 3),
  least(
    100,
    greatest(0, view.watch_duration_seconds / nullif(clip.duration_seconds, 0) * 100)
  )
from public.clip_views view
join public.clips clip on clip.id = view.clip_id
where view.viewer_id is not null
  and view.watch_duration_seconds >= 3
on conflict (user_id, clip_id) do update set
  watched_at = greatest(
    public.clip_watch_history.watched_at,
    excluded.watched_at
  ),
  watch_duration_seconds = excluded.watch_duration_seconds,
  watch_percentage = excluded.watch_percentage;

create or replace function public.get_public_clip_feed(
  p_seed uuid,
  p_session_started_at timestamptz,
  p_offset integer default 0,
  p_limit integer default 20,
  p_category_id uuid default null,
  p_session_hash text default null,
  p_pinned_clip_id uuid default null
)
returns table (
  clip_id uuid,
  feed_position integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_viewer_id uuid := auth.uid();
  normalized_session_hash text := nullif(btrim(p_session_hash), '');
  requested_offset integer := greatest(coalesce(p_offset, 0), 0);
  requested_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  feed_session private.clip_feed_sessions%rowtype;
  remaining_clip_ids uuid[] := array[]::uuid[];
  remaining_vendor_ids uuid[] := array[]::uuid[];
  remaining_count integer := 0;
  chosen_index integer;
  chosen_clip_id uuid;
  chosen_vendor_id uuid;
  last_vendor_id uuid := null;
  vendor_streak integer := 0;
  next_position integer := 0;
  array_index integer;
begin
  if p_seed is null then
    raise exception 'A feed session seed is required';
  end if;
  if current_viewer_id is null and normalized_session_hash is null then
    raise exception 'A viewer session is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_seed::text, 0));

  delete from private.clip_feed_sessions
  where expires_at < clock_timestamp();

  insert into private.clip_feed_sessions (
    id,
    viewer_id,
    anonymous_session_hash,
    category_id,
    pinned_clip_id,
    snapshot_at
  )
  values (
    p_seed,
    current_viewer_id,
    case when current_viewer_id is null then normalized_session_hash else null end,
    p_category_id,
    p_pinned_clip_id,
    least(coalesce(p_session_started_at, clock_timestamp()), clock_timestamp())
  )
  on conflict (id) do nothing;

  select *
  into feed_session
  from private.clip_feed_sessions
  where id = p_seed;

  if feed_session.viewer_id is distinct from current_viewer_id
     or (
       current_viewer_id is null
       and feed_session.anonymous_session_hash is distinct from normalized_session_hash
     )
     or feed_session.category_id is distinct from p_category_id
     or feed_session.pinned_clip_id is distinct from p_pinned_clip_id then
    raise exception 'Feed session does not belong to this viewer or query';
  end if;

  if feed_session.initialized_at is null then
    with candidate_metrics as (
      select
        clip.id,
        clip.vendor_id,
        clip.published_at,
        row_number() over (
          order by clip.published_at desc, clip.id desc
        ) as newest_rank,
        1.0 / (
          1.0 + greatest(
            0,
            extract(epoch from (feed_session.snapshot_at - clip.published_at)) / 86400.0
          ) / 30.0
        ) as freshness_score,
        ln(
          1.0
          + greatest(clip.views_count, 0)
          + greatest(clip.likes_count, 0) * 4
          + greatest(clip.saves_count, 0) * 6
        ) as engagement_raw,
        (
          ('x' || substr(md5(p_seed::text || ':' || clip.id::text), 1, 8))::bit(32)::bigint
          / 4294967295.0
        ) as seeded_random_score,
        recent_watch.watched_at as recently_viewed_at
      from public.clips clip
      left join lateral (
        select case
          when current_viewer_id is not null then (
            select history.watched_at
            from public.clip_watch_history history
            where history.user_id = current_viewer_id
              and history.clip_id = clip.id
          )
          else (
            select max(view.viewed_at)
            from public.clip_views view
            where view.viewer_id is null
              and view.session_hash = normalized_session_hash
              and view.clip_id = clip.id
          )
        end as watched_at
      ) recent_watch on true
      where clip.status = 'approved'
        and clip.visibility = 'public'
        and clip.deleted_at is null
        and clip.published_at <= feed_session.snapshot_at
        and (p_category_id is null or clip.category_id = p_category_id)
    ),
    grouped_candidates as (
      select
        metrics.*,
        case
          when metrics.recently_viewed_at is null then 0
          when metrics.recently_viewed_at
            < feed_session.snapshot_at - interval '7 days' then 1
          when metrics.recently_viewed_at
            < feed_session.snapshot_at - interval '24 hours' then 2
          else 3
        end as watch_group
      from candidate_metrics metrics
    ),
    counted_candidates as (
      select
        grouped.*,
        count(*) filter (where grouped.watch_group < 3) over () as non_recent_count
      from grouped_candidates grouped
    ),
    eligible_candidates as (
      select *
      from counted_candidates
      where watch_group < 3
        or non_recent_count < 10
        or id = p_pinned_clip_id
    ),
    scored_candidates as (
      select
        candidate.*,
        (
          0.40 * candidate.freshness_score
          + 0.25 * case
              when max(candidate.engagement_raw) over () > 0
                then candidate.engagement_raw / max(candidate.engagement_raw) over ()
              else 0
            end
          + 0.25 * candidate.seeded_random_score
          + case when candidate.watch_group = 0 then 0.10 else 0 end
          - case
              when candidate.watch_group = 3 then 3.0
              when candidate.watch_group = 2 then 1.0
              else 0
            end
        ) as feed_score
      from eligible_candidates candidate
    ),
    ordered_candidates as (
      select
        scored_candidates.*,
        row_number() over (
          order by
            case
              when id = p_pinned_clip_id then -1
              else watch_group
            end,
            case
              when watch_group = 0 and newest_rank <= 4 then 0
              else 1
            end,
            case
              when watch_group = 0 and newest_rank <= 4 then newest_rank
              else null
            end,
            case
              when watch_group = 3 and non_recent_count < 10 then recently_viewed_at
              else null
            end asc nulls last,
            feed_score desc,
            published_at desc,
            id desc
        ) as candidate_order
      from scored_candidates
    )
    select
      coalesce(array_agg(id order by candidate_order), array[]::uuid[]),
      coalesce(array_agg(vendor_id order by candidate_order), array[]::uuid[])
    into remaining_clip_ids, remaining_vendor_ids
    from ordered_candidates;

    remaining_count := coalesce(cardinality(remaining_clip_ids), 0);

    while remaining_count > 0 loop
      chosen_index := null;

      for array_index in 1..remaining_count loop
        if vendor_streak < 2
           or remaining_vendor_ids[array_index] is distinct from last_vendor_id then
          chosen_index := array_index;
          exit;
        end if;
      end loop;

      exit when chosen_index is null;

      chosen_clip_id := remaining_clip_ids[chosen_index];
      chosen_vendor_id := remaining_vendor_ids[chosen_index];

      insert into private.clip_feed_session_items (
        session_id,
        feed_position,
        clip_id
      )
      values (p_seed, next_position, chosen_clip_id);

      if chosen_vendor_id is not distinct from last_vendor_id then
        vendor_streak := vendor_streak + 1;
      else
        last_vendor_id := chosen_vendor_id;
        vendor_streak := 1;
      end if;
      next_position := next_position + 1;

      remaining_clip_ids :=
        coalesce(remaining_clip_ids[1:(chosen_index - 1)], array[]::uuid[])
        || coalesce(
          remaining_clip_ids[(chosen_index + 1):remaining_count],
          array[]::uuid[]
        );
      remaining_vendor_ids :=
        coalesce(remaining_vendor_ids[1:(chosen_index - 1)], array[]::uuid[])
        || coalesce(
          remaining_vendor_ids[(chosen_index + 1):remaining_count],
          array[]::uuid[]
        );
      remaining_count := remaining_count - 1;
    end loop;

    update private.clip_feed_sessions
    set initialized_at = clock_timestamp()
    where id = p_seed;
  end if;

  return query
  select
    item.clip_id,
    item.feed_position,
    totals.total_count
  from private.clip_feed_session_items item
  cross join (
    select count(*)::bigint as total_count
    from private.clip_feed_session_items
    where session_id = p_seed
  ) totals
  where item.session_id = p_seed
    and item.feed_position >= requested_offset
    and item.feed_position < requested_offset + requested_limit
  order by item.feed_position;
end;
$$;

drop function if exists public.record_public_clip_view(
  uuid,
  numeric,
  boolean,
  text
);

create function public.record_public_clip_view(
  p_clip_id uuid,
  p_watch_duration_seconds numeric default 3,
  p_watch_percentage numeric default null,
  p_completed boolean default false,
  p_session_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_viewer_id uuid := auth.uid();
  normalized_session_hash text := nullif(btrim(p_session_hash), '');
  qualified_duration numeric := greatest(coalesce(p_watch_duration_seconds, 0), 0);
  normalized_percentage numeric := case
    when p_watch_percentage is null then null
    else least(100, greatest(0, p_watch_percentage))
  end;
  counted_new_view boolean := false;
begin
  if qualified_duration < 3 then
    return false;
  end if;
  if current_viewer_id is null and normalized_session_hash is null then
    raise exception 'A viewer session is required';
  end if;
  if not exists (
    select 1
    from public.clips clip
    where clip.id = p_clip_id
      and clip.status = 'approved'
      and clip.visibility in ('public', 'unlisted')
      and clip.deleted_at is null
  ) then
    raise exception 'Visible Clip not found';
  end if;

  if current_viewer_id is not null then
    insert into public.clip_watch_history (
      user_id,
      clip_id,
      watched_at,
      watch_duration_seconds,
      watch_percentage
    )
    values (
      current_viewer_id,
      p_clip_id,
      clock_timestamp(),
      qualified_duration,
      normalized_percentage
    )
    on conflict (user_id, clip_id) do update set
      watched_at = excluded.watched_at,
      watch_duration_seconds = excluded.watch_duration_seconds,
      watch_percentage = excluded.watch_percentage;

    insert into public.clip_views (
      clip_id,
      viewer_id,
      session_hash,
      watch_duration_seconds,
      completed,
      viewed_at
    )
    values (
      p_clip_id,
      current_viewer_id,
      null,
      qualified_duration,
      coalesce(p_completed, false),
      clock_timestamp()
    )
    on conflict (clip_id, viewer_id) where viewer_id is not null
    do update set
      watch_duration_seconds = greatest(
        public.clip_views.watch_duration_seconds,
        excluded.watch_duration_seconds
      ),
      completed = public.clip_views.completed or excluded.completed
    returning (xmax = 0) into counted_new_view;
  else
    insert into public.clip_views (
      clip_id,
      viewer_id,
      session_hash,
      watch_duration_seconds,
      completed,
      viewed_at
    )
    values (
      p_clip_id,
      null,
      normalized_session_hash,
      qualified_duration,
      coalesce(p_completed, false),
      clock_timestamp()
    )
    on conflict (clip_id, session_hash) where viewer_id is null
    do update set
      watch_duration_seconds = greatest(
        public.clip_views.watch_duration_seconds,
        excluded.watch_duration_seconds
      ),
      completed = public.clip_views.completed or excluded.completed,
      viewed_at = excluded.viewed_at
    returning (xmax = 0) into counted_new_view;
  end if;

  return counted_new_view;
end;
$$;

revoke all on function public.record_public_clip_view(
  uuid,
  numeric,
  numeric,
  boolean,
  text
) from public;
grant execute on function public.record_public_clip_view(
  uuid,
  numeric,
  numeric,
  boolean,
  text
) to anon, authenticated;

commit;
