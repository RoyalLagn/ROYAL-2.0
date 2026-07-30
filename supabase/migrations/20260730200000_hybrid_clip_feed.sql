begin;

-- A feed session materializes only clip IDs and positions. This makes offset
-- pagination stable even while engagement counts and view history change.
create table private.clip_feed_sessions (
  id uuid primary key,
  viewer_id uuid references public.profiles(id) on delete cascade,
  anonymous_session_hash text,
  category_id uuid references public.categories(id) on delete cascade,
  pinned_clip_id uuid references public.clips(id) on delete set null,
  snapshot_at timestamptz not null,
  initialized_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  constraint clip_feed_session_identity_required check (
    viewer_id is not null or nullif(btrim(anonymous_session_hash), '') is not null
  )
);

create table private.clip_feed_session_items (
  session_id uuid not null references private.clip_feed_sessions(id) on delete cascade,
  feed_position integer not null check (feed_position >= 0),
  clip_id uuid not null references public.clips(id) on delete cascade,
  primary key (session_id, feed_position),
  unique (session_id, clip_id)
);

create index clip_feed_sessions_expiry_idx
  on private.clip_feed_sessions (expires_at);
create index clip_views_session_time_idx
  on public.clip_views (session_hash, viewed_at desc)
  where viewer_id is null;

revoke all on table private.clip_feed_sessions from public, anon, authenticated;
revoke all on table private.clip_feed_session_items from public, anon, authenticated;

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

  -- Avoid duplicate initialization when the list asks for its first page twice.
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
        c.id,
        c.vendor_id,
        c.published_at,
        row_number() over (order by c.published_at desc, c.id desc) as newest_rank,
        1.0 / (
          1.0 + greatest(
            0,
            extract(epoch from (feed_session.snapshot_at - c.published_at)) / 86400.0
          ) / 30.0
        ) as freshness_score,
        ln(
          1.0
          + greatest(c.views_count, 0)
          + greatest(c.likes_count, 0) * 4
          + greatest(c.saves_count, 0) * 6
        ) as engagement_raw,
        (
          ('x' || substr(md5(p_seed::text || ':' || c.id::text), 1, 8))::bit(32)::bigint
          / 4294967295.0
        ) as seeded_random_score,
        recent_view.viewed_at as recently_viewed_at
      from public.clips c
      left join lateral (
        select max(cv.viewed_at) as viewed_at
        from public.clip_views cv
        where cv.clip_id = c.id
          and (
            (current_viewer_id is not null and cv.viewer_id = current_viewer_id)
            or (
              current_viewer_id is null
              and cv.viewer_id is null
              and cv.session_hash = normalized_session_hash
            )
          )
      ) recent_view on true
      where c.status = 'approved'
        and c.visibility = 'public'
        and c.deleted_at is null
        and c.published_at <= feed_session.snapshot_at
        and (p_category_id is null or c.category_id = p_category_id)
    ),
    scored_candidates as (
      select
        metrics.*,
        (
          0.40 * metrics.freshness_score
          + 0.25 * case
              when max(metrics.engagement_raw) over () > 0
                then metrics.engagement_raw / max(metrics.engagement_raw) over ()
              else 0
            end
          + 0.25 * metrics.seeded_random_score
          + 0.10 * case
              when metrics.recently_viewed_at is null then 1
              else least(
                1.0,
                greatest(
                  0,
                  extract(epoch from (feed_session.snapshot_at - metrics.recently_viewed_at))
                    / 2592000.0
                )
              )
            end
        ) as feed_score
      from candidate_metrics metrics
    ),
    ordered_candidates as (
      select
        scored_candidates.*,
        row_number() over (
          order by
            case
              when id = p_pinned_clip_id then 0
              when newest_rank <= 4 then 1
              else 2
            end,
            case
              when id = p_pinned_clip_id then 0
              when newest_rank <= 4 then newest_rank
              else null
            end,
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

    -- Greedily take the highest ranked eligible clip. A vendor is deferred
    -- after two consecutive clips and becomes eligible after another vendor.
    while remaining_count > 0 loop
      chosen_index := null;

      for array_index in 1..remaining_count loop
        if vendor_streak < 2
           or remaining_vendor_ids[array_index] is distinct from last_vendor_id then
          chosen_index := array_index;
          exit;
        end if;
      end loop;

      -- When no other vendor remains, stop instead of creating a third
      -- consecutive item. A new seed can surface different clips next time.
      exit when chosen_index is null;

      chosen_clip_id := remaining_clip_ids[chosen_index];
      chosen_vendor_id := remaining_vendor_ids[chosen_index];

      insert into private.clip_feed_session_items (session_id, feed_position, clip_id)
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
        || coalesce(remaining_clip_ids[(chosen_index + 1):remaining_count], array[]::uuid[]);
      remaining_vendor_ids :=
        coalesce(remaining_vendor_ids[1:(chosen_index - 1)], array[]::uuid[])
        || coalesce(remaining_vendor_ids[(chosen_index + 1):remaining_count], array[]::uuid[]);
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

-- Qualified repeat watches refresh recency without inflating the unique view
-- counter. The existing trigger increments clips.views_count only on INSERT.
create or replace function public.record_public_clip_view(
  p_clip_id uuid,
  p_watch_duration_seconds numeric default 3,
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
    from public.clips c
    where c.id = p_clip_id
      and c.status = 'approved'
      and c.visibility in ('public', 'unlisted')
      and c.deleted_at is null
  ) then
    raise exception 'Visible Clip not found';
  end if;

  if current_viewer_id is not null then
    insert into public.clip_views (
      clip_id, viewer_id, session_hash, watch_duration_seconds, completed, viewed_at
    )
    values (
      p_clip_id, current_viewer_id, null, qualified_duration, coalesce(p_completed, false),
      clock_timestamp()
    )
    on conflict (clip_id, viewer_id) where viewer_id is not null
    do update set
      watch_duration_seconds = greatest(
        public.clip_views.watch_duration_seconds,
        excluded.watch_duration_seconds
      ),
      completed = public.clip_views.completed or excluded.completed,
      viewed_at = excluded.viewed_at
    returning (xmax = 0) into counted_new_view;
  else
    insert into public.clip_views (
      clip_id, viewer_id, session_hash, watch_duration_seconds, completed, viewed_at
    )
    values (
      p_clip_id, null, normalized_session_hash, qualified_duration, coalesce(p_completed, false),
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

revoke all on function public.get_public_clip_feed(
  uuid, timestamptz, integer, integer, uuid, text, uuid
) from public;
revoke all on function public.record_public_clip_view(uuid, numeric, boolean, text) from public;
grant execute on function public.get_public_clip_feed(
  uuid, timestamptz, integer, integer, uuid, text, uuid
) to anon, authenticated;
grant execute on function public.record_public_clip_view(uuid, numeric, boolean, text)
  to anon, authenticated;

commit;
