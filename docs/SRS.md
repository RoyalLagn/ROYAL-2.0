# RoyalLagn Software Requirements Specification

| Field | Value |
|---|---|
| Status | Current system requirements |
| Version | 1.0 |
| Last verified | 2026-08-08 |
| Product scope | Public, Vendor, and Admin surfaces |

This SRS converts the product scope in [PRD.md](PRD.md) into stable, testable requirements. [ARCHITECTURE.md](ARCHITECTURE.md) describes how the system satisfies them. [DESIGN.md](DESIGN.md) governs UI implementation.

## 1. Requirement language

- **MUST** means required for correct or safe operation.
- **SHOULD** means expected unless a documented constraint justifies an exception.
- **MAY** means optional behavior.
- **Required** is release-critical; **Recommended** is an important quality improvement.

Requirement IDs are stable. Do not renumber existing IDs when adding requirements.

## 2. System scope

RoyalLagn is a shared Expo/React Native application backed by Supabase. It exposes three logically isolated surfaces:

- a public wedding-vendor marketplace;
- a vendor business-management workspace; and
- an administrative operations and CRM workspace.

The supported clients are modern web browsers, Android, and iOS. The interface adapts between phone, tablet, and desktop layouts while preserving equivalent business outcomes.

## 3. Actors

| Actor | Description | Trust level |
|---|---|---|
| Guest | Unauthenticated marketplace visitor | Public |
| Public user | Authenticated customer account | Standard |
| Vendor applicant | User with an application not yet fully associated/approved | Restricted |
| Vendor user | Authenticated user linked to a vendor workspace | Business-scoped |
| Admin | Verified RoyalLagn operator | Privileged |
| Field/marketing user | Admin-authorized CRM workspace participant | Privileged and workspace-scoped |
| External provider | Supabase, Cloudinary, Razorpay, Expo notification service | Contracted system boundary |

## 4. Functional requirements

### 4.1 Authentication, identity, and sessions

| ID | Priority | Requirement |
|---|---|---|
| AUTH-001 | Required | The system MUST use Supabase Auth as the primary session provider. |
| AUTH-002 | Required | Public, vendor, and admin authorization MUST be verified through their respective role-specific services and contexts. A session valid for one role MUST NOT imply access to another. |
| AUTH-003 | Required | Native sessions MUST use protected platform storage; web sessions MUST use browser storage supported by the Supabase client. |
| AUTH-004 | Required | Sessions MUST refresh while the app is active and stop unnecessary native refresh work while backgrounded. |
| AUTH-005 | Required | Recovery/password-reset sessions MUST NOT be treated as ordinary authenticated application sessions until recovery completes. |
| AUTH-006 | Required | Protected vendor and admin routes MUST redirect or deny users who fail role verification. Database policies MUST independently enforce the same boundary. |
| AUTH-007 | Required | Sign-out MUST clear local role state. Push-token removal MAY be best-effort and MUST NOT prevent logout. |
| AUTH-008 | Required | Authentication forms MUST validate required identity and credential fields and present actionable failure states. |
| AUTH-009 | Recommended | Transient network failures during background session verification SHOULD preserve the last verified identity until a genuine authorization failure is established. |

### 4.2 Public discovery and navigation

| ID | Priority | Requirement |
|---|---|---|
| PUB-001 | Required | Guests and public users MUST be able to browse the Home, Categories, Vendor Listings, Vendor Profile, and public Clips experiences. |
| PUB-002 | Required | Home MUST present marketplace-controlled hero content, category discovery, search entry points, and vendor sections supported by current data. |
| PUB-003 | Required | Category and listing navigation MUST carry the selected category/location/query into the destination without silently changing user intent. |
| PUB-004 | Required | Listing results MUST support available category, location, search, sort, rating, and other implemented filters and MUST clearly represent empty, loading, and failure states. |
| PUB-005 | Required | Vendor cards MUST identify the vendor, category/service context, location, rating state, verification state where applicable, and a clear route to the profile. |
| PUB-006 | Required | Cards MUST handle missing media with a deliberate fallback and MUST NOT stretch source images. |
| PUB-007 | Required | Long vendor names and metadata MUST wrap or truncate without covering badges, actions, or adjacent cards on supported viewports. |
| PUB-008 | Required | The dynamic vendor URL MUST resolve by the supported slug/profile identifier and render only public-visible vendor data. |
| PUB-009 | Recommended | Search and list pages SHOULD preserve useful user state when navigating to a profile and back. |

### 4.3 Public vendor profile and engagement

| ID | Priority | Requirement |
|---|---|---|
| PROFILE-001 | Required | A vendor profile MUST support the implemented business summary, media, about content, services, packages, portfolio/albums, Clips, availability, reviews, business information, and contact actions when data exists. |
| PROFILE-002 | Required | Missing optional profile sections MUST be omitted or shown as intentional empty states, not broken placeholders. |
| PROFILE-003 | Required | Public profile and summary-card images MUST display in a stable 1:1 frame where designated for logo/profile media and preserve proportions. |
| PROFILE-004 | Required | Favorite, share, contact, directions, package-enquiry, and review actions MUST give immediate feedback and route through the established authentication gateway when authentication is required. |
| PROFILE-005 | Required | Contact details classified as private by database policy MUST NOT be exposed through public queries. |
| PROFILE-006 | Required | Profile updates successfully saved by a vendor MUST become visible to relevant public views through refresh, invalidation, or realtime propagation. |
| PROFILE-007 | Recommended | Media viewers SHOULD support platform-appropriate full-screen inspection without losing the user’s profile position. |

### 4.4 Favorites, reviews, enquiries, and notifications

| ID | Priority | Requirement |
|---|---|---|
| ENG-001 | Required | Authenticated public users MUST be able to add and remove supported vendors from Favorites. |
| ENG-002 | Required | The saved state shown on cards and profile views MUST remain consistent within the active session and after persistence refresh. |
| ENG-003 | Required | Eligible users MUST be able to submit ratings/reviews subject to service and database validation. |
| ENG-004 | Required | Review aggregates and distributions MUST be derived from stored review data and updated after accepted changes. |
| ENG-005 | Required | Review media uploads MUST use approved media-signing/deletion paths and enforce supported formats and limits. |
| ENG-006 | Required | A customer MUST be able to create an enquiry from supported profile/package/contact entry points using validated fields. |
| ENG-007 | Required | Vendors MUST be able to view and update enquiries associated with their own workspace; admins MAY access the operational overview authorized by policy. |
| ENG-008 | Required | Enquiry status and private contact fields MUST be protected by role-aware database policies. |
| ENG-009 | Required | Authenticated users MUST be able to view persisted inbox notifications and update supported read state. |
| ENG-010 | Recommended | Realtime updates SHOULD refresh enquiry and notification views without requiring a full app restart. |

### 4.5 Become a Vendor and application lifecycle

| ID | Priority | Requirement |
|---|---|---|
| APP-001 | Required | A public user MUST be able to submit a vendor application with the required business, category, location, and contact data. |
| APP-002 | Required | Submission MUST use the controlled application service/Edge Function and server-side validation for privileged fields. |
| APP-003 | Required | Duplicate or conflicting identities MUST be handled without creating an unauthorized second workspace. |
| APP-004 | Required | Applicants MUST be able to understand pending, approved, rejected, and resubmission states supported by the workflow. |
| APP-005 | Required | Admin approval MUST synchronize application, vendor workspace, and public-listing state atomically or through a recoverable workflow. |
| APP-006 | Required | Vendor workspace claiming MUST verify the authenticated identity and MUST NOT accept client-selected privileged ownership. |

### 4.6 Vendor profile and media management

| ID | Priority | Requirement |
|---|---|---|
| VEN-001 | Required | A verified vendor MUST be able to edit business information, brand information, contact details, location, about content, and tags through the established profile services. |
| VEN-002 | Required | Each save path MUST validate input, persist only authorized fields, report success/failure, and refresh the vendor’s working state. |
| VEN-003 | Required | Logo and profile-photo selection MUST open a fixed 1:1 editor before upload wherever these media types are edited. |
| VEN-004 | Required | The editor MUST begin with the complete source image visible when possible, preserve source proportions, and MUST NOT automatically stretch or center-crop it to fill the frame. |
| VEN-005 | Required | Users MUST be able to drag/reposition, pinch or use controls to zoom, rotate in 90-degree increments, reset/recenter, cancel, and preview the exact saved square. |
| VEN-006 | Required | The saved logo/profile output MUST be a 1024 × 1024 PNG-compatible image asset, retaining intentional whitespace when the user chooses to fit the full image. |
| VEN-007 | Required | Media processing MUST yield control before expensive web work, avoid long synchronous click handlers, and present a recoverable error if decoding or encoding fails. |
| VEN-008 | Required | Vendors MUST be able to create and manage portfolio albums and gallery items within authorized storage paths and subscription limits. |
| VEN-009 | Required | Media deletion MUST use the established signed/privileged deletion operation and keep database references consistent with remote assets. |
| VEN-010 | Recommended | Upload workflows SHOULD expose progress, retry state, cancellation where safe, and clear publication status. |

### 4.7 Vendor services, packages, calendar, and marketing

| ID | Priority | Requirement |
|---|---|---|
| BIZ-001 | Required | Vendors MUST be able to manage the services and packages allowed by their workspace and active feature entitlements. |
| BIZ-002 | Required | Package titles, pricing representation, included items, descriptions, and other required fields MUST pass domain validation before persistence. |
| BIZ-003 | Required | Public package enquiries MUST reference an existing public vendor/package and preserve the package context. |
| BIZ-004 | Required | Vendors MUST be able to maintain supported availability/calendar data for their own workspace. |
| BIZ-005 | Required | Vendor marketing cards and share actions MUST use current stored business/profile data and MUST NOT generate invented ratings, testimonials, or metrics. |
| BIZ-006 | Recommended | Profile-health and marketing guidance SHOULD be transparent about how recommendations are calculated. |

### 4.8 Clips

| ID | Priority | Requirement |
|---|---|---|
| CLIP-001 | Required | Public users MUST be able to browse the supported Clip feed and open vendor context from a Clip. |
| CLIP-002 | Required | Vendors MUST be able to select, validate, upload, edit, list, and delete Clips within authorized limits. |
| CLIP-003 | Required | Clip upload MUST use atomic reservation/commit behavior where provided so retries do not create duplicate quota use or orphaned records. |
| CLIP-004 | Required | Video and thumbnail operations MUST use the established Cloudinary services and signed Edge Functions. |
| CLIP-005 | Required | Upload queues and drafts MUST expose recoverable state across ordinary navigation or retry scenarios supported by the platform. |
| CLIP-006 | Required | Public engagement, saved state, analytics, and watch history MUST use the dedicated Clips domain services. |
| CLIP-007 | Recommended | Feed retrieval SHOULD remain cursor-based or otherwise bounded as content volume grows. |

### 4.9 Subscriptions and payments

| ID | Priority | Requirement |
|---|---|---|
| SUB-001 | Required | The system MUST expose persisted subscription plans and feature entitlements to eligible vendor users. |
| SUB-002 | Required | Feature gates MUST use current server-backed entitlement state and MUST NOT rely only on hidden UI. |
| SUB-003 | Required | Razorpay order creation MUST occur through a privileged Edge Function using server-controlled plan and amount data. |
| SUB-004 | Required | Payment success MUST be verified server-side before subscription activation. |
| SUB-005 | Required | Webhook handling MUST validate authenticity and safely tolerate retries/duplicate delivery. |
| SUB-006 | Required | Renewal, grace, expiry, and lifecycle processing MUST be driven by persisted subscription state. |
| SUB-007 | Required | Vendors MUST be able to view the supported subscription and payment-history information for their workspace. |
| SUB-008 | Required | Admin revenue views MUST use persisted payment/subscription data and documented equity calculations. |

### 4.10 Admin operations

| ID | Priority | Requirement |
|---|---|---|
| ADM-001 | Required | Only verified admins MUST access admin routes, services, RPCs, and mutations. |
| ADM-002 | Required | The dashboard MUST represent current persisted operational data and MUST distinguish loading, empty, stale, and failure states. |
| ADM-003 | Required | Admins MUST be able to inspect and perform supported vendor moderation actions with confirmation and result feedback. |
| ADM-004 | Required | Admins MUST be able to manage supported categories, locations, hero slides, users, reviews, and Clips within server-enforced rules. |
| ADM-005 | Required | Hero management MUST enforce the configured maximum active slide count and support platform-specific media fields where implemented. |
| ADM-006 | Required | Admin push composition MUST validate message content and audience and invoke only the privileged send operation. |
| ADM-007 | Required | Admins MUST be able to inspect supported enquiries, subscriptions, payments, reports, and operational settings. |
| ADM-008 | Required | Destructive or high-impact admin actions MUST identify the target, require clear intent, and return an auditable result where the domain supports activity history. |

### 4.11 CRM and field workspaces

| ID | Priority | Requirement |
|---|---|---|
| CRM-001 | Required | Authorized staff MUST be able to manage territory data across supported state, district, taluka, cluster, category, and vendor relationships. |
| CRM-002 | Required | Admins MUST be able to create and manage field and marketing workspaces using valid territory/category scope. |
| CRM-003 | Required | Workspace participants MUST see only records allowed by their session and workspace assignment. |
| CRM-004 | Required | CRM vendor records MUST support the implemented status, activity, task, follow-up, note, document, and campaign operations. |
| CRM-005 | Required | Progress and status mutations MUST be persisted safely and reflected in workspace reporting. |
| CRM-006 | Required | Share/session links MUST use the dedicated workspace-session services and MUST not grant broader admin authority. |
| CRM-007 | Recommended | CRM aggregates SHOULD be derived from the same scoped records shown in workspace detail views. |

### 4.12 Managed content, location, and configuration

| ID | Priority | Requirement |
|---|---|---|
| CFG-001 | Required | Category reads and writes MUST use the category service/context and preserve public visibility and ordering rules. |
| CFG-002 | Required | Supported location selection and vendor service areas MUST use the dedicated location domain and authorized location records. |
| CFG-003 | Required | Pincode lookup MAY assist user entry but MUST NOT silently overwrite an explicit supported-location selection. |
| CFG-004 | Required | Marketplace configuration changes MUST not require hard-coded screen edits when a managed data source already exists. |
| CFG-005 | Required | Public discovery MUST expose active State → District → Taluka records through dependent, bounded selection; it MUST NOT load every Taluka for an entire State when only one District is being chosen. |
| CFG-006 | Required | A trusted, unambiguous PIN mapping MUST populate canonical vendor State/District/Taluka references atomically with the vendor location save. Unknown, ambiguous, or unofficial-only mappings MUST clear stale canonical references and enter an unresolved/review state. |
| CFG-007 | Required | Taluka discovery MUST return every matching selected-Taluka vendor before any nearby-Taluka vendor. Nearby alternatives MUST follow generated proximity order and MUST NOT require a vendor service-area mapping to the selected Taluka. |
| CFG-008 | Required | Pagination across Taluka boundaries MUST be bounded and stable, without duplicate, skipped, or prematurely inserted nearby vendors; category, location, search, rating, price, and sort changes MUST reset pagination. |
| CFG-009 | Required | The canonical State/District/Taluka hierarchy MUST coexist with the legacy City/Area tables and references until an explicit migration removes that compatibility layer. |
| CFG-010 | Required | Public roles MAY read the active hierarchy and generated neighbor data needed for discovery but MUST NOT modify hierarchy, PIN, neighbor, or another vendor’s location records. |
| CFG-011 | Required | Nearby-Taluka relationships MUST be generated from recorded geography with deterministic ordering, not hand-authored production name pairs; the cache interface MUST allow a later polygon-adjacency source without changing listing consumers. |

## 5. External interface requirements

| Interface | Required behavior |
|---|---|
| Supabase Auth | Email/credential and recovery flows use the configured project and role verification services. |
| Supabase Postgres | System of record; access controlled through RLS, grants, RPCs, and append-only migrations. |
| Supabase Realtime | Subscriptions update selected profiles, listings, enquiries, notifications, and domain state; clients remove channels on cleanup. |
| Supabase Edge Functions | Privileged media, payment, application, lookup, lifecycle, and notification operations execute server-side. |
| Cloudinary | Stores supported images/videos; credentials and destructive operations are never exposed as public client configuration. |
| Razorpay | Native/client checkout is paired with server-created orders, signature verification, and webhook processing. |
| Expo Notifications | Registers supported devices and delivers admin-created messages; inbox persistence remains the durable app representation where implemented. |
| Vercel | Hosts the exported web SPA with route rewriting to the application entry point. |
| EAS/native toolchains | Produce Android/iOS development, preview, and production builds from Expo configuration. |

## 6. Data requirements

### 6.1 System-of-record domains

The database must represent, at minimum where implemented: identities/profiles, vendor applications and workspaces, vendor public profiles, categories, locations, services, packages, availability, portfolios/albums/media, Clips and engagement, favorites, reviews, enquiries, subscriptions, payments, notification inbox and push delivery, hero content, admin configuration, and CRM territories/workspaces/activity.

### 6.2 Integrity rules

- Foreign-key relationships and server validation MUST prevent orphaned business records where the schema provides a parent relationship.
- Public queries MUST exclude private or unapproved fields and records.
- Vendor mutations MUST be limited to the authenticated vendor workspace.
- Admin-only mutations MUST verify active admin authority.
- Subscription and quota operations SHOULD be atomic when concurrency can cause overuse.
- Timestamps, status transitions, and activity records MUST be server-derived where client manipulation would create a trust issue.
- Media deletion MUST coordinate remote assets and persisted references.

### 6.3 Schema evolution

All database changes MUST be added as new timestamped files in `supabase/migrations/`. Applied migrations MUST NOT be edited in place. Database types and affected services/tests SHOULD be updated in the same change.

## 7. Non-functional requirements

### 7.1 Security and privacy

| ID | Requirement |
|---|---|
| NFR-SEC-001 | Client configuration MAY contain the Supabase URL and anonymous key, but MUST NOT contain service-role, Cloudinary secret, Razorpay secret, or other privileged credentials. |
| NFR-SEC-002 | RLS and server authorization MUST remain the final access boundary even when the client hides or guards a route. |
| NFR-SEC-003 | Inputs crossing a trust boundary MUST be validated server-side. |
| NFR-SEC-004 | Logs and user-visible errors MUST NOT disclose credentials, access tokens, or unnecessary private contact data. |
| NFR-SEC-005 | Legal, consent, retention, export, and deletion commitments MUST not be claimed until approved and implemented. |

### 7.2 Performance and responsiveness

| ID | Requirement |
|---|---|
| NFR-PERF-001 | Press/click handlers SHOULD return control promptly; CPU-intensive image/video work MUST be asynchronous or delegated to supported platform APIs. |
| NFR-PERF-002 | Lists and feeds SHOULD use bounded retrieval, pagination, cursoring, or virtualization appropriate to expected volume. |
| NFR-PERF-003 | Media MUST use appropriate thumbnails, dimensions, compression, and lazy loading rather than transferring full originals for every card. |
| NFR-PERF-004 | Layout MUST remain usable on small phones, larger phones, tablets, and desktop web without horizontal page overflow. |
| NFR-PERF-005 | Loading feedback SHOULD appear for network or processing operations that are not effectively immediate. |

### 7.3 Reliability

| ID | Requirement |
|---|---|
| NFR-REL-001 | Every remote-data section MUST define loading, success, empty, and failure behavior. |
| NFR-REL-002 | Retryable operations MUST avoid duplicate records, payments, quota consumption, or destructive side effects. |
| NFR-REL-003 | Realtime channels, listeners, timers, and upload resources MUST be released when their owner unmounts. |
| NFR-REL-004 | A secondary failure such as push-token cleanup MUST NOT corrupt the completed primary action. |

### 7.4 Accessibility and usability

| ID | Requirement |
|---|---|
| NFR-A11Y-001 | Functional UI MUST use Inter; Playfair Display is limited to intentional editorial headings as defined in DESIGN.md. |
| NFR-A11Y-002 | Hierarchy SHOULD use spacing, weight, color, and grouping before larger font sizes. Text MUST remain readable under narrow-width wrapping and supported text scaling. |
| NFR-A11Y-003 | Controls MUST have meaningful accessible names, adequate target size, visible state, and keyboard/focus behavior on web. |
| NFR-A11Y-004 | Status MUST NOT be communicated by color alone. Contrast MUST remain sufficient in every supported theme. |
| NFR-A11Y-005 | Motion SHOULD respect reduced-motion preferences and MUST not block task completion. |

### 7.5 Compatibility and maintainability

| ID | Requirement |
|---|---|
| NFR-MNT-001 | The codebase MUST remain compatible with the versions pinned in `package.json`, including Node 22.6 or newer for smoke scripts. |
| NFR-MNT-002 | NativeWind v4 and the configured Expo Router/Metro/Babel setup MUST be preserved unless an approved architecture change replaces it. |
| NFR-MNT-003 | New domain logic SHOULD extend existing services, contexts, hooks, and domain packages before introducing another global pattern. |
| NFR-MNT-004 | Shared typography, palette, spacing, responsive, and component primitives SHOULD replace one-off UI values. |
| NFR-MNT-005 | Critical domain changes MUST add or update the relevant smoke/regression check. |

## 8. Verification requirements

### 8.1 Standard checks

```bash
npm run lint
npm run test:smoke
```

`test:smoke` is the safe non-credentialed suite. `test:profile-e2e` requires an explicitly approved staging environment and is excluded from the default suite.

### 8.2 Acceptance matrix

| Requirement area | Minimum verification |
|---|---|
| Auth/authorization | Role-specific service tests, route checks, and RLS/migration review |
| Public discovery/profile | Small-phone and web navigation, loading/empty/error states, long-content checks |
| Profile propagation | `test:profile-smoke`; approved staging E2E only when authorized |
| Image editor | Portrait and landscape sources; fit, drag, zoom, rotate, reset; exact 1024-square output on web and native |
| Packages/enquiries | Package and contact smoke scripts plus authorized data-policy review |
| Clips | Upload reservation, retry, feed, thumbnail, and quota behavior |
| Subscriptions | Subscription domain test; server order/verification/webhook review |
| Locations | Location domain test, rollback-only SQL/RPC pagination and RLS suite, trusted PIN mapping checks, and desktop/mobile District → Taluka browser flow |
| Admin/CRM | Permission checks, target confirmation, scoped list/detail/report consistency |
| Responsive/accessibility | Small phone, large phone, tablet, desktop web; keyboard, focus, wrapping, truncation, contrast |

## 9. Constraints and known gaps

- There is no configured Jest/Vitest suite or automated CI workflow at the time of verification.
- Some critical validation remains covered by Node smoke scripts rather than component or end-to-end automation.
- Production service-level objectives, retention periods, and recovery objectives are not yet approved.
- Legal/compliance requirements require owner and legal review; this document does not certify compliance.
- Existing platform-specific shims and generated native projects constrain broad dependency or architecture changes.

## 10. Traceability

| PRD area | SRS requirement groups | Architecture section |
|---|---|---|
| Public marketplace | PUB, PROFILE, ENG | Client layers; routing; data flow |
| Vendor workspace | APP, VEN, BIZ, CLIP, SUB | Role isolation; media; domain packages |
| Admin workspace | ADM, CRM, CFG | Authorization; admin/CRM components |
| Shared capabilities | AUTH, external interfaces, data | System context; backend boundaries |
| Experience and quality | NFR-* | Cross-cutting concerns; quality gates |

## 11. Document maintenance

When behavior changes, update the affected stable IDs and verification notes in this file. Add new IDs rather than reusing retired IDs. Product intent changes belong in [PRD.md](PRD.md); structural implementation changes belong in [ARCHITECTURE.md](ARCHITECTURE.md).
