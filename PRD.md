# RoyalLagn — Product Requirements Document

_Derived from the current codebase (Expo/React Native app + Supabase backend) as of 2026-08-06. This is the single source of truth for product scope — it supersedes the older planning docs, which have been archived under [docs/archive/](docs/archive/) (`RoyalLagn.prd`, `RoyalLagn.srs`, `replit.md`; the duplicate `ShaadiVendors_PRD.md` was deleted outright). This file reflects what is actually implemented, not what was originally planned._

## 1. Product Summary

RoyalLagn is a wedding-vendor marketplace (Venues, Caterers, Photographers, Decorators, etc.) shipped as one Expo/React Native codebase targeting Web, Android, and iOS. There are three user-facing surfaces sharing the same repo and Supabase backend:

1. **Public/Customer app** — discover vendors, browse categories & locations, view vendor profiles/portfolios/clips, save favorites, contact vendors, leave reviews, receive notifications.
2. **Vendor dashboard** — vendors manage their business profile, portfolio/gallery, clips (short video content), services/packages, subscription/billing, enquiries, calendar, applications, and marketing materials.
3. **Admin dashboard** — RoyalLagn staff manage vendor applications, categories, locations, hero banners, users, reviews, push notifications, subscriptions/payments, and a CRM for field sales workspaces (states → districts → talukas → clusters → vendor outreach).

## 2. Tech Stack

- **Framework**: Expo SDK 54, React Native 0.81, React 19, Expo Router v6 (file-based routing under `app/`)
- **Styling**: NativeWind v4 (Tailwind) + `tailwind.config.js`, `global.css`
- **Backend**: Supabase (Postgres + Auth + Realtime + Edge Functions), migrations in `supabase/migrations/`
- **Media**: Cloudinary (portfolio images, clip video + thumbnails) signed via Supabase Edge Functions (`cloudinary-sign`, `cloudinary-delete`, `profile-image`)
- **Payments**: `react-native-razorpay` (vendor subscriptions)
- **State**: React Context (`context/*`) per domain — auth (public/vendor/admin), favorites, categories, locations, notifications, subscriptions, reviews, responsive layout
- **Notifications**: `expo-notifications` + Supabase `push_notifications` tables, `services/pushTokens.ts`, `services/adminPushNotifications.ts`
- **Platforms**: Web (primary preview, port 5000), Android (Gradle build via `android/`), iOS (`ios/` Xcode project) — native folders are generated via `expo prebuild`, not committed as source of truth

## 3. Core Domains & Features

### 3.1 Public / Customer
- Category browsing (`components/categories`, `context/CategoryContext.tsx`, `data/marketplaceCategories.ts`)
- Location-based discovery (`locations/`, `context/LocationContext.tsx`, `docs/location-management.md`)
- Vendor listing & search (`app/VendorsListing.tsx`, `app/Search.tsx`, `services/publicVendorListings.ts`)
- Vendor profile pages: about, gallery, portfolio, clips, reviews (`app/VendorsProfile.tsx`, `services/vendorPublicProfile.ts`, `services/vendorPortfolio.ts`)
- Short-form video "Clips" module (`clips/` — own components/hooks/services/providers, cover-thumbnail generation)
- Favorites (`context/FavoritesContext.tsx`, `app/SavedClips.tsx`, `app/(tabs)/favorites.tsx`)
- Reviews & ratings (`context/ReviewRatingsContext.tsx`, `services/reviews.ts`)
- Auth: signup/login/OTP/password reset for public users (`app/Login.tsx`, `OtpVerification.tsx`, `ForgotPassword.tsx`, `services/publicAuth.ts`, `context/PublicAuthContext.tsx`)
- Enquiries to vendors (`app/VendorEnquiries.tsx` counterpart on vendor side, `services/enquiries.ts`, `hooks/useEnquiries.ts`)
- Notifications inbox (`services/inboxNotifications.ts`, `context/NotificationContext.tsx`)
- Vendor "Become a Vendor" application flow (`app/BecomeVendor.tsx`, `services/vendorApplications.ts`)

### 3.2 Vendor Dashboard
- Vendor auth: login/OTP/forgot-password/create-password (`app/VendorLogin.tsx`, `VendorOtpVerification.tsx`, etc., `services/vendorAuth.ts`, `context/VendorSessionContext.tsx`)
- Profile editing: business info, brand, contact, location, about, tags (`app/VendorEditBusinessInfo.tsx`, `VendorEditBrand.tsx`, `VendorEditContact.tsx`, `VendorEditLocation.tsx`, `VendorEditAbout.tsx`, `VendorEditTags.tsx`, `services/vendorProfile.ts`)
- Gallery/portfolio + album management, image uploads via Cloudinary (`app/VendorGallery.tsx`, `VendorPortfolio.tsx`, `VendorAlbum.tsx`, `services/vendorPortfolio.ts`, `services/cloudinary.ts`)
- Clips: upload, edit, atomic upload reservations (`app/VendorClipUpload.tsx`, `VendorClipEdit.tsx`, `VendorClips.tsx`, `clips/services`)
- Services/packages (`app/VendorServices.tsx`, `hooks/useVendorPackages.ts`, `services/vendorPackages.ts`, `packages/validation.ts`)
- Subscription/billing (`app/VendorSubscription.tsx`, `subscriptions/`, `hooks/useSubscriptionAccess.ts`, `context/SubscriptionContext.tsx`, Razorpay integration)
- Calendar (`app/VendorCalendar.tsx`)
- Enquiries management (`app/VendorEnquiries.tsx`)
- Marketing card / center — shareable promo materials (`app/vendor-marketing-card.tsx`, `vendor-marketing-center.tsx`, `components/vendor-marketing*`, `services/marketingCardService.ts`, `services/vendorShare.ts`)
- Application status tracking (`app/VendorApplicationDetails.tsx`, `VendorApplications.tsx`, `VendorAuthStatus.tsx`)
- Notifications, settings, help, payment history, T&C/privacy (`VendorNotifications.tsx`, `VendorSettings.tsx`, `VendorHelp.tsx`, `VendorPaymentHistory.tsx`, `VendorTerms.tsx`, `VendorPrivacyPolicy.tsx`)

### 3.3 Admin Dashboard
- Admin auth (`app/AdminLogin.tsx`, `AdminOtpVerification.tsx`, `AdminForgotPassword.tsx`, `AdminCreatePassword.tsx`, `services/adminAuth.ts`, `context/AdminAuthContext.tsx`)
- Vendor moderation: applications, vendor details, listing management (`AdminVendorDetails.tsx`, `app/vendors-admin-listing.tsx`, `services/adminVendorService.ts`)
- Content management: categories, locations, hero banners, clips moderation (`AdminCategories.tsx`, `AdminLocations.tsx`, `AdminHero.tsx`, `AdminClips.tsx`, `services/heroSlides.ts`, `services/CategoryService.ts`)
- Users management, reviews moderation (`AdminUsers.tsx`, `AdminReviews.tsx`, `services/adminUsers.ts`)
- Payments & subscriptions oversight (`app/payments-admin.tsx`, `subscriptions-admin.tsx`, `services/adminRevenueService.ts`)
- Push notification composer/broadcast (`AdminPushNotifications.tsx`, `services/adminPushNotifications.ts`)
- Reports/analytics (`AdminReports.tsx`, `services/adminDashboardService.ts`)
- **CRM module** — internal field-sales tool: workspaces scoped to states/districts/talukas/clusters, vendor outreach tasks, follow-ups (`AdminCrm*.tsx`, `CrmWorkspace*.tsx`, `services/crm/`, `types/crm/`, `hooks/crm/`)
- Settings, help, enquiries oversight (`AdminSettings.tsx`, `AdminHelp.tsx`, `AdminEnquiries.tsx`)

## 4. Data Layer

- Supabase Postgres is the system of record; schema evolves via timestamped SQL files in `supabase/migrations/` (most recent: subscription free-plan seeding, atomic public registration, hero slide desktop images, push notification tables, CRM workspace tables, vendor public profile content, atomic clip upload reservations).
- `types/database.ts` holds generated/maintained DB types; domain-specific types live in `types/adminDashboard.ts`, `types/adminVendors.ts`, `types/crm/`, `types/hero.ts`, `types/pushNotifications.ts`, `types/responsive.ts`.
- Row-level security and service-role policies are managed per migration (e.g. `close_vendor_application_stub_policies`, `grant_service_role_push_tables`).
- Cloudinary asset paths follow `royallagn/vendors/{vendorId}/albums/{albumId}/`; secrets are Supabase Edge Function secrets, never `EXPO_PUBLIC_` vars (see [README.md](README.md)).

## 5. Cross-Cutting Concerns

- **Theming**: `components/ThemeProvider.tsx`, `theme.ts`, light/dark support, `ThemeToggle.tsx`
- **Responsive layout**: `context/ResponsiveLayoutContext.tsx`, `hooks/useWebNavigationFocusSafety.ts`, `utils/responsiveLayout.ts`, separate mobile tab bar vs. web navbar (`components/MobileTabBar.tsx`, `PublicWebNavbar.tsx`)
- **Web-only shims**: `+html.tsx`, `Supply the Alert implementation react-native-web omits` (commit history) — react-native-web gaps patched manually
- **Auth gateway**: `hooks/useAuthenticationGateway.ts` unifies session checks across public/vendor/admin contexts
- **Error boundaries**: `components/SectionErrorBoundary.tsx`
- **SEO/sitemap**: `scripts/generate-sitemap.mjs`, `vercel.json` (web deployment target)

## 6. Testing & Verification

Existing Node-based smoke/integration scripts (no formal test framework configured):
- `npm run test:profile-smoke` / `test:profile-e2e` — profile propagation
- `npm run test:subscriptions`, `test:packages`, `test:contacts`, `test:locations` — domain logic checks (`scripts/test-*.mjs`)
- `npm run lint` — `expo lint`

## 7. Deployment

- Web: built for Vercel (`vercel.json`)
- Android: local Gradle build via `npm run prebuild:android` + `npm run build:apk`, or EAS (`eas.json`, `.easignore`)
- iOS: standard Xcode workflow via `ios/RoyalLagn.xcworkspace`
- `android/` and `ios/` are generated by `expo prebuild`; treat as build artifacts, not hand-edited source, unless already customized

## 8. Known Constraints / Preferences

- `--legacy-peer-deps` required for npm installs (lucide-react-native vs. React 19 peer conflict)
- NativeWind v4 requires `jsxImportSource: 'nativewind'` in `babel.config.js` — do **not** use the older `nativewind/babel` plugin
- `metro.config.js`: do not add a `blockList` for nested `node_modules` — breaks `@expo/metro-runtime` resolution
- `newArchEnabled: true` in `app.json` is required by `react-native-reanimated` v4 + `react-native-worklets`

## 9. Open Items / Not Yet Covered Here

- No automated CI config detected (no `.github/workflows`) — verify before assuming CI gates exist
- No formal test runner (Jest/Vitest) — only ad-hoc `.mjs` smoke scripts
- Detailed CRM workspace business rules live only in code (`services/crm/`, `AdminCrm*.tsx`) and should be pulled into this doc if the CRM becomes a priority surface
