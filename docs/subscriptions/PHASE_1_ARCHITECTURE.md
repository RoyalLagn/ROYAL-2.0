# RoyalLagn Subscription Platform — Phase 1 Architecture

## Existing architecture

- Expo Router owns mobile and web navigation under `app/`.
- Public authentication is provided by `PublicAuthContext`; vendor authentication resolves an approved vendor through `profiles.id -> vendors.profile_id`.
- Admin sessions are regular Supabase Auth sessions whose `profiles.role` is `admin` or `super_admin`. UI routes are protected by `AdminRouteGuard`; database authorization uses `private.is_admin()`.
- The vendor dashboard reads one combined workspace through `useVendorWorkspace`.
- The existing `subscriptions` table is a legacy table with a plan name, four statuses, and date-only periods. It remains in place for backward compatibility.
- `VendorSubscription.tsx`, `subscriptions-admin.tsx`, and `payments-admin.tsx` currently contain hardcoded or placeholder subscription UI and are the intended replacement points.
- Vendor notifications already persist in `vendor_notifications` and are displayed by `VendorNotifications.tsx`.
- Clip and Cloudinary authorization already use Supabase Edge Functions. These functions are the server-side enforcement points for paid upload features.
- Portfolio, clip, vendor-profile, and service writes also use Supabase RLS and can be protected centrally at the database layer.

## Subscription architecture

The implementation adds a parallel, normalized subscription domain without deleting or rewriting legacy data:

1. `subscription_plans`, `subscription_feature_definitions`, and `subscription_plan_features` define database-driven products and access.
2. `subscription_offers` defines global and vendor-specific promotions.
3. `vendor_subscriptions` stores the vendor's current/historical access periods.
4. `subscription_payments` stores server-calculated Razorpay transactions.
5. `subscription_events` is the immutable audit trail.
6. `application_settings` stores launch, trial, grace, reminder, and payment configuration.
7. `subscription_notification_log` prevents duplicate reminders.
8. `subscription_webhook_events` provides webhook idempotency.

`SubscriptionAccessService` is the only client entry point for status and feature decisions. Database functions and Edge Functions independently enforce the same access rules; client checks are only navigation and UX guards.

## Compatibility decisions

- Public users remain free and are never evaluated by subscription guards.
- Public vendor profiles, existing published portfolios, and public clips remain visible after vendor expiry.
- Existing authentication, approval, vendor workspace, Cloudinary assets, and navigation routes are preserved.
- Legacy `subscriptions` rows are imported once as historical/admin-granted access when the new schema is deployed.
- Razorpay secrets and the Supabase service-role key exist only in Edge Function secrets.
- Razorpay credentials select the provider environment; the client receives only the public checkout key returned by the order function.

## Premium enforcement points

- Clip insert/update and clip upload signing: `upload_clips`.
- Vendor profile and service writes: `edit_vendor_profile`.
- Portfolio media writes and Cloudinary signing: `upload_gallery`.
- Album writes and hero-gallery changes: `manage_albums`.
- Analytics reads: `view_analytics`.
- Dashboard premium actions and future paid routes: `vendor_dashboard_actions`.

Public reads are intentionally excluded from these checks.

## Rollout order

1. Deploy migrations and seed data.
2. Configure Edge Function secrets in Test Mode.
3. Configure Razorpay Edge Function secrets and deploy subscription/payment Edge Functions and updated upload authorization functions.
4. Deploy client services/providers and admin/vendor UI.
5. Enable launch offer or trials from Admin Subscription Management.
6. Schedule lifecycle/reminder functions.
