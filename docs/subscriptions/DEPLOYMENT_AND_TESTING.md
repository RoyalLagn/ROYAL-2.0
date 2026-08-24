# Subscription platform deployment and testing

## Deployment order

1. Apply migrations `20260801120000` through `20260801123000` in timestamp order.
2. Configure Edge Function secrets with `supabase secrets set`:
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET`, `SUBSCRIPTION_CRON_SECRET`, plus the existing
   Supabase and Cloudinary server secrets.
3. Deploy `create-razorpay-order`, `verify-razorpay-payment`,
   `razorpay-webhook`, `record-razorpay-checkout-outcome`, and
   `process-subscription-lifecycle`.
4. In the Razorpay dashboard for the same environment as the configured keys, point the webhook at
   `/functions/v1/razorpay-webhook` and subscribe to `payment.authorized`,
   `payment.captured`, `payment.failed`, `order.paid`, and `refund.processed`.
5. Schedule a daily POST to `/functions/v1/process-subscription-lifecycle`
   with `x-cron-secret`. Running it more often is safe: lifecycle changes,
   webhook events, payments, and reminder logs are idempotent.

## Rollout safety

The seed enables a configurable 90-day launch window beginning when the
migration is applied. Approved active Vendors receive effective launch access
without a client hardcode, and the scheduler persists those grants. Admin can
change or disable the dates from Subscription Management. Public profile,
portfolio, and Clip read policies are unchanged.

## Test matrix

- Public signup/login and anonymous browsing work with no subscription row.
- Vendor signup, approval, workspace claim and Vendor login remain unchanged.
- Launch access exposes Vendor premium actions until the configured end date.
- Expired/suspended Vendors can browse their published content but mutation
  attempts fail in both the client gate and database/Edge Function check.
- Razorpay checkout uses the database plan amount, verifies the signature and
  provider amount/order/currency, then activates.
- Replaying checkout verification or a webhook does not add another period.
- Admin can edit plans/features/offers/settings, grant/extend/shorten/suspend/
  cancel/reactivate access, and inspect payments and audit events.
- Daily lifecycle processing queues one reminder per type/date and transitions
  trial, launch, active and grace-period access exactly once.

## Production activation

Live payments are enabled by configuring matching live `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET` secrets, setting a production webhook secret, deploying
the functions, and enabling the listed events in Razorpay. No credential is
stored in the client bundle or database.
