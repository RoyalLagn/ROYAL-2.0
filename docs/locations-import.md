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
- **Taluka centroid coordinates**: OpenStreetMap Nominatim geocodes of each
  Taluka's headquarters town, queried 2026-08-11 (rate-limited, identified
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
- **PIN code → locality/Taluka mapping**: resolved **live**, per request, via
  `supabase/functions/lookup-india-pincode`, with explicit **source
  precedence** (see below) between `data.gov.in`/India Post (official) and
  `postalpincode.in` (unofficial fallback, kept only for availability). No
  PIN code is hand-typed or invented anywhere in this feature.

### PIN provider precedence

`data.gov.in`/India Post
(https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month)
is treated as authoritative. `postalpincode.in` needs no API key and has no
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

No application code needs to change — the hierarchy, the PIN resolver, the
public picker, and the Admin screen are all state/district-agnostic. The
public selector (`TalukaLocationSelector.tsx`) automatically shows a State
step the moment a second `geo_states` row is active — this was verified live
against a temporary, since-removed fixture State during this revision.

### 2. Nearby-Taluka generation

`public.rebuild_taluka_neighbors(state_id, max_neighbors, max_distance_km)`
(Admin-only RPC, also exposed as a button on `/AdminGeoLocations`) computes,
for every active Taluka, the N nearest other active Talukas by
`extensions.st_distance()` on their `geography(Point,4326)` centroids, and
caches the ordered result in `geo_taluka_neighbors`. It is **not** filtered
to the same district/state, so a Taluka near a state border will correctly
surface a neighbouring state's Taluka once that state's data is imported.
Re-running it is safe: each Taluka's neighbour rows are deleted and
reinserted, never duplicated.

### 3. PIN code resolution

No standalone import script is needed for PINs — `lookup-india-pincode`
resolves and caches a PIN's District/Taluka the first time it's looked up
(vendor PIN entry, or an Admin retry), applying the precedence rules above.
See `resolveGeoHierarchy()`/`upsertGeoPincodeWithPrecedence()` in that
function for the exact logic, including alias-aware Taluka name matching
(`geo_talukas.aliases`).

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
  unverified/suspended-vendor exclusion, service-title search, unauthorized
  writes). **Environment**: runs against the linked Supabase project via
  `supabase db query --linked --file <path>` (no local Supabase/Docker is
  available in this environment) inside a transaction that always rolls
  back — no fixture row is ever committed. Run it with:
  ```bash
  npx supabase db query --linked --file scripts/location-tests/sql-pagination-and-rpc.test.sql
  ```
- `scripts/test-location-discovery-domain.mjs` — pure-JS tests for the
  category-alias resolution (`locations/marketplaceCategoryNames.ts`).
  Registered in `npm run test:smoke` / `npm run test:location-discovery`.
- Live Playwright MCP flows against the running dev server covered the
  selector (dependent loading, persisted-selection validation, invalid- and
  deleted-selection recovery, multi-state — via a temporary, since-removed
  real fixture State), category-change pagination reset, the Maval/Khed
  Pune scenarios, search, and desktop + 390×844 mobile viewports, with 0
  console errors throughout. See the implementation report for the full
  transcript summary.

## Scope

- Pune district, Maval taluka is the reference dataset.
- Only Maharashtra is active; the schema and every function operate purely
  on IDs/foreign keys, with zero `if state === 'Maharashtra'`-style checks
  in production logic (hardcoded names only appear in seed/import fixtures
  and test files, per policy).
