begin;

-- Keep the existing administrator contract while also supporting the
-- super_admin role already recognized by the client.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'super_admin')
      and is_active
  );
$$;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  price numeric(12, 2) not null default 0,
  discounted_price numeric(12, 2),
  currency text not null default 'INR',
  billing_interval text not null default 'month'
    check (billing_interval in ('day', 'month', 'year', 'custom')),
  billing_interval_count integer not null default 1
    check (billing_interval_count > 0),
  duration_days integer check (duration_days is null or duration_days > 0),
  trial_enabled boolean not null default false,
  trial_days integer not null default 0 check (trial_days >= 0),
  grace_period_days integer not null default 0 check (grace_period_days >= 0),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  available_from timestamptz,
  available_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint subscription_plans_name_not_blank check (btrim(name) <> ''),
  constraint subscription_plans_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint subscription_plans_price_nonnegative check (price >= 0),
  constraint subscription_plans_discount_nonnegative check (
    discounted_price is null or discounted_price >= 0
  ),
  constraint subscription_plans_discount_not_above_price check (
    discounted_price is null or discounted_price <= price
  ),
  constraint subscription_plans_availability_order check (
    available_until is null or available_from is null or available_until > available_from
  ),
  constraint subscription_plans_custom_duration check (
    billing_interval <> 'custom' or duration_days is not null
  )
);

create unique index if not exists subscription_plans_slug_unique_idx
  on public.subscription_plans(lower(slug));
create index if not exists subscription_plans_public_order_idx
  on public.subscription_plans(is_active, display_order, created_at)
  where archived_at is null;

create table if not exists public.subscription_feature_definitions (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_features_key_format check (
    feature_key ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint subscription_features_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.subscription_plan_features (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_id uuid not null references public.subscription_feature_definitions(id) on delete cascade,
  is_enabled boolean not null default true,
  limit_value integer check (limit_value is null or limit_value >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_id)
);

create table if not exists public.subscription_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text,
  discount_type text not null
    check (discount_type in ('percentage', 'fixed', 'free')),
  discount_value numeric(12, 2) not null default 0,
  start_date timestamptz,
  end_date timestamptz,
  maximum_uses integer check (maximum_uses is null or maximum_uses > 0),
  uses_per_vendor integer not null default 1 check (uses_per_vendor > 0),
  current_uses integer not null default 0 check (current_uses >= 0),
  applicable_plan_ids uuid[] not null default '{}',
  applicable_vendor_ids uuid[] not null default '{}',
  is_global boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint subscription_offers_name_not_blank check (btrim(name) <> ''),
  constraint subscription_offers_code_not_blank check (code is null or btrim(code) <> ''),
  constraint subscription_offers_value_nonnegative check (discount_value >= 0),
  constraint subscription_offers_percentage_range check (
    discount_type <> 'percentage' or discount_value <= 100
  ),
  constraint subscription_offers_date_order check (
    end_date is null or start_date is null or end_date > start_date
  )
);

create unique index if not exists subscription_offers_code_unique_ci_idx
  on public.subscription_offers(lower(code)) where code is not null and archived_at is null;
create index if not exists subscription_offers_active_dates_idx
  on public.subscription_offers(is_active, start_date, end_date)
  where archived_at is null;

create table if not exists public.vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete restrict,
  offer_id uuid references public.subscription_offers(id) on delete set null,
  status text not null default 'pending'
    check (status in (
      'pending', 'trial', 'launch_offer', 'active', 'past_due',
      'grace_period', 'expired', 'cancelled', 'suspended', 'deactivated'
    )),
  access_source text not null default 'paid_subscription'
    check (access_source in (
      'paid_subscription', 'free_trial', 'launch_offer', 'admin_grant',
      'promotional_offer', 'manual_extension'
    )),
  start_date timestamptz,
  expiry_date timestamptz,
  trial_start_date timestamptz,
  trial_end_date timestamptz,
  launch_offer_start_date timestamptz,
  launch_offer_end_date timestamptz,
  grace_period_end_date timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  suspended_at timestamptz,
  auto_renew boolean not null default false,
  razorpay_subscription_id text,
  razorpay_customer_id text,
  last_payment_id uuid,
  admin_grant boolean not null default false,
  admin_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_subscriptions_period_order check (
    expiry_date is null or start_date is null or expiry_date > start_date
  ),
  constraint vendor_subscriptions_trial_order check (
    trial_end_date is null or trial_start_date is null or trial_end_date > trial_start_date
  ),
  constraint vendor_subscriptions_launch_order check (
    launch_offer_end_date is null or launch_offer_start_date is null
    or launch_offer_end_date > launch_offer_start_date
  ),
  constraint vendor_subscriptions_grace_order check (
    grace_period_end_date is null or expiry_date is null
    or grace_period_end_date >= expiry_date
  )
);

create unique index if not exists vendor_subscriptions_one_current_idx
  on public.vendor_subscriptions(vendor_id)
  where status in ('pending', 'trial', 'launch_offer', 'active', 'past_due', 'grace_period', 'suspended');
create unique index if not exists vendor_subscriptions_razorpay_subscription_unique_idx
  on public.vendor_subscriptions(razorpay_subscription_id)
  where razorpay_subscription_id is not null;
create index if not exists vendor_subscriptions_vendor_created_idx
  on public.vendor_subscriptions(vendor_id, created_at desc);
create index if not exists vendor_subscriptions_status_expiry_idx
  on public.vendor_subscriptions(status, expiry_date);
create index if not exists vendor_subscriptions_trial_expiry_idx
  on public.vendor_subscriptions(status, trial_end_date) where status = 'trial';
create index if not exists vendor_subscriptions_grace_expiry_idx
  on public.vendor_subscriptions(status, grace_period_end_date) where status = 'grace_period';

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  subscription_id uuid references public.vendor_subscriptions(id) on delete set null,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  offer_id uuid references public.subscription_offers(id) on delete set null,
  amount numeric(12, 2) not null,
  amount_minor bigint not null,
  original_amount numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  payment_status text not null default 'created'
    check (payment_status in (
      'created', 'pending', 'authorized', 'captured', 'verified',
      'failed', 'refunded', 'partially_refunded'
    )),
  payment_method text,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_invoice_id text,
  failure_code text,
  failure_reason text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  verified_at timestamptz,
  refunded_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_payments_amount_nonnegative check (
    amount >= 0 and amount_minor >= 0 and original_amount >= 0 and discount_amount >= 0
  ),
  constraint subscription_payments_minor_matches check (
    amount_minor = round(amount * 100)::bigint
  )
);

alter table public.vendor_subscriptions
  drop constraint if exists vendor_subscriptions_last_payment_id_fkey;
alter table public.vendor_subscriptions
  add constraint vendor_subscriptions_last_payment_id_fkey
  foreign key (last_payment_id) references public.subscription_payments(id) on delete set null;

create unique index if not exists subscription_payments_idempotency_unique_idx
  on public.subscription_payments(idempotency_key);
create unique index if not exists subscription_payments_order_unique_idx
  on public.subscription_payments(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists subscription_payments_payment_unique_idx
  on public.subscription_payments(razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists subscription_payments_vendor_created_idx
  on public.subscription_payments(vendor_id, created_at desc);
create index if not exists subscription_payments_status_created_idx
  on public.subscription_payments(payment_status, created_at desc);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  subscription_id uuid references public.vendor_subscriptions(id) on delete set null,
  payment_id uuid references public.subscription_payments(id) on delete set null,
  event_type text not null,
  previous_status text,
  new_status text,
  performed_by uuid references public.profiles(id) on delete set null,
  performed_by_role text not null default 'system',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_events_type_not_blank check (btrim(event_type) <> '')
);

create index if not exists subscription_events_vendor_created_idx
  on public.subscription_events(vendor_id, created_at desc);
create index if not exists subscription_events_subscription_created_idx
  on public.subscription_events(subscription_id, created_at desc);
create index if not exists subscription_events_payment_idx
  on public.subscription_events(payment_id) where payment_id is not null;

create table if not exists public.application_settings (
  key text primary key,
  value jsonb not null,
  value_type text not null default 'json'
    check (value_type in ('boolean', 'integer', 'decimal', 'string', 'timestamp', 'uuid', 'json')),
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_settings_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

create table if not exists public.subscription_notification_log (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  subscription_id uuid references public.vendor_subscriptions(id) on delete cascade,
  payment_id uuid references public.subscription_payments(id) on delete cascade,
  notification_type text not null,
  scheduled_for date not null,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sent', 'failed', 'skipped')),
  delivered_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, notification_type, scheduled_for)
);

create index if not exists subscription_notification_delivery_idx
  on public.subscription_notification_log(delivery_status, scheduled_for);

create table if not exists public.subscription_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  payment_id uuid references public.subscription_payments(id) on delete set null,
  safe_payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index if not exists subscription_webhook_processing_idx
  on public.subscription_webhook_events(processing_status, received_at);

create or replace function private.subscription_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'subscription_plans', 'subscription_feature_definitions',
    'subscription_plan_features', 'subscription_offers',
    'vendor_subscriptions', 'subscription_payments',
    'application_settings', 'subscription_notification_log'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.subscription_set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

insert into public.subscription_feature_definitions(feature_key, name, description)
values
  ('vendor_dashboard_actions', 'Vendor dashboard actions', 'Access premium actions from the vendor workspace.'),
  ('upload_clips', 'Upload Clips', 'Upload, edit and manage vendor Clips.'),
  ('edit_vendor_profile', 'Edit vendor profile', 'Edit business profile, services and packages.'),
  ('upload_gallery', 'Upload gallery media', 'Upload portfolio images and videos.'),
  ('manage_albums', 'Manage albums', 'Create, edit, reorder and publish portfolio albums.'),
  ('view_analytics', 'View analytics', 'View advanced Clip and profile analytics.'),
  ('receive_enquiries', 'Receive enquiries', 'Receive new customer enquiries when this business rule is enabled.'),
  ('manage_reviews', 'Manage reviews', 'Use vendor review-management tools.'),
  ('featured_listing', 'Featured listing', 'Eligibility for featured marketplace placement.'),
  ('priority_support', 'Priority support', 'Priority subscription support.')
on conflict (feature_key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

insert into public.subscription_plans(
  name, slug, description, price, currency, billing_interval,
  billing_interval_count, trial_enabled, trial_days, grace_period_days,
  is_active, is_featured, display_order, metadata
)
select
  'RoyalLagn Standard',
  'royallagn-standard',
  'Essential RoyalLagn tools for verified wedding vendors.',
  999.00,
  'INR',
  'month',
  1,
  false,
  0,
  3,
  true,
  true,
  1,
  jsonb_build_object('seeded', true)
where not exists (
  select 1 from public.subscription_plans where lower(slug) = 'royallagn-standard'
);

insert into public.subscription_plan_features(plan_id, feature_id, is_enabled, limit_value)
select plan.id, feature.id,
  case when feature.feature_key in (
    'vendor_dashboard_actions', 'upload_clips', 'edit_vendor_profile',
    'upload_gallery', 'manage_albums', 'view_analytics', 'receive_enquiries',
    'manage_reviews'
  ) then true else false end,
  case when feature.feature_key = 'upload_clips' then 10 else null end
from public.subscription_plans plan
cross join public.subscription_feature_definitions feature
where lower(plan.slug) = 'royallagn-standard'
on conflict (plan_id, feature_id) do nothing;

insert into public.application_settings(key, value, value_type, description, is_public)
values
  ('subscription_launch_offer_enabled', 'true'::jsonb, 'boolean', 'Enable database-controlled launch access.', true),
  ('subscription_launch_offer_start_date', to_jsonb(now()::text), 'timestamp', 'Launch offer start in UTC.', true),
  ('subscription_launch_offer_end_date', to_jsonb((now() + interval '90 days')::text), 'timestamp', 'Launch offer end in UTC.', true),
  ('subscription_launch_offer_title', to_jsonb('RoyalLagn Launch Offer'::text), 'string', 'Vendor-facing launch offer title.', true),
  ('subscription_launch_offer_description', to_jsonb('Enjoy RoyalLagn vendor tools during the launch period.'::text), 'string', 'Vendor-facing launch offer description.', true),
  ('subscription_launch_offer_plan_id', coalesce((select to_jsonb(id::text) from public.subscription_plans where lower(slug) = 'royallagn-standard' limit 1), 'null'::jsonb), 'uuid', 'Plan features granted during launch.', false),
  ('subscription_launch_offer_auto_activation', 'true'::jsonb, 'boolean', 'Automatically grant eligible approved vendors launch access.', false),
  ('subscription_launch_offer_grace_period_days', '0'::jsonb, 'integer', 'Grace days after launch access ends.', true),
  ('subscription_launch_offer_eligibility', to_jsonb('approved_vendors'::text), 'string', 'Launch eligibility rule.', false),
  ('subscription_default_plan_id', coalesce((select to_jsonb(id::text) from public.subscription_plans where lower(slug) = 'royallagn-standard' limit 1), 'null'::jsonb), 'uuid', 'Default vendor plan.', false),
  ('subscription_default_price', '999'::jsonb, 'decimal', 'Default display and plan creation price in INR.', true),
  ('subscription_default_duration_days', '30'::jsonb, 'integer', 'Default custom duration.', true),
  ('subscription_free_trial_enabled', 'false'::jsonb, 'boolean', 'Enable automatic free trials.', true),
  ('subscription_free_trial_days', '14'::jsonb, 'integer', 'Default free-trial length.', true),
  ('subscription_trial_new_vendors_only', 'true'::jsonb, 'boolean', 'Restrict automatic trials to newly approved vendors.', false),
  ('subscription_grace_period_days', '3'::jsonb, 'integer', 'Global fallback grace period.', true),
  ('subscription_public_content_requires_access', 'false'::jsonb, 'boolean', 'Keep published public content visible after expiry.', false),
  ('subscription_gate_new_enquiries', 'false'::jsonb, 'boolean', 'Gate receiving new enquiries by plan feature.', false),
  ('subscription_pending_payment_ttl_minutes', '30'::jsonb, 'integer', 'Mark stale pending payments as failed.', false),
  ('subscription_reminder_days', '[7,3,1,0]'::jsonb, 'json', 'Days before expiry to queue reminders.', false),
  ('razorpay_mode', to_jsonb('test'::text), 'string', 'Razorpay environment mode.', true)
on conflict (key) do nothing;

create or replace function private.subscription_setting_text(setting_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value #>> '{}'
  from public.application_settings
  where key = setting_key;
$$;

create or replace function private.subscription_setting_boolean(setting_key text, fallback boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare raw text;
begin
  raw := private.subscription_setting_text(setting_key);
  if raw is null then return fallback; end if;
  return raw::boolean;
exception when others then
  return fallback;
end;
$$;

create or replace function private.subscription_setting_integer(setting_key text, fallback integer default 0)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare raw text;
begin
  raw := private.subscription_setting_text(setting_key);
  if raw is null then return fallback; end if;
  return raw::integer;
exception when others then
  return fallback;
end;
$$;

create or replace function private.subscription_setting_timestamp(setting_key text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare raw text;
begin
  raw := private.subscription_setting_text(setting_key);
  if raw is null or raw = 'null' or btrim(raw) = '' then return null; end if;
  return raw::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function private.subscription_setting_uuid(setting_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare raw text;
begin
  raw := private.subscription_setting_text(setting_key);
  if raw is null or raw = 'null' or btrim(raw) = '' then return null; end if;
  return raw::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.subscription_vendor_for_user()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.vendors where profile_id = auth.uid() limit 1;
$$;

create or replace function private.subscription_plan_expiry(
  period_start timestamptz,
  target_plan_id uuid
) returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare plan public.subscription_plans%rowtype;
begin
  select * into plan from public.subscription_plans where id = target_plan_id;
  if not found then raise exception 'Subscription plan not found'; end if;
  if plan.duration_days is not null then
    return period_start + make_interval(days => plan.duration_days);
  end if;
  return case plan.billing_interval
    when 'day' then period_start + make_interval(days => plan.billing_interval_count)
    when 'month' then period_start + make_interval(months => plan.billing_interval_count)
    when 'year' then period_start + make_interval(years => plan.billing_interval_count)
    else period_start + make_interval(days => coalesce(plan.duration_days, 1))
  end;
end;
$$;

create or replace function public.subscription_effective_access(
  target_vendor_id uuid,
  evaluated_at timestamptz default now()
) returns table (
  vendor_id uuid,
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  status text,
  access_source text,
  start_date timestamptz,
  expiry_date timestamptz,
  grace_period_end_date timestamptz,
  days_remaining integer,
  has_access boolean,
  access_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_subscription public.vendor_subscriptions%rowtype;
  current_plan public.subscription_plans%rowtype;
  effective_expiry timestamptz;
  effective_status text;
  effective_access boolean := false;
  effective_reason text := 'subscription_required';
  launch_start timestamptz;
  launch_end timestamptz;
  launch_plan_id uuid;
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor access required' using errcode = '42501';
  end if;

  select * into current_subscription
  from public.vendor_subscriptions candidate
  where candidate.vendor_id = target_vendor_id
  order by
    case candidate.status
      when 'suspended' then 0 when 'deactivated' then 0
      when 'active' then 1 when 'trial' then 1 when 'launch_offer' then 1
      when 'grace_period' then 1 when 'past_due' then 2 when 'pending' then 3
      else 4
    end,
    candidate.updated_at desc,
    candidate.created_at desc
  limit 1;

  if current_subscription.id is not null then
    select * into current_plan from public.subscription_plans where id = current_subscription.plan_id;
    effective_status := current_subscription.status;
    effective_expiry := case current_subscription.status
      when 'trial' then coalesce(current_subscription.trial_end_date, current_subscription.expiry_date)
      when 'launch_offer' then coalesce(current_subscription.launch_offer_end_date, current_subscription.expiry_date)
      when 'grace_period' then current_subscription.grace_period_end_date
      else current_subscription.expiry_date
    end;

    if current_subscription.status in ('suspended', 'deactivated', 'cancelled') then
      effective_reason := current_subscription.status;
    elsif current_subscription.status = 'trial' and effective_expiry > evaluated_at then
      effective_access := true; effective_reason := 'free_trial';
    elsif current_subscription.status = 'launch_offer' and effective_expiry > evaluated_at then
      effective_access := true; effective_reason := 'launch_offer';
    elsif current_subscription.status = 'active'
      and (effective_expiry is null or effective_expiry > evaluated_at) then
      effective_access := true; effective_reason := current_subscription.access_source;
    elsif current_subscription.status in ('active', 'past_due', 'grace_period', 'trial', 'launch_offer')
      and current_subscription.grace_period_end_date > evaluated_at then
      effective_status := 'grace_period';
      effective_expiry := current_subscription.grace_period_end_date;
      effective_access := true; effective_reason := 'grace_period';
    else
      effective_status := case
        when current_subscription.status = 'pending' then 'pending'
        else 'expired'
      end;
      effective_reason := effective_status;
    end if;
  end if;

  if not effective_access
    and coalesce(current_subscription.status, '') not in ('suspended', 'deactivated')
    and private.subscription_setting_boolean('subscription_launch_offer_enabled', false)
  then
    launch_start := private.subscription_setting_timestamp('subscription_launch_offer_start_date');
    launch_end := private.subscription_setting_timestamp('subscription_launch_offer_end_date');
    if (launch_start is null or evaluated_at >= launch_start)
      and launch_end is not null and evaluated_at < launch_end
      and exists (
        select 1 from public.vendors vendor
        left join public.profiles profile on profile.id = vendor.profile_id
        where vendor.id = target_vendor_id
          and vendor.is_verified
          and coalesce(vendor.management_status, 'active') = 'active'
          and (vendor.profile_id is null or profile.is_active)
      )
    then
      launch_plan_id := coalesce(
        private.subscription_setting_uuid('subscription_launch_offer_plan_id'),
        private.subscription_setting_uuid('subscription_default_plan_id')
      );
      select * into current_plan from public.subscription_plans where id = launch_plan_id;
      current_subscription.id := null;
      current_subscription.plan_id := launch_plan_id;
      current_subscription.access_source := 'launch_offer';
      current_subscription.start_date := coalesce(launch_start, evaluated_at);
      current_subscription.grace_period_end_date := launch_end
        + make_interval(days => private.subscription_setting_integer('subscription_launch_offer_grace_period_days', 0));
      effective_status := 'launch_offer';
      effective_expiry := launch_end;
      effective_access := true;
      effective_reason := 'launch_offer';
    end if;
  end if;

  return query select
    target_vendor_id,
    current_subscription.id,
    current_subscription.plan_id,
    current_plan.name,
    coalesce(effective_status, 'expired'),
    coalesce(current_subscription.access_source, effective_reason),
    current_subscription.start_date,
    effective_expiry,
    current_subscription.grace_period_end_date,
    case
      when effective_expiry is null and effective_access then null
      when effective_expiry is null then 0
      else greatest(0, ceil(extract(epoch from (effective_expiry - evaluated_at)) / 86400.0)::integer)
    end,
    effective_access,
    effective_reason;
end;
$$;

create or replace function private.vendor_has_subscription_feature(
  target_vendor_id uuid,
  requested_feature_key text,
  evaluated_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or coalesce((
    select access.has_access and coalesce(plan_feature.is_enabled, false)
    from public.subscription_effective_access(target_vendor_id, evaluated_at) access
    left join public.subscription_feature_definitions feature
      on feature.feature_key = requested_feature_key and feature.is_active
    left join public.subscription_plan_features plan_feature
      on plan_feature.plan_id = access.plan_id and plan_feature.feature_id = feature.id
    limit 1
  ), false);
$$;

create or replace function public.get_my_subscription_access()
returns table (
  vendor_id uuid,
  subscription_id uuid,
  plan_id uuid,
  plan_name text,
  status text,
  access_source text,
  start_date timestamptz,
  expiry_date timestamptz,
  grace_period_end_date timestamptz,
  days_remaining integer,
  has_access boolean,
  access_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscription_effective_access(
    private.subscription_vendor_for_user(),
    now()
  )
  where private.subscription_vendor_for_user() is not null;
$$;

create or replace function public.require_vendor_feature_access(
  target_vendor_id uuid,
  requested_feature_key text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'Vendor ownership required' using errcode = '42501';
  end if;
  if not private.vendor_has_subscription_feature(target_vendor_id, requested_feature_key, now()) then
    raise exception 'An active subscription with this feature is required'
      using errcode = '42501', hint = 'SUBSCRIPTION_REQUIRED';
  end if;
  return true;
end;
$$;

-- Preserve legacy subscription access as an admin grant without deleting the
-- legacy table or changing existing reads during rollout.
insert into public.vendor_subscriptions(
  vendor_id, plan_id, status, access_source, start_date, expiry_date,
  admin_grant, admin_notes, created_at, updated_at
)
select
  legacy.vendor_id,
  plan.id,
  case legacy.status::text
    when 'active' then 'active'
    when 'cancelled' then 'cancelled'
    when 'expired' then 'expired'
    else 'pending'
  end,
  'admin_grant',
  legacy.start_date::timestamptz,
  (legacy.end_date + 1)::timestamptz,
  true,
  'Imported from the legacy subscriptions table.',
  legacy.created_at,
  legacy.created_at
from (
  select distinct on (candidate.vendor_id) candidate.*
  from public.subscriptions candidate
  order by candidate.vendor_id,
    case when candidate.status = 'active' then 0 else 1 end,
    candidate.created_at desc
) legacy
cross join lateral (
  select id from public.subscription_plans
  where lower(slug) = 'royallagn-standard' limit 1
) plan
where not exists (
  select 1 from public.vendor_subscriptions current
  where current.vendor_id = legacy.vendor_id
);

alter table public.subscription_plans enable row level security;
alter table public.subscription_feature_definitions enable row level security;
alter table public.subscription_plan_features enable row level security;
alter table public.subscription_offers enable row level security;
alter table public.vendor_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_events enable row level security;
alter table public.application_settings enable row level security;
alter table public.subscription_notification_log enable row level security;
alter table public.subscription_webhook_events enable row level security;

revoke all on public.subscription_plans, public.subscription_feature_definitions,
  public.subscription_plan_features, public.subscription_offers,
  public.vendor_subscriptions, public.subscription_payments,
  public.subscription_events, public.application_settings,
  public.subscription_notification_log, public.subscription_webhook_events
from anon, authenticated;

grant select on public.subscription_plans, public.subscription_feature_definitions,
  public.subscription_plan_features, public.subscription_offers,
  public.application_settings to anon, authenticated;
grant select on public.vendor_subscriptions, public.subscription_payments,
  public.subscription_events, public.subscription_notification_log to authenticated;
grant insert, update, delete on public.subscription_plans,
  public.subscription_feature_definitions, public.subscription_plan_features,
  public.subscription_offers, public.application_settings to authenticated;

create policy subscription_plans_public_read
on public.subscription_plans for select to anon, authenticated
using (
  private.is_admin()
  or (
    is_active and archived_at is null
    and (available_from is null or available_from <= now())
    and (available_until is null or available_until > now())
  )
);
create policy subscription_plans_admin_insert
on public.subscription_plans for insert to authenticated
with check (private.is_admin());
create policy subscription_plans_admin_update
on public.subscription_plans for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy subscription_plans_admin_delete
on public.subscription_plans for delete to authenticated
using (private.is_admin());

create policy subscription_features_public_read
on public.subscription_feature_definitions for select to anon, authenticated
using (is_active or private.is_admin());
create policy subscription_features_admin_insert
on public.subscription_feature_definitions for insert to authenticated
with check (private.is_admin());
create policy subscription_features_admin_update
on public.subscription_feature_definitions for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy subscription_features_admin_delete
on public.subscription_feature_definitions for delete to authenticated
using (private.is_admin());

create policy subscription_plan_features_public_read
on public.subscription_plan_features for select to anon, authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.subscription_plans plan
    where plan.id = plan_id and plan.is_active and plan.archived_at is null
  )
);
create policy subscription_plan_features_admin_insert
on public.subscription_plan_features for insert to authenticated
with check (private.is_admin());
create policy subscription_plan_features_admin_update
on public.subscription_plan_features for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy subscription_plan_features_admin_delete
on public.subscription_plan_features for delete to authenticated
using (private.is_admin());

create policy subscription_offers_applicable_read
on public.subscription_offers for select to anon, authenticated
using (
  private.is_admin()
  or (
    is_active and archived_at is null
    and (start_date is null or start_date <= now())
    and (end_date is null or end_date > now())
    and (
      is_global
      or private.subscription_vendor_for_user() = any(applicable_vendor_ids)
    )
  )
);
create policy subscription_offers_admin_insert
on public.subscription_offers for insert to authenticated
with check (private.is_admin());
create policy subscription_offers_admin_update
on public.subscription_offers for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy subscription_offers_admin_delete
on public.subscription_offers for delete to authenticated
using (private.is_admin());

create policy vendor_subscriptions_owner_admin_read
on public.vendor_subscriptions for select to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());
create policy subscription_payments_owner_admin_read
on public.subscription_payments for select to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());
create policy subscription_events_owner_admin_read
on public.subscription_events for select to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());
create policy subscription_notification_owner_admin_read
on public.subscription_notification_log for select to authenticated
using (private.owns_vendor(vendor_id) or private.is_admin());

create policy application_settings_public_admin_read
on public.application_settings for select to anon, authenticated
using (is_public or private.is_admin());
create policy application_settings_admin_insert
on public.application_settings for insert to authenticated
with check (private.is_admin());
create policy application_settings_admin_update
on public.application_settings for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy application_settings_admin_delete
on public.application_settings for delete to authenticated
using (private.is_admin());

revoke all on function public.subscription_effective_access(uuid, timestamptz) from public, anon;
revoke all on function public.get_my_subscription_access() from public, anon;
revoke all on function public.require_vendor_feature_access(uuid, text) from public, anon;
grant execute on function public.subscription_effective_access(uuid, timestamptz) to authenticated;
grant execute on function public.get_my_subscription_access() to authenticated;
grant execute on function public.require_vendor_feature_access(uuid, text) to authenticated;

-- Service-role writes are used by the payment and scheduled Edge Functions.
grant all on public.vendor_subscriptions, public.subscription_payments,
  public.subscription_events, public.subscription_notification_log,
  public.subscription_webhook_events to service_role;

commit;
