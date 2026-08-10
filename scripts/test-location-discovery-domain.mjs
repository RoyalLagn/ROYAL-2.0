// Location-discovery pure-JS domain tests (P2-3).
// Environment: local, no credentials, no network -- safe for test:smoke.
// The DB/RPC-level tests (pagination, tier ordering, RLS) live in
// scripts/location-tests/sql-pagination-and-rpc.test.sql and require the
// linked Supabase project (see that file's header for how/why).
import assert from "node:assert/strict";
import { databaseCategoryCandidates, normalizeMarketplaceCategoryName } from "../locations/marketplaceCategoryNames.ts";

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

console.log("Location-discovery domain tests passed.");
