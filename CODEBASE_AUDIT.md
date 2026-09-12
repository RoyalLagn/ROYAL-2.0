# RoyalLagn Codebase Maintenance Audit

Audit date: 26 August 2026  
Scope: audit only; no production code, UI, routes, schema, dependencies, or behavior changed.

## 1. Overall Codebase Health

**Maintainability rating: 6.5/10.**

The application has several healthy foundations: strict TypeScript is enabled, Expo Router is used consistently, domain services exist for major areas, Supabase migrations are versioned, platform-specific files are used where necessary, and the smoke suite currently passes. The codebase is nevertheless expensive to navigate because 118 routes, 191 component files, 70 service files, 198 migrations, and 18 Edge Function directories share a mostly flat top-level organization. Several screens contain 600–1,200 lines and combine orchestration, database writes, transformation, validation, modal state, and presentation. Supabase-generated results are frequently mapped through `any`, weakening the value of strict mode at important data boundaries.

The safest strategy is incremental consolidation with behavior tests, not a broad rewrite.

### Baseline results

| Check | Result |
|---|---|
| `npm run lint` | Passes with one warning in `components/legal/LegalDocumentRenderer.tsx` (`Array<T>` style) |
| `npx tsc --noEmit` | Passes |
| `npm test` | Not available; package has no default `test` script |
| `npm run test:smoke` | Passes all 11 included checks |
| TypeScript unused-symbol probe | Four findings: unused `muted`, `ClipUpload`, `onSync`, and `availability` parameter |
| Knip/equivalent | Not installed or configured |

## 2. Current Architecture

- `app/` contains Expo Router routes for public customers, vendors, administrators, CRM, authentication, payments, and subscriptions. Most route names are PascalCase, while newer workspace routes use kebab-case.
- `components/` mixes shared UI, feature-specific components, shells, legal rendering, vendor profile UI, admin UI, and marketing-card rendering.
- `hooks/` contains cross-feature hooks and CRM hooks. `useVendorWorkspace()` is a central vendor data aggregator.
- `services/` is the main Supabase and external-service layer. It includes public/vendor/admin/CRM/location/review/Bunny media concerns.
- `clips/`, `subscriptions/`, `locations/`, `packages/`, `admin/`, and `vendor/` are partial domain modules with their own types/services/utilities.
- `context/` owns authentication, favorites, notifications, subscription state, and location state.
- `supabase/migrations/` and `supabase/functions/` contain the database history and server-side operations.
- `types/`, `constants/`, `utils/`, `config/`, and root `theme.ts` provide shared definitions, though ownership is inconsistent.
- `scripts/` supplies domain tests, smoke checks, imports, backfills, sitemap generation, and asset tooling.

The project is midway between a layer-based architecture and a feature-based architecture. Clips and subscriptions are comparatively cohesive; vendor, public marketplace, admin, and CRM code remain spread across routes, components, hooks, services, and types.

## 3. Critical Problems

1. **Large route files own data mutations and UI simultaneously.** `app/VendorGallery.tsx` performs album/media insert, update, delete, reorder, cover, upload-finalization, and recovery logic directly in a 1,043-line screen. This is the clearest regression risk.
2. **The main vendor workspace boundary is weakly typed.** `hooks/useVendorWorkspace.ts` exposes `vendor: any` and nine additional `any` collections while issuing a large parallel query bundle. Most vendor screens therefore inherit unsafe field access and implicit database-shape coupling.
3. **Public vendor profile implementations overlap.** `app/VendorsProfile.tsx` (1,227 lines) and `app/vendors/[slug].tsx` (751 lines) both represent public vendor profile experiences and use overlapping profile/clip components and services. Their route compatibility may be intentional, but behavior can drift unless shared orchestration is made explicit.
4. **Generated/browser artifacts are tracked alongside source.** `.playwright-mcp/` contains many console logs, snapshots, and a downloaded PDF in Git. These enlarge diffs and obscure meaningful repository changes.
5. **No single default test command exists.** `npm test` fails even though a useful smoke runner exists. CI and new developers can easily miss the actual validation contract.

## 4. High Priority Cleanup

- Introduce typed `VendorWorkspaceData` rows using existing database/domain types, beginning with `vendor`, media, albums, services, and subscription.
- Extract `VendorGallery` mutations into an existing or focused portfolio service; keep the screen responsible for interaction state and rendering.
- Establish one tested public-profile data/view-model layer shared by legacy ID and canonical slug routes without changing either URL.
- Stop tracking new `.playwright-mcp` outputs and document whether existing evidence should be archived or removed.
- Add a default `test` script that delegates to `test:smoke`; do not change individual test behavior.
- Enable unused-local checks in a separate CI audit step first, then fix the four confirmed findings.
- Expand ESLint ignores to cover both `dist/` and `dist-web/`; current config ignores only `dist/*`.

## 5. Medium Priority Cleanup

- Standardize route/file naming for newly touched files; preserve current URLs through thin route adapters where renaming is eventually approved.
- Move repeated Supabase row normalization into typed service mappers.
- Consolidate repeated contact/link/profile URL construction around `services/contactActions.ts`, `services/vendorShare.ts`, and `utils/externalLinks.ts` where responsibilities overlap.
- Break admin finance and vendor listing screens into query/view-model and presentation sections.
- Reduce obvious comments that narrate implementation details after behavior has tests, while retaining comments that explain platform/export/payment constraints.
- Document which root-level domain folders are intentional and which new work belongs under a feature module.

## 6. Dead Code Candidates

No candidate should be deleted in this phase.

| Path / symbol | Evidence and verification | Confidence | Safe to delete now |
|---|---|---:|---|
| Root files `APK`, `BUILD`, `Building`, `Generating`, `Installing` | Tracked 10–30 byte fragments containing setup-script output such as `== SUCCESSFUL!`; repository search found no code imports. Some words naturally occur elsewhere, so provenance should be confirmed. | High | Needs manual verification |
| `.playwright-mcp/**` | Tracked generated console logs, accessibility snapshots, screenshots/PDF evidence; not imported by application code. | High | Needs manual verification |
| Root `marketing-card-*.png` screenshots | Browser-test outputs rather than runtime assets; no application import was found. | High | Needs manual verification |
| `app/(tabs)/favorites.tsx`: local `muted` | TypeScript `--noUnusedLocals` reports it as unread. | High | Yes, after focused test |
| `clips/services/ClipBunnyNativeAdapter.ts`: imported `ClipUpload` | TypeScript unused-symbol probe confirms it is unused. | High | Yes, after typecheck |
| `components/admin/finance/FinanceRevenueDashboard.tsx`: `onSync` prop | Declared but unread. Removing it may require caller/API adjustment, so first confirm whether it is planned functionality. | High | No |
| `hooks/useVendorWorkspace.ts`: `availability` parameter in readiness calculation | Declared but unread; may signal incomplete readiness logic rather than removable API. | High | No |
| `attached_assets/Pasted-*.txt` and similar prompt artifacts | Not code-imported, but may be intentionally retained product/design history. | Medium | Needs manual verification |
| `.replit`, `rapidnative.json`, `setup.bat`, `setup.ps1` | Environment-specific tooling; not runtime-imported. They may still support current developer workflows. | Low | No |

Route files are **not** considered dead merely because no source import exists: Expo Router discovers them by filesystem convention. Platform variants and barrel exports were likewise excluded from dead-code conclusions.

## 7. Duplicate Code

- `app/VendorsProfile.tsx` and `app/vendors/[slug].tsx` duplicate public-profile orchestration and should share a profile view model while retaining both routes.
- Location mapping occurs across `services/locations.ts`, `services/geoLocations.ts`, `services/vendorDiscovery.ts`, and `locations/domain.ts`. They serve different queries, but row-to-card and canonical-location transformations should be compared and consolidated.
- Public clip view recording exists in both `clips/services/ClipAnalyticsService.ts` and `clips/services/PublicClipEngagementService.ts`, including RPC/fallback behavior. One service should own the invariant.
- Authentication contexts (`AdminAuthContext`, `VendorAuthContext`, `PublicAuthContext`) repeat session restoration and `onAuthStateChange` lifecycle patterns. Keep role policies separate, but reuse a small tested session-listener primitive if it stays readable.
- Admin/CRM service files repeat generic count/query patterns (`services/crm/vendorService.ts`, `services/crm/reportService.ts`, `services/adminDashboardService.ts`). Avoid a universal repository abstraction; share only identical typed helpers.
- Contact actions and vendor sharing split URL/path normalization among `contactActions`, `vendorShare`, `vendorPublicProfile`, and external-link utilities. Define clearer ownership before merging.
- Multiple screens reproduce responsive cards, filter chips, empty states, and action bars. Reuse existing design-system primitives where behavior and semantics truly match; do not create a generic “everything card.”

## 8. Large / Complex Files

| File | Responsibility / risk | Suggested extraction boundaries |
|---|---|---|
| `app/VendorsProfile.tsx` (~1,227) | Legacy public vendor profile, data, tabs, actions, responsive UI | Route adapter; profile loader/view model; hero/contact sections; portfolio/clips composition |
| `app/VendorGallery.tsx` (~1,043) | Portfolio CRUD, upload, reorder, cover, modals, UI | Portfolio mutation service; upload controller hook; album/media list sections; dialogs |
| `app/(tabs)/index.tsx` (~991) | Marketplace home, discovery, location ranking, sections | Home discovery hook; section components; route remains composition-only |
| `services/media.ts` | Upload preparation, native/web transport, and Bunny response mapping | Image preparation; video preparation; transport adapters; typed response mapper |
| `app/AdminHero.tsx` (~792) | Hero administration and editing | Hero service/view model; editor form; preview/list sections |
| `app/vendors/[slug].tsx` (~751) | Canonical public vendor profile | Share data/view model with legacy route; preserve canonical routing |
| `app/VendorsListing.tsx` (~659) | Filters, discovery, pagination, rendering | Listing query hook; filter model; grid/list presentation |
| `app/(tabs)/profile.tsx` (~647) | Customer profile and account actions | Account sections; auth action hook; keep route composition |
| `services/adminFinanceService.ts` (~643) | Many finance queries and transformations | Metrics, transactions, tax/partnership modules with shared types |
| `components/FrontendScreen.tsx` (~622) | Multi-mode informational screen | Retain shared shell; move mode configuration/content ownership out if branching continues growing |
| `app/BecomeVendor.tsx` (~607) | Application form plus auth/data submission | Form state/validation hook; submission service; step sections |
| `services/geoLocations.ts` (~601) | Hierarchy, mapping, discovery, admin operations | Read hierarchy, discovery mapping, admin mutation groups |
| `components/MobileTabBar.tsx` (~576) | Navigation, measurement, animations, standalone variant | Shared route config; measurement hook; renderer/standalone adapter |
| `components/vendor-marketing-card/MarketingCardPreview.tsx` (~571) | Fixed print renderer and many primitives | Keep one renderer; move pure decorations/cell primitives only if export parity tests cover them |

Large SQL migrations and Edge Functions are not automatically problems. `lookup-india-pincode` (~1,065 lines) deserves its own review because lookup, normalization, fallback, and response handling are concentrated in one server function.

## 9. Folder Structure Problems

- Domain modules are inconsistent: `clips/` and `subscriptions/` are cohesive, while vendor/admin/CRM logic is split across root routes, `components/`, `hooks/`, `services/`, `types/`, and small root domain folders.
- `admin/navigation.ts` and `admin/navigationRoutes.ts` have close names but different consumers; clarify names such as menu configuration versus route guards.
- Root `theme.ts` overlaps conceptually with `components/ThemeProvider.tsx`, `components/vendor/VendorTheme.ts`, and admin palettes. Keep separate palettes if required, but place shared tokens under one documented theme boundary.
- `components/FrontendScreen.tsx` is feature-level rather than a generic primitive; `components/legal/` is a more natural owner if its modes are primarily legal/help/static screens.
- `types/database.ts` is separate from many manually mapped Supabase shapes. Generated database types, if adopted later, should have a clearly documented home under the data layer.
- Build/browser outputs and setup artifacts should not live beside application entry configuration unless they are documented workflow inputs.

## 10. Dependency Audit

No dependency was proven safe to uninstall through import search alone. Expo config plugins, native autolinking, Babel, Metro, and scripts can use packages without normal TypeScript imports.

- `chart.js`, `gsap`, `expo-blur`, `expo-device`, document/image/video tools, compressor, QR libraries, NativeWind, and Tailwind all have repository references.
- `qrcode` and `react-native-qrcode-svg` are not necessarily duplicates: one can generate data/assets while the other renders native SVG. Verify usage paths before consolidation.
- React Navigation packages are expected Expo Router transitive/runtime peers even where direct imports are limited.
- `@expo/ngrok` is development-only and appropriately placed in `devDependencies`.
- Add Knip (or an equivalent import-graph tool) only in a later approved tooling phase. Configure Expo Router entrypoints, platform variants, Edge Functions, scripts, and config files before trusting its results.
- Run `npm outdated` and security audit only in an approved networked maintenance phase; version age was not inferred from memory.

## 11. Supabase / Data Layer Review

- Most database access is correctly concentrated in `services/`, `clips/services/`, and `subscriptions/services/`.
- Important exceptions include direct queries/mutations in `app/VendorGallery.tsx`, `app/AdminCrmClusterCategories.tsx`, `app/VendorSettings.tsx`, `app/VendorApplicationDetails.tsx`, `app/VendorApplications.tsx`, `app/VendorClipEdit.tsx`, `app/Vendors_dash_profile.tsx`, and admin analytics components.
- `useVendorWorkspace()` executes a broad parallel query bundle and exposes raw `any` rows. It is useful as a façade but currently couples every consumer to table shape and refreshes more data than some screens need.
- `services/publicVendorListings.ts`, subscriptions services, location services, and admin services contain repeated `any`-based mapping of nested Supabase relations. Typed mapper inputs would isolate database response quirks.
- Error handling ranges from thrown errors, silent `.catch(() => {})`, development-only logging, alerts, and fallback queries. Define per-domain conventions: expected absence, recoverable fallback, and user-visible failure.
- Review summary is fetched both through workspace aggregate data and dedicated review services in some flows. Prefer the dedicated source or explicitly document cache/freshness differences.
- Preserve RPCs for transactional operations (subscriptions, clip reservations/finalization, payments); do not replace them with client-side sequences during refactoring.

## 12. Component Review

- Large screens should become composition roots, not be replaced with speculative generic components.
- `VendorProfileFormKit`, vendor shells, legal renderer, clip components, and marketing-card shared renderer are valuable existing reuse points.
- `FrontendScreen` has broad mode-based behavior and should be monitored for “configuration component” growth.
- `MobileTabBar` combines configuration, animation, safe-area sizing, desktop/mobile behavior, and standalone rendering; it is reusable but internally overburdened.
- `MarketingCardPreview` should remain the single source of truth for preview and PDF. Any extraction must preserve deterministic 3:2 export output.
- Public and admin clip/video components should remain separate where moderation controls or permissions differ; share media primitives, not entire feature cards.

## 13. Hook / State Review

- `useVendorWorkspace()` is the highest-value target: broad state, many parallel queries, realtime refresh behavior, completion derivation, and raw types are combined.
- Auth contexts duplicate session listener lifecycle but have legitimately different role validation. Extract only lifecycle mechanics, never role authorization rules.
- Several large routes hold many modal-selection states (`VendorGallery` is the clearest example). A reducer or focused controller hook could make transitions explicit after tests exist.
- Effects that silently ignore rejected promises (`catch(() => {})`) make debugging difficult. Expected optional failures should be named and documented; unexpected ones should reach an error boundary/telemetry path.
- Realtime subscriptions should centralize channel cleanup and targeted cache updates rather than broadly re-fetching unrelated workspace collections.

## 14. TypeScript Review

- Strict mode passes, which is a strong baseline.
- Repository search found approximately 317 `any`-related occurrences; not all are defects (`ComponentType<any>`, native style interop, third-party callbacks), but data mappers and workspace models are weak points.
- `types/adminVendors.ts` stores major nested entities as `Record<string, any>`, and `useVendorWorkspace.ts` exposes almost its entire result as `any`.
- Supabase RPC responses in subscription/payment services are cast through `any`, which weakens payment-state verification.
- `app/vendors-admin-listing.tsx` has an untyped `ChoiceRow` props object; `payments-admin.tsx` stores payment rows as `any[]`.
- Platform-specific style casts such as `outlineStyle` are reasonable localized escape hatches; distinguish these from domain-data `any` in future lint policy.
- The four unused-symbol probe findings should be resolved before enabling `noUnusedLocals`/`noUnusedParameters` globally.
- The single ESLint array-style warning should be fixed in the first approved cleanup phase.

## 15. Recommended Target Architecture

This is an incremental destination, not a request to move everything immediately:

```text
app/                         # Expo Router files; thin route composition/adapters
components/
  ui/                        # genuinely generic primitives
  shared/                    # app-wide shells, error/loading states, navigation
features/
  vendor-profile/
    components/
    hooks/
    services/
    types.ts
  vendor-portfolio/
  marketplace/
  admin/
  crm/
clips/                       # retain existing cohesive domain
subscriptions/               # retain existing cohesive domain
locations/                   # domain rules/types; migrate data access deliberately
services/
  supabase.ts                # client/session foundation
  external/                  # Bunny media, notifications, other external adapters
context/                     # cross-route application providers only
constants/
theme/
types/
  database.ts                # generated/shared database contract
utils/
supabase/
  functions/
  migrations/
scripts/
tests/
assets/
docs/
```

Do not create every folder upfront. Introduce a feature boundary only while extracting a tested, high-value area. Existing `clips/` and `subscriptions/` should remain stable examples rather than being moved for symmetry.

## 16. Safe Refactoring Roadmap

| Phase | Goal | Likely files | Risk | Validation | Must not change |
|---|---|---|---|---|---|
| 1. Tooling/baseline | Add canonical test command, unused checks, artifact ignores, document commands | `package.json`, ESLint/config, `.gitignore`, docs | Low | lint, typecheck, full smoke | Runtime bundles and scripts |
| 2. Dead code | Remove only high-confidence output/import debris after approval | four unused symbols, root fragments, generated artifacts | Low | typecheck, smoke, clean build | Routes/platform variants/assets in use |
| 3. Dependencies | Run configured unused/outdated/security analysis | package files/config | Medium | native/web builds, smoke | Autolinked/config-only packages |
| 4. Duplicate logic | Consolidate clip view recording, contact URLs, exact mapper duplication | clip/contact/location services | Medium | domain tests and targeted E2E | Analytics counts, URL formats, fallbacks |
| 5. Shared types/constants | Type vendor workspace and Supabase mapper inputs | `useVendorWorkspace`, `types/`, affected services | Medium | typecheck, vendor smoke, profile E2E | Database payload/response behavior |
| 6. Data/service layer | Move direct route mutations into focused services | `VendorGallery`, vendor/admin application/settings screens | High | CRUD E2E, RLS/account-role tests | Query filters, RPC use, mutation order |
| 7. Large components | Extract sections/controllers without redesign | large route/component list in section 8 | High | visual regression at supported widths, interaction E2E | UI, navigation, accessibility, state timing |
| 8. Folder organization | Move only stabilized feature modules; retain route adapters | app/components/services feature files | Medium | route enumeration, deep links, native/web builds | Existing URLs and import resolution |
| 9. Tests | Add focused tests around extracted business invariants | scripts/tests plus feature tests | Low–Medium | CI full suite | Production behavior/data |
| 10. Documentation | Record ownership, architecture, release checks | `docs/`, README/package scripts | Low | link/command review | Source behavior |

### Recommended approval sequence

Approve Phase 1 independently. Establish a clean baseline and artifact policy before deleting or moving anything. Then handle each large feature separately, beginning with typing `useVendorWorkspace()` and extracting `VendorGallery` mutations. Payment, authentication, navigation, and Supabase RPC behavior should receive dedicated regression checks before any structural edits.

---

**Audit stop point:** No recommendations in this document have been implemented. Review and approve one roadmap phase before code changes begin.
