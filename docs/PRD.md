# RoyalLagn Product Requirements Document

| Field | Value |
|---|---|
| Status | Current source of truth |
| Product | RoyalLagn wedding-vendor marketplace |
| Version | 2.0 |
| Last verified | 2026-08-08 |
| Platforms | Web, Android, iOS |

This document defines product intent, scope, users, outcomes, and product-level requirements. Detailed testable requirements are in [SRS.md](SRS.md), the implementation model is in [ARCHITECTURE.md](ARCHITECTURE.md), interface rules are in [DESIGN.md](DESIGN.md), and contributor conventions are in [AGENTS.md](AGENTS.md).

## 1. Product vision

RoyalLagn helps couples and families discover trustworthy wedding professionals, helps vendors present and grow their businesses, and gives RoyalLagn staff the tools to operate a reviewed marketplace. The experience should feel premium, calm, visual, and dependable without hiding essential information behind decorative UI.

## 2. Problem statement

Wedding planning is fragmented across social media, referrals, directories, and direct messaging. Customers struggle to compare credible vendors and understand their work. Vendors need a credible public presence, qualified enquiries, and practical tools to maintain their listing. Marketplace operators need moderation, content, revenue, communication, and field-sales workflows in one controlled system.

## 3. Goals

- Make local vendor discovery fast through categories, locations, search, ratings, media, and useful filters.
- Build customer confidence through reviewed listings, complete profiles, portfolios, packages, reviews, and visible trust signals.
- Give vendors one workspace for profile content, media, services, packages, enquiries, availability, subscriptions, and marketing assets.
- Give administrators safe, auditable tools for marketplace operations, content moderation, payments, notifications, reporting, and CRM activity.
- Deliver a consistent responsive product from a shared Expo codebase across mobile, tablet, and web.
- Keep business data live across public, vendor, and admin surfaces without requiring manual duplication.

## 4. Non-goals

- RoyalLagn is not a wedding-planning ERP, escrow service, or contract-signing platform.
- The current product does not guarantee vendor availability, service quality, pricing, or transaction completion.
- The app must not invent customer counts, ratings, awards, testimonials, or performance claims.
- Native and web experiences may adapt their navigation and density; pixel-identical rendering is not a goal.
- Archived planning documents are not a backlog and must not be treated as current requirements.

## 5. Users and roles

### 5.1 Public customer

A couple, family member, or planner exploring vendors. Browsing should work with minimal friction; authenticated actions such as saving, reviewing, enquiring, and managing a profile use the public account flow.

### 5.2 Vendor

A wedding-service provider who applies to the marketplace and manages an approved or pending business workspace. Vendor identity and authorization remain separate from public-customer state.

### 5.3 Administrator

Authorized RoyalLagn staff who moderate vendors and content, manage marketplace configuration, oversee revenue and communication, and operate internal CRM workspaces.

## 6. Product principles

1. **Trust before volume.** Reviewed, understandable profiles are more valuable than inflated listing counts.
2. **Visual evidence with usable context.** Media supports discovery, while location, category, services, packages, ratings, and contact actions make it actionable.
3. **Clear role boundaries.** Public, vendor, and admin sessions and permissions must never be conflated.
4. **One source of business truth.** Vendor edits should propagate to public and administrative views through shared records and explicit refresh or realtime mechanisms.
5. **Premium through restraint.** Use whitespace, alignment, typography, grouping, and consistent components before adding decoration or increasing text size.
6. **Safe progression.** Destructive or privileged actions require clear intent, validation, authorization, and useful feedback.
7. **Responsive by design.** Small phones are the minimum constraint; larger phones, tablets, and web should gain space without losing hierarchy.

## 7. Product surfaces and journeys

### 7.1 Public marketplace

The public experience includes Home, Categories, Search, Vendor Listings, Vendor Profiles, Clips, Favorites, Enquiries, Notifications, account/profile screens, and the Become a Vendor flow.

Primary journey:

1. A customer selects or detects a supported location.
2. The customer browses a category, search result, featured section, or Clip.
3. The customer compares vendor cards using relevant summary information.
4. The customer opens a vendor profile to inspect work, services, packages, availability, reviews, and business information.
5. The customer saves, shares, contacts, reviews, or submits an enquiry subject to authentication and validation rules.

Product requirements:

- Discovery must support category, location, query, and available marketplace filters without presenting stale filters as active.
- Public vendor cards must preserve a clear media-to-information hierarchy and handle missing images, long names, and narrow screens.
- Vendor profiles must provide a stable canonical route and expose only public, approved data.
- Favorites and saved Clips must survive ordinary navigation and session restoration where the signed-in account permits it.
- Reviews must show aggregate and individual feedback consistently and prevent unauthorized submission or moderation.
- Enquiry and contact actions must provide success, failure, and authentication states instead of silent no-ops.
- The application flow must capture required vendor information and expose meaningful pending, approved, rejected, or resubmission status.

### 7.2 Vendor workspace

The vendor experience includes authentication, application status, dashboard, profile editing, public-profile preview, gallery and portfolio albums, Clips, services, packages, enquiries, calendar, subscription and payment history, notifications, settings, help, and marketing tools.

Primary journey:

1. A vendor applies or signs in through the vendor flow.
2. RoyalLagn verifies the account and associates it with the correct vendor workspace.
3. The vendor completes business, brand, contact, location, content, service, package, and media information.
4. The vendor previews the public representation and manages incoming enquiries.
5. The vendor accesses features allowed by the active subscription and manages renewal or payment history.

Product requirements:

- Vendor edits must be scoped to the verified vendor identity and must not expose privileged fields to client manipulation.
- Business profile edits must update every relevant public card and profile view after successful persistence and refresh/realtime propagation.
- Logo and profile-image editing must use a fixed 1:1 preview and 1024 × 1024 output. Users control positioning, zoom, rotation, and reset; source proportions must not be stretched or automatically cropped to fill.
- Portfolio, gallery, and Clip uploads must communicate progress, validation failures, retryable errors, and final publication state.
- Package and service management must validate required values before persistence.
- Subscription-gated features must explain access requirements and use server-verified payment state.
- Marketing assets must use real profile data and must not fabricate performance claims.

### 7.3 Admin workspace

The admin experience includes authentication, operational dashboard, vendor application and listing moderation, categories, locations, hero content, Clips, users, reviews, enquiries, push notifications, payments, subscriptions, reports, settings, and the internal CRM.

Primary journey:

1. An authorized staff member signs in and is verified against the admin role.
2. The dashboard surfaces current operational work and safe navigation to the corresponding tools.
3. Staff review and change vendor, content, user, revenue, or communication state with confirmation and feedback.
4. Field teams use territory and marketing workspaces to record vendor acquisition activity, follow-ups, tasks, notes, and progress.

Product requirements:

- Every admin route and mutation must enforce admin authorization independently of visual route guards.
- Vendor approval, rejection, resubmission, and listing state must remain synchronized with the vendor and public surfaces.
- Category, location, and hero management must preserve valid public configuration and defined limits.
- Push messages must support audience selection, validation, delivery status, and history where implemented.
- Revenue and subscription screens must derive values from persisted payment/subscription records, never mock totals.
- CRM records must remain scoped to their territory/workspace and preserve activity history needed for field operations.

## 8. Shared capability requirements

### 8.1 Identity and authorization

RoyalLagn uses Supabase Auth with separate public, vendor, and admin verification paths. Sessions persist using platform-appropriate storage. UI guards improve navigation, but database Row Level Security and server-side checks are the security boundary.

### 8.2 Marketplace data

Supabase Postgres is the system of record. Categories, supported locations, vendor profiles, reviews, enquiries, subscriptions, Clips, notifications, and CRM data must be read and mutated through established services, RPCs, and Edge Functions.

### 8.3 Media

Bunny.net Storage/CDN stores images and documents, while Bunny Stream stores and adaptively delivers video. Sensitive signing and deletion operations execute through Supabase Edge Functions. Upload UI must preserve aspect ratio, reject unsupported data, and recover cleanly from network or processing failure.

### 8.4 Payments

Razorpay supports vendor subscription checkout. The client may initiate checkout, but payment verification, webhook processing, entitlements, renewal state, and lifecycle changes are server-controlled.

### 8.5 Notifications

Expo notifications and persisted inbox records provide device and in-app communication. Token registration is best-effort, audience selection is privileged, and notification failure must not corrupt the primary business action.

### 8.6 Location model

Discovery and CRM use managed geographic data. Public and vendor forms should select supported records rather than create inconsistent free-text location hierarchies where managed data is required.

The public discovery hierarchy is India → State → District → Taluka/Sub-District → PIN/locality → Vendor. The legacy City/Area records remain available for compatibility while canonical State/District/Taluka references become the main discovery layer. A customer-selected District/Taluka represents the wedding or service location, not the customer’s permanent GPS location.

Within a category, vendors in the selected Taluka appear first and must be exhausted before vendors from automatically calculated nearby Talukas continue in proximity order. Nearby vendors are alternatives and do not need a service-area mapping to the selected Taluka. PIN-derived canonical location references require a trusted, unambiguous mapping; unknown, ambiguous, or unofficial-only matches remain reviewable instead of being silently assigned.

## 9. Experience and design requirements

- [DESIGN.md](DESIGN.md) is the source of truth for color, typography, spacing, elevation, shape, and component treatment.
- Root page backgrounds remain neutral/white in the light theme; pink tint is reserved for cards, chips, highlights, and intentional surfaces.
- Inter is used for functional UI. Playfair Display is reserved for intentional editorial emphasis.
- Text hierarchy should first use spacing, weight, color, and grouping; text must not be enlarged merely to create hierarchy.
- Interactive targets, contrast, labels, focus behavior, screen-reader semantics, loading states, and error states must be considered on every platform.
- Layouts must be validated on small phones, larger phones, tablets, and web, including truncation, wrapping, safe areas, keyboard behavior, and navigation overlap.
- Existing flows and functionality take precedence during visual refinement.

## 10. Quality attributes

- **Security:** least privilege, RLS, no client-exposed service secrets, validated privileged operations.
- **Reliability:** recoverable loading/error/empty states, idempotent server operations where retries are possible, and no data loss from navigation.
- **Performance:** responsive interactions, bounded media processing, paginated or cursor-based feeds where appropriate, and no long synchronous click handlers.
- **Accessibility:** readable typography, non-color-only status, keyboard/focus support on web, and platform semantics for controls.
- **Maintainability:** shared tokens/components, domain services, append-only migrations, typed interfaces, and smoke coverage for critical workflows.

## 11. Success measures

The product should instrument and review these measures without inventing public claims:

- Search/listing-to-profile conversion.
- Profile-to-contact or enquiry conversion.
- Favorite, saved Clip, and return-user activity.
- Vendor application completion and approval turnaround.
- Vendor profile completeness and successful media publication.
- Enquiry response activity.
- Subscription checkout success, renewal, expiry, and failed-payment rates.
- Admin moderation backlog and CRM follow-up completion.
- Crash-free sessions, upload failure rate, route-load latency, and notification delivery outcomes.

Numeric targets remain business decisions and must be documented when approved.

## 12. Release and deployment scope

- Web is exported from Expo and deployed using the Vercel configuration.
- Android and iOS builds use Expo/EAS or generated native workspaces.
- Database changes are append-only Supabase migrations.
- Edge Function and secret deployment is separate from client deployment.
- Generated native folders are not the primary source of truth unless a native customization is explicitly adopted and documented.

## 13. Risks and open decisions

- Automated CI gates and a formal unit/UI test runner are not currently configured.
- Several large route components increase regression risk and should be decomposed only when behavior can be preserved.
- Operational targets for availability, latency, retention, privacy deletion, and recovery need business approval.
- Legal text, consent, data retention, and regional compliance require owner/legal validation before production commitments are claimed.
- Analytics definitions and event ownership need a formal measurement plan.
- CRM business rules are implemented extensively but require ongoing owner validation as field processes evolve.

## 14. Change control

Product-scope changes update this PRD first, then the corresponding requirement IDs in [SRS.md](SRS.md). Architectural changes update [ARCHITECTURE.md](ARCHITECTURE.md). Visual-system changes update [DESIGN.md](DESIGN.md). Do not create competing product, requirements, architecture, or design documents.
