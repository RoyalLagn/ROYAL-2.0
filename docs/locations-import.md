# Location Discovery: State → District → Taluka

This documents the generic, India-wide location hierarchy that powers vendor
discovery: how it's populated, how PIN codes resolve to it, its data
provenance/precedence rules, and how to extend it beyond Pune/Maharashtra.

> **Revision history**: an initial implementation (2026-08-10) was
> independently audited and found incomplete in several ways (missing
> official tahsil, no data provenance, a PIN-change race that could leave a
> stale canonical Taluka, a selector that couldn't actually support a second
> State, and a Taluka-selected listing that still downloaded the whole
> marketplace). This revision (2026-08-11) fixes all of those; see the
> per-section notes below for what changed and why.
>
> A second independent audit on 2026-08-11 found and corrected four further
> production issues in `20260811110000_location_discovery_audit_fixes.sql`:
> inactive parent Districts/States still leaked through the SECURITY DEFINER
> listing RPC, the selector eagerly loaded every District's Talukas instead
> of offering a real dependent District step, the Maval point used Lonavala
> while claiming to represent the headquarters, and the deployed project had
> no configured official PIN provider so acceptance PINs could not become
> canonical without Admin review.
>
> **2026-08-14 — root-cause data fix + availability/application split.** Only
> Pune's 15 talukas had ever been seeded; the State dropdown listing all
> States/UTs (`20260814030000_seed_all_india_states_for_admin.sql`) was
> UI-only and didn't touch the missing District/Taluka data. Fixed by:
> `20260814050000_geo_seed_maharashtra_full.sql` (all 35 remaining
> Maharashtra Districts and their real Talukas — 360 Talukas statewide,
> Pune untouched) and `20260814060000_geo_seed_india_districts.sql` (real
> Districts, sourced from Wikipedia's per-State lists, for the other 35
> States/UTs — 779 Districts total). **Talukas beyond Maharashtra are not
> yet populated** — large scraped Taluka tables (200–350 rows per State)
> showed real truncation/conflation risk during sourcing, and a
> partially-populated Taluka list would reproduce the exact bug this fix
> exists to close. Extend the same State using the pattern demonstrated in
> the Maharashtra migration (one `insert ... on conflict do nothing` block
> per District, sourced and verified per District before writing it).
> `20260814040000_geo_taluka_accept_vendor_applications.sql` also splits
> `geo_talukas.is_active` (public marketplace visibility — unchanged) from
> a new `accept_vendor_applications` column (whether the Taluka accepts
> *new* vendor applications, enforced in `submit-vendor-application`); see
> "Availability vs. public visibility" below.
>
> **2026-08-14 (later same day) — full audit: public-visibility default,
> Near Me, PIN authorization outcome, coordinates.** A full audit of the
> Admin → Vendor → Public chain found and fixed:
> - **Public-visibility default bug**: the District/Taluka import above never
>   set `is_active` explicitly, so every new row inherited the column's old
>   `DEFAULT true` and went publicly live the moment it was imported — 778/779
>   Districts and 358/360 Talukas were public before any Admin review.
>   `20260814080000_geo_public_visibility_default_inactive.sql` flips the
>   column defaults to `false` and backfills every row except the pre-existing
>   Pune District/Talukas. `20260814100000_restore_pune_public_visibility.sql`
>   separately restores Pune District + its Ambegaon Taluka, which had been
>   left hidden by an unrelated prior session while 3 real verified vendors
>   depended on them — an oversight this repair would otherwise have
>   compounded.
> - **`is_active` was accidentally gating PIN *resolution*, not just public
>   discovery**: `resolveGeoHierarchy` in `lookup-india-pincode` filtered
>   candidate States/Districts/Talukas by `is_active = true`, so once the bug
>   above was fixed, PINs in every not-yet-reviewed District stopped
>   resolving at all — `accept_vendor_applications` must be checkable
>   independently of public visibility, so this filter was removed; PIN
>   resolution now considers every imported row regardless of `is_active`.
> - **`get_nearby_vendors` (Near Me)** is `SECURITY DEFINER` and bypassed RLS
>   entirely, so a vendor whose canonical State/District/Taluka had been
>   hidden from public discovery still appeared in Near Me results. Fixed in
>   `20260814090000_near_me_enforce_public_visibility.sql` with the same
>   explicit chain check `get_public_vendor_taluka_page_cards` already had.
>   Deliberately still ignores `accept_vendor_applications` — Near Me answers
>   "is this vendor discoverable", not "is this Taluka accepting new
>   applications".
> - **PIN authorization outcome** (`424201` reproduced this exactly): the
>   response's `supported`/`message` fields were driven by whether the
>   *legacy* `supported_cities` list had a matching row, completely
>   independent of the canonical Taluka resolution — so a PIN could return a
>   Taluka candidate (`Pachora`) inside `geo` while the top-level message said
>   "not yet available", an internally contradictory response. Every response
>   path in `lookup-india-pincode` now derives `supported` from a single
>   `computeApplicationOutcome()` result — `resolved_enabled` /
>   `resolved_disabled` / `ambiguous` / `needs_review` / `unresolved` — and
>   `PincodeGeoResolution.applicationStatus`/`applicationMessage` carry that
>   exact outcome to every consumer (`submit-vendor-application`'s
>   server-side gate and `VendorServiceLocationEditor`'s new
>   `enforceApplicationAvailability` early-warning, both reading the identical
>   fields so they can never disagree).
> - **`submit-vendor-application`** previously only blocked when a Taluka
>   resolved with `accept_vendor_applications = false`; an ambiguous or
>   untrusted/unresolved PIN fell through with no gate at all. It now blocks
>   on every non-`resolved_enabled` outcome and independently re-verifies
>   `accept_vendor_applications` against the database rather than trusting
>   the nested lookup response's boolean alone.
> - **Unrelated production bug found while verifying the deployed Edge
>   Function** (per this audit's explicit "verify the deployed version, not
>   only the local file" requirement): `public.application_settings` had RLS
>   policies but no table-level `GRANT` for `service_role` at all, so *every*
>   vendor application submission failed at the function's very first query
>   ("permission denied for table application_settings") — before reaching
>   any location logic. Fixed in
>   `20260814110000_fix_application_settings_service_role_grant.sql`.
> - **Nearby-Taluka coordinates**: `20260814120000_geo_taluka_headquarters_coordinates.sql`
>   adds real coordinates for the 29 Maharashtra Talukas that are their own
>   District's headquarters town, by reusing that District's already-sourced
>   headquarters point (27 exact-name matches, plus the two well-established
>   cases where the names differ: Nagpur District → Nagpur City Taluka,
>   Raigad District → Alibaug Taluka). The ~330 remaining Maharashtra Talukas
>   still have `NULL` coordinates and are correctly skipped by
>   `rebuild_taluka_neighbors_internal` (never a guessed distance) —
>   selected-Taluka results still work for them, nearby fallback simply isn't
>   available yet. Verified live: temporarily activating Nashik and rebuilding
>   produced real, geographically plausible neighbors (Junnar 90km, Ambegaon
>   105km, ...), then reverted.

## Architecture

Two location systems run side by side:

- **Legacy City/Area** (`supported_cities`, `supported_areas`,
  `supported_pincodes`, `vendor_service_locations`) — unchanged, still powers
  vendor onboarding's "primary service location" and the `/AdminLocations`
  screen.
- **State → District → Taluka hierarchy** (`geo_states`, `geo_districts`,
  `geo_talukas`, `geo_pincodes`, `geo_taluka_neighbors`) — powers the public
  "Where do you need the service?" State/District/Taluka picker on
  `/VendorsListing` and the `/AdminGeoLocations` screen. Vendors get
  `geo_state_id` / `geo_district_id` / `geo_taluka_id` / `geo_latitude` /
  `geo_longitude` / `geo_resolution_status` / `geo_review_reason` columns.

Nothing in the legacy system was removed or renamed. A vendor's row simply
carries both sets of location references.

## Data sources and provenance

- **District/Taluka names**: cross-checked against **pune.gov.in**'s
  official Pune District Government tahsil page
  (`https://pune.gov.in/en/tahsils/`), which is the authoritative source used
  for Pune's 16 tahsils (Ambegaon, Baramati, Bhor, Daund, Haveli, Indapur,
  Junnar, Khed, **Loni Kalbhor**, Maval, Mulshi, Pimpri-Chinchwad, Pune City,
  Purandar, Shirur, **Velha**). Every `geo_districts`/`geo_talukas` row
  carries `source_name`, `source_url`, `source_version` (fetch date) and
  `verification_status` columns recording this.
- **Spelling aliases**: pune.gov.in's official spelling is the canonical
  `name`; other commonly-seen spellings are kept in a `geo_talukas.aliases
  text[]` column (not the canonical name) so search/PIN matching isn't
  broken by spelling drift: Velha↔**Velhe**, Maval↔**Mawal**,
  Purandar↔**Purandhar**, Khed↔**Rajgurunagar** (its post-office/HQ town
  name), Ambegaon↔**Ghodegaon**, Mulshi↔**Paud**.
- **LGD numeric codes**: LGD's machine-readable district/sub-district export
  requires a NAPIX API key or an interactive "Download Directory" session
  (`https://lgdirectory.gov.in`) that isn't reachable from this environment.
  `geo_states.lgd_code` / `geo_districts.lgd_code` / `geo_talukas.lgd_code`
  are nullable and currently `NULL` for every row; `verification_status` is
  `'awaiting_lgd_verification'` for every row for exactly this reason — see
  "Backfilling LGD codes" below.
- **Taluka proximity coordinates**: OpenStreetMap Nominatim geocodes of each
  Taluka's headquarters/representative town, queried 2026-08-11 (rate-limited, identified
  User-Agent, per Nominatim's usage policy). Recorded per-row in
  `coordinate_source` (the exact query and town used) and
  `coordinate_method = 'representative_headquarters'` — **not**
  `'official_polygon_centroid'`, because licensed Survey-of-India boundary
  polygon data is not obtainable in this environment (Section 5's explicit
  documented fallback). See "Upgrading to polygon data" below for the exact
  swap-in path once such data is licensed. `coordinate_method` is a real
  column, checked against exactly the 4 values the spec names
  (`official_polygon_centroid`, `official_point`,
  `representative_headquarters`, `manually_reviewed`) — no row is ever
  described as an official centroid when it isn't one.
- **Maval correction**: the first revision used Lonavala because its Vadgaon
  query did not resolve, but still labeled the method
  `representative_headquarters`. The independent audit resolved the alternate
  spelling "Vadgaon Mawal" and corrected the point to `18.7438014,
  73.6307937`; the row states that it is a Nominatim town/bus-stop reference,
  not an official centroid.
- **PIN code → locality/Taluka mapping**: resolved **live**, per request, via
  `supabase/functions/lookup-india-pincode`, with explicit **source
  precedence** (see below) between `data.gov.in`/India Post (official) and
  `postalpincode.in` (unofficial fallback, kept only for availability). No
  PIN code is invented anywhere in this feature. The canonical post-office
  rows are loaded India-wide through `npm run locations:import-india-post`.

### PIN provider precedence

`data.gov.in`/India Post
(https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month)
are treated as authoritative. `postalpincode.in` needs no API key and has no
rate-limit friction in this environment, so it's kept as a fallback when
`DATA_GOV_IN_API_KEY`/`DATA_GOV_IN_PINCODE_RESOURCE_ID` aren't configured —
but a Taluka match found **only** through it is never silently promoted to
`resolved`. It's cached as `needs_review` (with a
`geo_pincodes.ambiguous`/`source` trail) unless:

- an existing cache row already has the **same** Taluka resolved from an
  equal-or-higher-trust source (independent corroboration), or
- an Admin explicitly confirms it via `admin_confirm_geo_pincode(pincode,
  taluka_id)` (source recorded as `'admin_verified'`, top trust tier).

A lower-trust write is never allowed to overwrite an already-`resolved`,
higher-trust row (`upsertGeoPincodeWithPrecedence` in the Edge Function). Raw
provider payloads (`geo_pincodes.raw_response`) are admin-only — anon/public
roles have no grant on `geo_pincodes` at all (verified: anon REST calls
return `permission denied for table geo_pincodes`).

Cache rows are also treated as stale after 180 days
(`PIN_CACHE_STALE_DAYS`) and re-fetched live rather than trusted forever,
so corrected/expanded official data eventually flows through without a
manual cache-bust.

## Import pipeline

### 1. States / Districts / Talukas

`20260810160000_geo_seed_maharashtra_pune.sql` seeded the initial 15 Pune
Talukas; `20260811010000_geo_provenance_and_pune_correction.sql` is an
**additive, non-destructive correction migration** (never edits an
already-applied migration file) that added the missing 16th tahsil (Loni
Kalbhor), renamed Velhe→Velha with Velhe kept as an alias, re-sourced every
coordinate to a cited OpenStreetMap Nominatim geocode, and populated the
provenance columns for the whole set. This is a plain idempotent pattern
(`on conflict ... do nothing` / explicit `update`); to add the next district
or state, write a new migration in the same shape:

`20260811110000_location_discovery_audit_fixes.sql` hardens active-hierarchy
policies/RPCs and regenerates proximity rows. It contains no PIN-specific
seed data. `20260811120000_india_wide_pincode_localities.sql` adds the generic
post-office/locality model and restricted official India Post batch importer.

```sql
insert into public.geo_states (name, code, country) values ('Goa', 'GA', 'India')
  on conflict (lower(name)) do nothing;

insert into public.geo_districts (
  state_id, name, latitude, longitude, source_name, source_url,
  coordinate_source, coordinate_method, verification_status
)
select id, 'North Goa', <lat>, <lng>,
  '<official source name>', '<official source url>',
  '<how the coordinate was obtained>', 'representative_headquarters',
  'awaiting_lgd_verification'
from public.geo_states where lower(name) = 'goa'
  on conflict (state_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, latitude, longitude, ...)
select d.id, t.name, t.lat, t.lng, ...
from public.geo_districts d
cross join (values ('Bardez', 15.57, 73.81), ...) as t(name, lat, lng)
where d.name = 'North Goa'
  on conflict (district_id, lower(name)) do nothing;

select private.rebuild_taluka_neighbors_internal(
  (select id from public.geo_states where lower(name) = 'goa'), 8, 150
);
```

No application code needs to change when importing another State/District.
The hierarchy, PIN resolver, public picker, and Admin screen are ID-driven.
The public selector shows a State step when more than one State is active,
loads Districts only for that State, and loads Talukas only for the selected
District; it never downloads the full State hierarchy.

### 2. Nearby-Taluka generation

`public.rebuild_taluka_neighbors(state_id, max_neighbors, max_distance_km)`
(Admin-only RPC, also exposed as a button on `/AdminGeoLocations`) computes,
for every Taluka whose State/District/Taluka chain is active, the N nearest
other fully active Talukas by
`extensions.st_distance()` on their `geography(Point,4326)` centroids, and
caches the ordered result in `geo_taluka_neighbors`. It is **not** filtered
to the same district/state, so a Taluka near a state border will correctly
surface a neighbouring state's Taluka once that state's data is imported.
Re-running it is safe: target-State rows are cleared and regenerated in one
transaction, never duplicated. Equal distances use the Taluka UUID as a
stable tiebreaker.

### 3. PIN code resolution

No all-India PIN dump is loaded into the client. `lookup-india-pincode`
resolves and caches a PIN's District/Taluka the first time it's looked up
(vendor PIN entry, or an Admin retry), applying the precedence rules above.
See `resolveGeoHierarchy()`/`upsertGeoPincodeWithPrecedence()` in that
function for the exact logic, including alias-aware Taluka name matching
(`geo_talukas.aliases`).

The official Pune Government directory seed covers the published Tahsil PINs
for acceptance and availability. It never overwrites an existing resolved
`data.gov.in` or Admin-confirmed row. Expansion beyond these seed PINs should
configure the data.gov.in Edge Function secrets or import another cited
official source through an append-only migration.

### 4. Vendor enrichment (atomic, P1-3)

- **Vendor edits their own location**: `replace_vendor_service_locations`
  (the existing legacy-location RPC) now *also* resolves the canonical
  State/District/Taluka from whatever PIN ends up on the vendor row, in the
  **same database transaction** — there is no longer a second, independently
  failable network call. A changed PIN can never end up paired with a stale
  Taluka from the *previous* PIN: `private.resolve_vendor_geo_from_pincode`
  always either resolves fresh from the `geo_pincodes` cache or fully clears
  `geo_state_id`/`geo_district_id`/`geo_taluka_id` to `null` and sets
  `geo_resolution_status`/`geo_review_reason` accordingly.
- **Application approved → vendor row created**: the existing
  `private.sync_approved_vendor_location` trigger calls the same shared
  helper.
- **Admin retry**: `admin_retry_vendor_geo_resolution(vendor_id)` re-resolves
  a vendor's existing PIN against the current cache without needing the PIN
  client-side (exposed as a "Retry resolution" button on
  `/AdminGeoLocations`).
- **Existing vendors from before this feature**: left as
  `geo_resolution_status = 'unresolved'`/`'needs_review'` (PIN preserved,
  nothing guessed) until a save, an Admin retry, or an Admin PIN
  confirmation resolves them.

## Availability vs. public visibility

`geo_talukas` carries two independent boolean flags, each write path scoped
to a single Taluka row (`eq("id", id)` — never a cascading update to a
District/State or a sibling Taluka):

- **`is_active`** — public marketplace visibility. Already-approved vendors
  in an inactive Taluka disappear from public discovery (RLS +
  `get_public_vendor_taluka_page`'s join). Managed from the *advanced*
  `/AdminLocations` screen alongside State/District `is_active` and PIN
  review.
- **`accept_vendor_applications`** — whether the Taluka accepts *new* vendor
  applications, enforced in `submit-vendor-application` right after the PIN
  resolves a Taluka, before any application row is written. Managed from the
  simple `/AdminGeoLocations` "Talukas in selected District" switches
  (`services/geoLocations.ts#setGeoTalukaAcceptingApplications`,
  `hooks/useAdminGeoHierarchy.ts#toggleTaluka`).

Turning `accept_vendor_applications` off for a Taluka never touches
`is_active` — an already-approved vendor stays publicly discoverable even
while new applications from that Taluka are paused. This is deliberate: the
two flags answer different questions ("can customers find vendors here
today?" vs. "can new vendors sign up from here right now?") and conflating
them would mean pausing new applications silently hides existing vendors,
which the Admin spec explicitly disallows.

## Backfilling LGD codes

Once an LGD NAPIX API key or CSV export is available:

1. Export each state/district/sub-district row with its LGD code.
2. `update public.geo_districts set lgd_code = <code>, verification_status = 'verified' where lower(name) = <name> and state_id = <id>;`
   (same pattern for `geo_states` and `geo_talukas`).
3. No downstream logic depends on `lgd_code` being present — it's kept for
   traceability/audit only.

## Upgrading to polygon boundary data

If a licensed Survey-of-India-derived (or otherwise properly licensed)
Taluka boundary polygon dataset becomes available:

1. Add a `boundary extensions.geography(MultiPolygon, 4326)` column to
   `geo_talukas`.
2. Swap `private.rebuild_taluka_neighbors_internal`'s distance ordering for
   `ST_Touches`/`ST_Intersects` boundary-adjacency, falling back to centroid
   distance only where a polygon is missing.
3. Update affected rows' `coordinate_method` to `'official_polygon_centroid'`
   and `verification_status` to `'verified'`.
4. Everything downstream (the cache table shape, the public RPC, the UI) is
   unchanged — the neighbour *source* is swappable without touching the
   consumers.

## Vendor listing query architecture (P2-1/P2-2)

`public.get_public_vendor_taluka_page_cards` returns **complete,
ready-to-render card data** for one bounded page in a single query —
vendor fields, starting price, review aggregate, and membership plan are
all joined in-query (`LATERAL`, bounded to the page), eliminating the
previous per-vendor `get_public_vendor_membership_plan` N+1 pattern and the
full-marketplace client-side download for the Taluka-selected path.
Search/rating/price filters and sort are applied server-side, over the
*complete* eligible dataset, before pagination — a filtered page is never
falsely sparse. `tier` is always the primary `ORDER BY` key, so nearby-Taluka
vendors can never be sorted ahead of an unexhausted selected Taluka.

**Pagination consistency**: the default ("popular") ordering — the path
infinite scroll actually uses — is true keyset/seek pagination over the
tuple `(tier, is_featured, review_count, average_rating, updated_at,
vendor_id)`, so a vendor update between page fetches can't shift
already-seen rows into a later page or push an unseen row earlier. Explicit
"Highest rated"/"Lowest price" sorts use `OFFSET` pagination instead
(changing to those sorts already resets the cursor to page 1, bounding any
drift to a single re-sorted session); this is a deliberate, documented
trade-off rather than an oversight.

## Testing

- `scripts/location-tests/sql-pagination-and-rpc.test.sql` — DB/RPC-level
  tests (pagination/tier-boundary correctness with a 25+3+0+2 vendor
  fixture, keyset pagination, category aliasing, inactive-Taluka exclusion,
  inactive parent hierarchy exclusion, unverified/suspended-vendor exclusion,
  service-title search, and unauthorized writes). **Environment**: runs against the linked Supabase project via
  `supabase db query --linked --file <path>` (no local Supabase/Docker is
  available in this environment) inside a transaction that always rolls
  back — no fixture row is ever committed. Run it with:
  ```bash
  npx supabase db query --linked --file scripts/location-tests/sql-pagination-and-rpc.test.sql
  ```
- `scripts/test-location-discovery-domain.mjs` — pure-JS tests for the
  category-alias resolution (`locations/marketplaceCategoryNames.ts`).
  Registered in `npm run test:smoke` / `npm run test:location-discovery`.
- Independent Playwright browser verification covered the real Pune selector,
  Maval/Khed switching, category persistence, Maval Photographer results,
  Maval Venues/Khed empty states, and desktop plus 390×844 mobile layouts.
  The linked database had no nearby geo-resolved vendor after the one Maval
  Photographer, so the visual cross-Taluka separator remains SQL-fixture
  verified rather than demonstrable with current production data.

## Scope

- Pune district, Maval taluka is the reference dataset.
- Only Maharashtra is active; the schema and every function operate purely
  on IDs/foreign keys, with zero `if state === 'Maharashtra'`-style checks
  in production logic (hardcoded names only appear in seed/import fixtures
  and test files, per policy).
