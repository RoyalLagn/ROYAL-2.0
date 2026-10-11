begin;

-- Add multi-package, multi-day, Razorpay, and refund tracking columns to vendor_bookings
alter table if exists public.vendor_bookings
  add column if not exists selected_packages jsonb not null default '[]'::jsonb,
  add column if not exists total_days integer not null default 1,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists payment_status text not null default 'paid_advance',
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_order_id text,
  add column if not exists refund_status text,
  add column if not exists refund_amount numeric(12, 2),
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_notes text;

create index if not exists vendor_bookings_refund_status_idx
  on public.vendor_bookings(refund_status)
  where refund_status is not null;

commit;
