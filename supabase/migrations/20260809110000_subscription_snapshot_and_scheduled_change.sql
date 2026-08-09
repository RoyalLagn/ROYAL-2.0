begin;

-- Purchase-snapshot and scheduled-downgrade columns. Additive only.

alter table public.vendor_subscriptions
  add column if not exists billing_option_id uuid references public.subscription_plan_billing_options(id) on delete set null,
  add column if not exists plan_snapshot jsonb,
  add column if not exists scheduled_plan_id uuid references public.subscription_plans(id) on delete set null,
  add column if not exists scheduled_billing_option_id uuid references public.subscription_plan_billing_options(id) on delete set null,
  add column if not exists scheduled_plan_snapshot jsonb,
  add column if not exists scheduled_payment_id uuid references public.subscription_payments(id) on delete set null,
  add column if not exists scheduled_change_at timestamptz,
  add column if not exists scheduled_reason text;

alter table public.subscription_payments
  add column if not exists billing_option_id uuid references public.subscription_plan_billing_options(id) on delete set null;

-- Widen access_source to add 'free_fallback' -- used when a vendor's paid
-- access lapses (expiry, exhausted grace, or a cancellation reaching its
-- period end) and the lifecycle processor safely re-anchors them onto the
-- permanent Free plan instead of leaving them with zero entitlements.
alter table public.vendor_subscriptions
  drop constraint if exists vendor_subscriptions_access_source_check;
alter table public.vendor_subscriptions
  add constraint vendor_subscriptions_access_source_check
  check (access_source in (
    'paid_subscription', 'free_trial', 'launch_offer', 'admin_grant',
    'promotional_offer', 'manual_extension', 'free_fallback'
  ));

create index if not exists vendor_subscriptions_scheduled_change_idx
  on public.vendor_subscriptions(scheduled_change_at)
  where scheduled_change_at is not null;

commit;
