# Subscription platform deployment and testing

## Deployment order

1. Apply migrations `20260801120000` through `20260801123000` in timestamp order.
2. Configure Edge Function secrets with `supabase secrets set`:
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
   `SUBSCRIPTION_CRON_SECRET`, plus the existing
   Supabase and Cloudinary server secrets.
3. Deploy `create-razorpay-order`, `verify-razorpay-payment`,
   `record-razorpay-checkout-outcome`, and
   `process-subscription-lifecycle`.
4. Schedule a daily POST to `/functions/v1/process-subscription-lifecycle`
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

## Test activation

Configure `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as a matching pair.
Use `rzp_test_...` for testing or `rzp_live_...` for real payments. The generic
pair takes priority; an incomplete pair fails instead of falling back to test.
Legacy `RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET` continue to work only
when both generic variables are absent, and accept test keys only.
No Key Secret is stored in the client bundle or database. The public checkout
Key ID is returned by the server when creating an order.

## Live activation

1. In Supabase Dashboard → Edge Functions → Secrets, save the matching live
   `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` together. These affect all payment
   flows: subscriptions, booking advances and featured placements.
2. Save `RAZORPAY_WEBHOOK_SECRET` with exactly the secret configured on the
   Razorpay Live Mode webhook. It is separate from the API Key Secret.
3. Webhook URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`.
   Subscribe to `payment.authorized`, `payment.captured`, `payment.failed`,
   `order.paid`, and `refund.processed`.
4. Redeploy `create-razorpay-order`, `verify-razorpay-payment`,
   `create-booking-order`, `verify-booking-payment`,
   `create-featured-placement-order`, `verify-featured-placement-payment`,
   and `razorpay-webhook`. Preserve existing JWT settings; the webhook
   authenticates Razorpay signatures instead of Supabase JWTs.
5. Confirm checkout displays the expected plan/booking amount, complete an
   owner-approved small real payment, and check capture, signature verification,
   webhook delivery and entitlement/booking activation. Test dismissal/failure
   and duplicate webhook delivery too. Never mark activation complete based
   only on deploying code or saving secrets.

Secrets updates take effect without a frontend rebuild. Existing test orders
must be finished before switching API credentials: the live pair cannot verify
an old test payment. Roll back by replacing both generic variables with the
matching test pair, never by changing only one value.
