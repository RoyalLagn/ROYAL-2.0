begin;

create table if not exists public.subscription_checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  billing_option_id uuid references public.subscription_plan_billing_options(id),
  offer_id uuid references public.subscription_offers(id),
  currency text not null,
  original_amount_minor bigint not null check (original_amount_minor >= 0),
  yearly_discount_minor bigint not null default 0 check (yearly_discount_minor >= 0),
  promotional_discount_minor bigint not null default 0 check (promotional_discount_minor >= 0),
  current_plan_credit_minor bigint not null default 0 check (current_plan_credit_minor >= 0),
  final_payable_minor bigint not null check (final_payable_minor >= 0),
  subscription_start_at timestamptz not null,
  subscription_end_at timestamptz,
  quote_expires_at timestamptz not null,
  used_at timestamptz,
  payment_id uuid references public.subscription_payments(id),
  calculation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_checkout_quotes_vendor_created_idx
  on public.subscription_checkout_quotes(vendor_id, created_at desc);
create index if not exists subscription_checkout_quotes_expiry_idx
  on public.subscription_checkout_quotes(quote_expires_at) where used_at is null;
create unique index if not exists subscription_payments_quote_unique_idx
  on public.subscription_payments((metadata->>'quote_id'))
  where metadata ? 'quote_id';

alter table public.subscription_checkout_quotes enable row level security;
revoke all on public.subscription_checkout_quotes from public, anon, authenticated;
grant all on public.subscription_checkout_quotes to service_role;

create or replace function public.create_my_subscription_quote(
  target_plan_id uuid,
  target_billing_option_id uuid default null,
  target_offer_id uuid default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_vendor_id uuid;
  evaluated_at timestamptz := clock_timestamp();
  resolved record;
  current_subscription public.vendor_subscriptions%rowtype;
  current_payment public.subscription_payments%rowtype;
  period_start timestamptz;
  period_end timestamptz;
  remaining_seconds numeric;
  total_seconds numeric;
  ratio numeric := 1;
  original_minor bigint;
  yearly_minor bigint;
  promo_minor bigint;
  credit_minor bigint := 0;
  target_remaining_minor bigint;
  payable_minor bigint;
  quote_id uuid;
  quote_expiry timestamptz := evaluated_at + interval '10 minutes';
  snapshot jsonb;
begin
  target_vendor_id := private.subscription_vendor_for_user();
  if target_vendor_id is null then raise exception 'Vendor access required'; end if;

  select * into resolved from public.resolve_subscription_checkout(
    target_vendor_id, target_plan_id, target_offer_id,
    target_billing_option_id, evaluated_at
  );
  if not found then raise exception 'Unable to calculate subscription pricing'; end if;

  period_start := evaluated_at;
  period_end := case resolved.billing_interval
    when 'year' then evaluated_at + interval '1 year'
    when 'month' then evaluated_at + interval '1 month'
    else null
  end;

  if resolved.is_prorated_upgrade then
    select * into current_subscription
    from public.vendor_subscriptions subscription
    where subscription.vendor_id = target_vendor_id
      and subscription.id is not null
    order by subscription.updated_at desc limit 1;
    select * into current_payment from public.subscription_payments
    where id = current_subscription.last_payment_id and payment_status = 'verified';

    period_start := evaluated_at;
    period_end := current_subscription.expiry_date;
    total_seconds := extract(epoch from (coalesce(current_payment.period_end, current_subscription.expiry_date)
      - coalesce(current_payment.period_start, current_subscription.start_date)));
    remaining_seconds := extract(epoch from (period_end - evaluated_at));
    if total_seconds <= 0 or remaining_seconds <= 0 then
      raise exception 'The active subscription period cannot be prorated';
    end if;
    ratio := least(1, greatest(0, remaining_seconds / total_seconds));

    -- Monetary proration is performed once in paise. No client-provided
    -- credit or payable value participates in this calculation.
    credit_minor := round(current_payment.amount_minor * ratio)::bigint;
    target_remaining_minor := round(resolved.full_cycle_payable * 100 * ratio)::bigint;
    payable_minor := greatest(0, target_remaining_minor - credit_minor);
    original_minor := round(resolved.base_amount * 100 * ratio)::bigint;
    yearly_minor := round(resolved.interval_discount_amount * 100)::bigint;
    promo_minor := round(resolved.promotional_discount_amount * 100)::bigint;
  else
    original_minor := round(resolved.original_amount * 100)::bigint;
    yearly_minor := round(resolved.interval_discount_amount * 100)::bigint;
    promo_minor := round(resolved.promotional_discount_amount * 100)::bigint;
    payable_minor := resolved.amount_minor;
    target_remaining_minor := payable_minor;
  end if;

  snapshot := jsonb_build_object(
    'quote_version', 1,
    'previous_plan_id', current_subscription.plan_id,
    'new_plan_id', target_plan_id,
    'current_plan_value_minor', coalesce(current_payment.original_amount * 100, 0),
    'current_amount_paid_minor', coalesce(current_payment.amount_minor, 0),
    'subscription_start_at', period_start,
    'subscription_end_at', period_end,
    'upgrade_requested_at', evaluated_at,
    'remaining_seconds', coalesce(remaining_seconds, 0),
    'unused_credit_minor', credit_minor,
    'target_remaining_value_minor', target_remaining_minor,
    'upgrade_amount_minor', payable_minor,
    'discounts_applied', jsonb_build_object(
      'yearly_minor', yearly_minor,
      'promotional_minor', promo_minor,
      'yearly_percentage', resolved.interval_discount_percentage,
      'promotional_percentage', resolved.promotional_discount_percentage
    ),
    'is_prorated_upgrade', resolved.is_prorated_upgrade,
    'proration_ratio', ratio,
    'full_cycle_payable_minor', round(resolved.full_cycle_payable * 100)::bigint
  );

  insert into public.subscription_checkout_quotes(
    vendor_id, plan_id, billing_option_id, offer_id, currency,
    original_amount_minor, yearly_discount_minor,
    promotional_discount_minor, current_plan_credit_minor,
    final_payable_minor, subscription_start_at, subscription_end_at,
    quote_expires_at, calculation_snapshot
  ) values (
    target_vendor_id, target_plan_id, target_billing_option_id, target_offer_id,
    resolved.currency, original_minor, yearly_minor, promo_minor, credit_minor,
    payable_minor, period_start, period_end, quote_expiry, snapshot
  ) returning id into quote_id;

  return jsonb_build_object(
    'quote_id', quote_id,
    'quote_expires_at', quote_expiry,
    'plan_id', target_plan_id,
    'billing_option_id', target_billing_option_id,
    'offer_id', target_offer_id,
    'plan_name', resolved.plan_name,
    'billing_interval', resolved.billing_interval,
    'currency', resolved.currency,
    'original_amount', original_minor / 100.0,
    'interval_discount_percentage', resolved.interval_discount_percentage,
    'interval_discount_amount', yearly_minor / 100.0,
    'promotional_discount_percentage', resolved.promotional_discount_percentage,
    'promotional_discount_amount', promo_minor / 100.0,
    'current_plan_credit', credit_minor / 100.0,
    'is_prorated_upgrade', resolved.is_prorated_upgrade,
    'proration_period_end', case when resolved.is_prorated_upgrade then period_end else null end,
    'proration_evaluated_at', evaluated_at,
    'full_cycle_payable', resolved.full_cycle_payable,
    'total_savings', (yearly_minor + promo_minor + credit_minor) / 100.0,
    'payable_amount', payable_minor / 100.0,
    'amount_minor', payable_minor,
    'subscription_start_at', period_start,
    'subscription_end_at', period_end
  );
end;
$$;

revoke all on function public.create_my_subscription_quote(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_my_subscription_quote(uuid, uuid, uuid) to authenticated;

commit;
