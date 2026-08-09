# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Two primary audiences, India-wide (no regional lock-in):
- **Couples/families planning a wedding** — discover, compare, and contact wedding vendors (venues, caterers, photographers, decorators, and other categories) by browsing categories, locations, portfolios, and short-form video "Clips"; save favorites; leave reviews; send enquiries.
- **Wedding vendors** (venues, caterers, photographers, decorators, etc.) — apply to list, then manage their business profile, portfolio/gallery, clips, services/packages, subscription/billing, calendar, and incoming enquiries via a dedicated vendor dashboard.
- **RoyalLagn internal staff (Admin)** — moderate vendor applications, manage categories/locations/hero content, oversee users/reviews/payments, broadcast push notifications, and run a CRM for field sales (state → district → taluka → cluster → vendor outreach).

## Product Purpose

RoyalLagn is a wedding-vendor marketplace connecting couples with vetted wedding professionals. It exists to make vendor discovery trustworthy (every listed vendor is reviewed and approved before appearing in search) and to give vendors a business-management dashboard (profile, portfolio, packages, billing, enquiries) in one place. Success = couples reliably finding and contacting the right vendors, and vendors converting that visibility into booked business.

## Positioning

A reviewed/approved-only wedding vendor marketplace (not an open directory) that pairs customer-facing discovery with a full vendor operations dashboard (packages, subscriptions, calendar, enquiries, marketing materials) and short-form video "Clips" as a discovery format — plus an internal CRM for field-sales-driven vendor acquisition, which most vendor-marketplace competitors don't run in the same product.

## Operating Context

- One Expo/React Native codebase serves three surfaces sharing a Supabase backend: public/customer app, vendor dashboard, admin dashboard.
- Vendors go through an application → review/approval flow before they're publicly listed.
- Vendor subscription/billing is live, via Razorpay (confirmed revenue model — vendors pay recurring subscription fees for listing/visibility tiers).
- Portfolio and clip media is uploaded to Cloudinary via signed Supabase Edge Functions.
- Admin runs an internal CRM for field sales: workspaces scoped to states → districts → talukas → clusters, with vendor outreach tasks and follow-ups.
- Deployed to Web (Vercel), Android (Gradle/EAS), and iOS (Xcode) from the same codebase.

## Capabilities and Constraints

- Category browsing, location-based discovery, vendor listing/search, vendor profile pages (about, gallery, portfolio, clips, reviews), favorites, ratings/reviews, enquiries, notifications inbox.
- Vendor-side: profile editing (business info, brand, contact, location, about, tags), gallery/album management, clips upload/edit, services/packages, subscription/billing, calendar, enquiries management, shareable marketing card/center, application status tracking.
- Admin-side: vendor moderation, content management (categories/locations/hero banners/clips), user and review moderation, payments/subscriptions oversight, push notification composer, reports/analytics, CRM, and clip performance analytics (views/watch-time trends by day or month, filterable by vendor/clip/category/city/area, with period-over-period comparison) surfaced on the admin dashboard.
- Tech stack: Expo SDK 54, React Native 0.81, React 19, Expo Router v6, NativeWind v4 (Tailwind) for styling, Supabase (Postgres/Auth/Realtime/Edge Functions), Cloudinary for media, Razorpay for vendor payments.
- `--legacy-peer-deps` required for installs; `jsxImportSource: 'nativewind'` in babel config (not the older nativewind/babel plugin); no `blockList` in metro.config for nested node_modules.
- No formal test framework (Jest/Vitest) — ad-hoc Node smoke scripts (`npm run test:smoke`, `lint`) are the verification surface.
- Three parallel auth contexts (public/vendor/admin) with distinct login/OTP/session flows — not to be conflated.

## Brand Commitments

- Name: **RoyalLagn**. Existing logo assets at `assets/Logo/` (light-logo, center-logo) and app icons (`assets/images/app-icon.png`, `adaptive-icon.png`, `favicon.png`).
- Existing brand fonts already integrated: Inter and Playfair Display (`@expo-google-fonts/inter`, `@expo-google-fonts/playfair-display`).
- Splash screen background color `#FAD1CE` is already committed in `app.json`.
- Light/dark theming already exists (`components/ThemeProvider.tsx`, `theme.ts`, `ThemeToggle.tsx`) as an incumbent system — not a new decision.

## Evidence on Hand

- Existing product copy in `app/About.tsx`: "RoyalLagn helps couples discover trusted wedding professionals across categories including venues, photography, catering, decor and styling. Every vendor listed is reviewed and approved before appearing in search."
- `PRD.md` at the project root is a maintained, code-derived product requirements document — treat as current and authoritative for feature/domain detail; this file summarizes durable product truth from it, not a replacement.
- No testimonials, case studies, press, or performance benchmarks on hand — future work must not fabricate these.

## Product Principles

1. Trust through vetting — every vendor-facing surface should reinforce that listed vendors are reviewed/approved, not an open directory.
2. Two-sided utility — customer discovery and vendor business operations are equally first-class product surfaces, not one built on top of the other as an afterthought.
3. One codebase, one design language — web/iOS/Android share the same NativeWind-driven UI; no platform-specific visual fork without a deliberate future decision.
4. Media-forward discovery — portfolios and short-form Clips are core discovery mechanisms, not decoration.
5. Operational depth for vendors — the vendor dashboard is a real business tool (billing, calendar, packages, CRM-driven outreach), not a thin profile editor.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond platform defaults; light/dark theming already exists as incumbent behavior.
