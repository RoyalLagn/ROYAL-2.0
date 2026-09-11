begin;

create extension if not exists pg_net with schema extensions;

alter table public.vendor_notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists vendor_notifications_event_key_unique_idx
  on public.vendor_notifications ((metadata->>'event_key'))
  where metadata ? 'event_key';

create table if not exists private.subscription_lifecycle_dispatch_tokens (
  token_hash text primary key,
  expires_at timestamptz not null
);

create table if not exists private.clip_media_deletion_outbox (
  clip_id uuid primary key,
  vendor_id uuid not null,
  cloudinary_public_id text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);

create or replace function public.consume_subscription_lifecycle_dispatch(token text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare affected integer;
begin
  delete from private.subscription_lifecycle_dispatch_tokens
  where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    and expires_at > now();
  get diagnostics affected = row_count;
  delete from private.subscription_lifecycle_dispatch_tokens where expires_at <= now();
  return affected > 0;
end;
$$;

revoke all on function public.consume_subscription_lifecycle_dispatch(text) from public, anon, authenticated;
grant execute on function public.consume_subscription_lifecycle_dispatch(text) to service_role;

create or replace function public.prepare_elite_expiry_policy(run_at timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare warning_count integer := 0; cleanup_count integer := 0;
begin
  -- A renewal or replacement Elite period makes an older warning obsolete.
  update public.vendor_notifications notification
  set is_read = true, read_at = coalesce(read_at, run_at),
      metadata = metadata || jsonb_build_object('resolved_at', run_at)
  where notification.kind = 'elite_expiry_warning'
    and not notification.is_read
    and not exists (
      select 1 from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.id = (notification.metadata->>'subscription_id')::uuid
        and subscription.vendor_id = notification.vendor_id
        and lower(plan.slug) = 'elite'
        and subscription.expiry_date is not null
        and subscription.expiry_date > run_at
        and subscription.expiry_date <= run_at + interval '5 days'
    );

  with candidates as (
    select subscription.id subscription_id, subscription.vendor_id,
      subscription.expiry_date,
      greatest(1, ceil(extract(epoch from (subscription.expiry_date - run_at)) / 86400.0)::integer) days_remaining
    from public.vendor_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    where lower(plan.slug) = 'elite'
      and subscription.status in ('active', 'cancelled')
      and subscription.expiry_date > run_at
      and subscription.expiry_date <= run_at + interval '5 days'
  ), inserted as (
    insert into public.vendor_notifications(vendor_id, title, body, kind, target_path, metadata)
    select vendor_id,
      'Your Elite plan ends soon',
      'Your Elite subscription ends in ' || days_remaining || case when days_remaining = 1 then ' day.' else ' days.' end ||
        ' Renew it to keep your Clips. If Elite access ends, all your Clips will be permanently deleted from your dashboard and the public app.',
      'elite_expiry_warning', '/VendorSubscription',
      jsonb_build_object(
        'event_key', 'elite-expiry:' || subscription_id::text || ':' || expiry_date::text,
        'subscription_id', subscription_id, 'expires_at', expiry_date,
        'days_remaining', days_remaining, 'push_status', 'pending'
      )
    from candidates
    on conflict ((metadata->>'event_key')) where metadata ? 'event_key' do nothing
    returning id
  ) select count(*) into warning_count from inserted;

  -- Queue every remaining Clip once the vendor no longer has current Elite
  -- access. The Edge worker removes Cloudinary assets before final DB deletion.
  with queued as (
    insert into private.clip_media_deletion_outbox(clip_id, vendor_id, cloudinary_public_id, reason)
    select clip.id, clip.vendor_id, clip.cloudinary_public_id, 'elite_subscription_ended'
    from public.clips clip
    where not exists (
      select 1 from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.vendor_id = clip.vendor_id and lower(plan.slug) = 'elite'
        and (
          (subscription.status = 'active' and (subscription.expiry_date is null or subscription.expiry_date > run_at))
          or (subscription.status = 'trial' and coalesce(subscription.trial_end_date, subscription.expiry_date) > run_at)
          or (subscription.status in ('past_due','grace_period') and subscription.grace_period_end_date > run_at)
          or (subscription.status = 'cancelled' and subscription.expiry_date > run_at)
        )
    )
    on conflict (clip_id) do nothing returning clip_id
  ) select count(*) into cleanup_count from queued;

  return jsonb_build_object('warnings_created', warning_count, 'clips_queued', cleanup_count);
end;
$$;

revoke all on function public.prepare_elite_expiry_policy(timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_elite_expiry_policy(timestamptz) to service_role;

create or replace function public.list_pending_elite_expiry_pushes()
returns table(notification_id uuid, vendor_id uuid, profile_id uuid, title text, body text, target_path text, tokens text[])
language sql security definer set search_path = '' as $$
  select notification.id, notification.vendor_id, vendor.profile_id,
    notification.title, coalesce(notification.body, ''), notification.target_path,
    coalesce(array_agg(token.token) filter (where token.token is not null), '{}'::text[])
  from public.vendor_notifications notification
  join public.vendors vendor on vendor.id = notification.vendor_id
  left join public.push_tokens token on token.profile_id = vendor.profile_id and token.role = 'vendor'
  where notification.kind = 'elite_expiry_warning'
    and notification.metadata->>'push_status' = 'pending'
  group by notification.id, notification.vendor_id, vendor.profile_id;
$$;

create or replace function public.complete_elite_expiry_push(notification_id uuid, error_message text default null)
returns void language sql security definer set search_path = '' as $$
  update public.vendor_notifications set metadata = metadata || jsonb_build_object(
    'push_status', case when error_message is null then 'sent' else 'failed' end,
    'push_processed_at', now(), 'push_error', error_message
  ) where id = notification_id and kind = 'elite_expiry_warning';
$$;

create or replace function public.list_pending_elite_clip_deletions(batch_size integer default 50)
returns table(clip_id uuid, vendor_id uuid, cloudinary_public_id text)
language sql security definer set search_path = '' as $$
  select job.clip_id, job.vendor_id, job.cloudinary_public_id
  from private.clip_media_deletion_outbox job
  order by job.created_at limit greatest(1, least(batch_size, 100));
$$;

create or replace function public.complete_elite_clip_deletion(target_clip_id uuid, error_message text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if error_message is not null then
    update private.clip_media_deletion_outbox set attempts = attempts + 1, last_error = left(error_message, 1000)
    where clip_id = target_clip_id;
    -- Public/vendor visibility is removed immediately. Keep the outbox row so
    -- transient Cloudinary failures can be retried without restoring the Clip.
    delete from public.clips where id = target_clip_id;
    return true;
  end if;
  delete from public.clips where id = target_clip_id;
  delete from private.clip_media_deletion_outbox where clip_id = target_clip_id;
  return true;
end;
$$;

revoke all on function public.list_pending_elite_expiry_pushes() from public, anon, authenticated;
revoke all on function public.complete_elite_expiry_push(uuid,text) from public, anon, authenticated;
revoke all on function public.list_pending_elite_clip_deletions(integer) from public, anon, authenticated;
revoke all on function public.complete_elite_clip_deletion(uuid,text) from public, anon, authenticated;
grant execute on function public.list_pending_elite_expiry_pushes() to service_role;
grant execute on function public.complete_elite_expiry_push(uuid,text) to service_role;
grant execute on function public.list_pending_elite_clip_deletions(integer) to service_role;
grant execute on function public.complete_elite_clip_deletion(uuid,text) to service_role;

create or replace function public.dispatch_subscription_lifecycle()
returns bigint language plpgsql security definer set search_path = '' as $$
declare token text; request_id bigint;
begin
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.subscription_lifecycle_dispatch_tokens(token_hash, expires_at)
  values (encode(extensions.digest(token, 'sha256'), 'hex'), now() + interval '10 minutes');
  select net.http_post(
    url := 'https://fymdrjcinqvmjthdwrtd.supabase.co/functions/v1/process-subscription-lifecycle',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('dispatchToken', token), timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.dispatch_subscription_lifecycle() from public, anon, authenticated;
grant execute on function public.dispatch_subscription_lifecycle() to service_role;

do $$
declare existing_job bigint; unscheduled boolean; scheduled_job bigint;
begin
  if to_regclass('cron.job') is null then return; end if;
  execute 'select jobid from cron.job where jobname = $1 limit 1' into existing_job using 'royallagn-subscription-lifecycle-daily';
  if existing_job is not null then execute 'select cron.unschedule($1)' into unscheduled using existing_job; end if;
  execute 'select cron.schedule($1,$2,$3)' into scheduled_job using
    'royallagn-subscription-lifecycle-daily', '30 3 * * *', 'select public.dispatch_subscription_lifecycle();';
end;
$$;

notify pgrst, 'reload schema';
commit;
