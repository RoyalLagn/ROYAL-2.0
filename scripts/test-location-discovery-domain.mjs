// Location-discovery pure-JS domain tests (P2-3).
// Environment: local, no credentials, no network -- safe for test:smoke.
// The DB/RPC-level tests (pagination, tier ordering, RLS) live in
// scripts/location-tests/sql-pagination-and-rpc.test.sql and require the
// linked Supabase project (see that file's header for how/why).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { databaseCategoryCandidates, normalizeMarketplaceCategoryName } from "../locations/marketplaceCategoryNames.ts";
import { normalizeIndiaPostRow, validateOfficialRows } from "./import-india-post-pincodes.mjs";

// The raw DB category name differs from the public display name for
// several categories -- this is what the Taluka RPC's category filter
// relies on the client resolving correctly (P2-1's category-alias fix).
assert.deepEqual(
  new Set(databaseCategoryCandidates("Photographers")),
  new Set(["photographer", "Photographers"]),
);
assert.deepEqual(
  new Set(databaseCategoryCandidates("Caterers")),
  new Set(["caterer", "Caterers"]),
);
assert.deepEqual(
  new Set(databaseCategoryCandidates("Venues")),
  new Set(["wedding hall", "Venues"]),
);
// A category with no renaming still resolves via the display-name
// fallback so the RPC call never receives an empty candidate list.
assert.deepEqual(new Set(databaseCategoryCandidates("Pandits")), new Set(["pandit", "Pandits"]));

assert.equal(normalizeMarketplaceCategoryName("Photographer"), "Photographers");
assert.equal(normalizeMarketplaceCategoryName("Wedding Hall"), "Venues");

// Lightweight implementation guards for the production defects found in
// the independent audit. Database behavior is covered by the rollback-only
// SQL suite; these fail fast locally if the dependent selector, official
// acceptance PIN source, or parent-hierarchy filters are removed again.
const selectorSource = await readFile(new URL("../components/locations/TalukaLocationSelector.tsx", import.meta.url), "utf8");
assert.match(selectorSource, /selectedDistrictId/);
assert.doesNotMatch(selectorSource, /Promise\.all\(\s*items\.map/);
assert.match(selectorSource, /listActiveGeoTalukas\(selectedDistrictId\)/);

const auditMigration = await readFile(new URL("../supabase/migrations/20260811110000_location_discovery_audit_fixes.sql", import.meta.url), "utf8");
assert.match(auditMigration, /district\.is_active[\s\S]*state\.is_active/);

const pincodeFunction = await readFile(new URL("../supabase/functions/lookup-india-pincode/index.ts", import.meta.url), "utf8");
assert.match(pincodeFunction, /"admin_verified": 4/);
assert.match(pincodeFunction, /"india_post_ogd": 3/);
assert.match(pincodeFunction, /if \(upsertError\) throw upsertError/);
// Regression guard (multi-locality PIN cache bug): a "fresh"/"resolved"
// geo_pincodes or supported_pincodes row is not proof that
// geo_pincode_localities has actually been populated for that PIN -- rows
// created before locality tracking existed (or seeded directly) can be
// fresh/resolved with zero cached localities, which must never be served
// as a final answer. Both cache short-circuits must require at least one
// cached locality before skipping the live provider + resolveGeoHierarchy
// re-fetch that would otherwise (re)populate geo_pincode_localities.
assert.match(
  pincodeFunction,
  /cached && cachedCity\?\.is_active[\s\S]{0,120}cachedGeoRow && geoCacheIsFresh && cachedLocalities\.length > 0\) \{/,
);
assert.match(
  pincodeFunction,
  /cachedGeoRow && geoCacheIsFresh && cachedGeoRow\.resolution_status === "resolved" && cachedLocalities\.length > 0\) \{/,
);

const localityMigration = await readFile(new URL("../supabase/migrations/20260811120000_india_wide_pincode_localities.sql", import.meta.url), "utf8");
assert.match(localityMigration, /geo_pincode_localities/);
assert.match(localityMigration, /import_india_post_pincode_batch/);
assert.doesNotMatch(localityMigration, /410507|Talegaon|Maval|Pune/);

// Vendor locality selection and persistence guards. The shared editor is used
// by both onboarding and profile editing, never guesses the first result for a
// multi-locality PIN, and only validates an ID returned for the current PIN.
const vendorLocationEditor = await readFile(new URL("../components/locations/VendorServiceLocationEditor.tsx", import.meta.url), "utf8");
assert.match(vendorLocationEditor, /lookupIndianPincode\(value\.pincode\)/);
assert.match(vendorLocationEditor, /localities\.length === 1[\s\S]*\? localities\[0\]/);
assert.match(vendorLocationEditor, /localities\.find\(\(item\) => item\.id === value\.geoLocalityId\) \?\? null/);
assert.match(vendorLocationEditor, /selectedLocalityBelongsToPin/);
assert.match(vendorLocationEditor, /localityOptions\.length > 0[\s\S]*selectedLocalityBelongsToPin/);
assert.match(vendorLocationEditor, /Select your area \/ village to continue/);
assert.match(vendorLocationEditor, /No locations found for this PIN/);
assert.match(vendorLocationEditor, /<ScrollView[\s\S]*accessibilityRole="radiogroup"/);
assert.match(
  vendorLocationEditor,
  /primaryCityId: result\.city\?\.id \?\? ""/,
  "PIN verification must retain the canonical supported city for Vendor application submission.",
);

const vendorProfileLocation = await readFile(new URL("../app/VendorEditLocation.tsx", import.meta.url), "utf8");
assert.match(vendorProfileLocation, /geoLocalityId: data\.vendor\.geo_pincode_locality_id \?\? null/);
assert.match(vendorProfileLocation, /geoLocalityId: vendorLocation\.geoLocalityId/);
assert.match(vendorProfileLocation, /locationDirty && !locationValid/);
assert.match(vendorProfileLocation, /select your area \/ village before saving/i);

const vendorOnboarding = await readFile(new URL("../app/BecomeVendor.tsx", import.meta.url), "utf8");
assert.match(vendorOnboarding, /geo_pincode_locality_id: vendorLocation\.geoLocalityId/);
assert.match(
  vendorOnboarding,
  /city_id: vendorLocation\.primaryCityId \|\| null/,
  "Vendor onboarding must send the city resolved by the PIN lookup.",
);
const applicationFunction = await readFile(new URL("../supabase/functions/submit-vendor-application/index.ts", import.meta.url), "utf8");
assert.match(applicationFunction, /localityOptions\.length > 1 && !geoLocalityId/);
assert.match(applicationFunction, /localityOptions\.find\(\(item: any\) => item\.id === geoLocalityId\)/);
assert.match(applicationFunction, /selected locality does not belong to this PIN code/i);
assert.match(
  applicationFunction,
  /const lookupCityId = optionalText\(lookup\.city\?\.id\)[\s\S]*const canonicalCityId = lookupCityId \?\? requestedCityId/,
  "The Edge Function must independently derive the managed city from the verified PIN response.",
);
assert.match(
  applicationFunction,
  /city_id: city\?\.id \?\? null/,
  "The application insert must persist the server-verified city ID.",
);

assert.match(localityMigration, /where id = target_locality_id and pincode = target_pincode and is_active/);
assert.match(localityMigration, /raise exception 'The selected locality does not belong to this PIN code'/);
assert.match(localityMigration, /if trusted_count = 1 then/);
assert.match(localityMigration, /geo_pincode_locality_id = case when locality_row\.id is not null then locality_row\.id else null end/);
assert.match(localityMigration, /application\.geo_pincode_locality_id/);

// A failed PIN-locality vendor page must stop pagination. Without this guard,
// FlatList.onEndReached repeatedly calls the missing/unavailable RPC.
const searchByLocation = await readFile(new URL("../app/SearchByLocation.tsx", import.meta.url), "utf8");
assert.match(searchByLocation, /\.catch\(\(\) => \{[\s\S]{0,300}setHasMore\(false\)/);
const vendorsListing = await readFile(new URL("../app/VendorsListing.tsx", import.meta.url), "utf8");
assert.match(vendorsListing, /\.catch\(\(\) => \{[\s\S]{0,300}setLocationHasMore\(false\)/);
// Public category listings must keep the State/District/Taluka path wired to
// the tiered RPC. Near Me and PIN are additional modes, not replacements for
// the Admin-managed hierarchy and neighbor-priority flow.
assert.match(vendorsListing, /<TalukaLocationSelector/);
assert.match(vendorsListing, /listActiveGeoStates\(\)/);
assert.match(vendorsListing, /validateGeoSelection\(stored\)/);
assert.match(vendorsListing, /fetchTalukaVendorPageCards\(/);
assert.match(vendorsListing, /databaseCategoryCandidates\(displayCategory\)/);
assert.match(vendorsListing, /Nearby · \$\{meta\.talukaName\}/);
assert.match(vendorsListing, /sort: filters\.sort/);
assert.match(vendorsListing, /after: reset \? null : locationCursor/);

const officialRows = validateOfficialRows([
  { pincode: "110001", officename: "Example Head Office", taluk: "Example Taluka", districtname: "New Delhi", statename: "Delhi" },
  { pincode: "600001", officename: "Example Town Office", taluk: "Example Taluk", districtname: "Chennai", statename: "Tamil Nadu" },
  { pincode: "700001", officename: "Example Village Branch", taluk: "Example Block", districtname: "Kolkata", statename: "West Bengal" },
  { pincode: "700001", officename: "Second Example Branch", taluk: "Example Block", districtname: "Kolkata", statename: "West Bengal" },
  { pincode: "781001", officename: "Example Rural Sub Office", taluk: "Example Circle", districtname: "Kamrup Metropolitan", statename: "Assam" },
]);
assert.equal(officialRows.length, 5);
assert.equal(officialRows.filter((row) => row.pincode === "700001").length, 2);
assert.equal(normalizeIndiaPostRow({ pin: "560001", officename: "Example Office", district: "Bengaluru", state: "Karnataka" }).pincode, "560001");
assert.throws(() => validateOfficialRows([{ pincode: "000000", officename: "Invalid", districtname: "Nowhere", statename: "Nowhere" }]));
assert.match(pincodeFunction, /No Indian postal location was found[\s\S]*status: "unresolved"/);

const official410501Repair = await readFile(
  new URL("../supabase/migrations/20260815190000_trust_410501_official_localities.sql", import.meta.url),
  "utf8",
);
assert.match(official410501Repair, /\('Bahul'\)/);
assert.match(official410501Repair, /lower\(taluka\.name\) = 'khed'/);
assert.match(official410501Repair, /source_trust = greatest\(locality\.source_trust, 3\)/);
assert.match(official410501Repair, /is_trusted = true/);
assert.match(official410501Repair, /refresh_geo_pincode_aggregate\('410501'\)/);

console.log("Location-discovery domain tests passed.");
