// Structural/regression guards for PIN -> Taluka resolution and the
// "toggle ON auto-allows applications" rule. No Supabase/network calls --
// every check reads local source files only, matching the convention of
// scripts/test-regression-guards.mjs and
// scripts/test-location-discovery-domain.mjs (safe for test:smoke).
//
// There is deliberately no Admin "confirm this PIN" UI in this app: a
// vendor can already apply the moment a Taluka is toggled ON, regardless of
// whether the specific PIN/locality mapping came from an official or
// unofficial source (see the "toggle ON auto-allows" guard below) -- the
// trust/precedence machinery here exists purely so a later, lower-quality
// provider re-fetch can never silently degrade a mapping, not to gate
// vendors on a manual per-PIN Admin review step.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const cascadeMigration = await read(
  "supabase/migrations/20260819100000_admin_confirm_geo_pincode_cascade_localities.sql",
);

// --- Admin confirms one PIN -> the whole PIN's localities, not one-by-one --
assert.match(
  cascadeMigration,
  /update public\.geo_pincode_localities[\s\S]{0,400}admin_confirmed = true/,
  "admin_confirm_geo_pincode must cascade admin_confirmed=true to every locality on the PIN, not just the PIN-level row.",
);
assert.match(
  cascadeMigration,
  /is_trusted = true/,
  "Cascaded localities must be marked trusted so vendors stop seeing them as 'unofficial candidates'.",
);
assert.match(
  cascadeMigration,
  /source = 'admin_verified'/,
  "Cascaded localities must carry source='admin_verified' (trust 4) -- the top of the precedence order.",
);

// --- Never approve every PIN in a district / never silently reassign a ----
// --- locality that already belongs to a different Taluka ------------------
assert.match(
  cascadeMigration,
  /existing_pin\.ambiguous[\s\S]{0,200}raise exception/,
  "A PIN already flagged ambiguous (spans multiple Talukas) must be refused by the bulk PIN-confirm action, not silently collapsed into one Taluka.",
);
assert.match(
  cascadeMigration,
  /taluka_id is not null[\s\S]{0,80}taluka_id <> target_taluka_id[\s\S]{0,300}raise exception/,
  "A locality already resolved to a *different* Taluka must never be silently reassigned by confirming the whole PIN.",
);
assert.doesNotMatch(
  cascadeMigration,
  /district_id\s*=\s*\$1|update public\.geo_pincode_localities\s+set[\s\S]{0,50}where\s+district_id/i,
  "There must be no district-wide/bulk-approve-every-PIN action -- confirmation is always scoped to one pincode + one taluka.",
);
assert.doesNotMatch(
  cascadeMigration,
  /410507|Talegaon|Umbre Navlakh|Vishnupuri|Varale|Induri|Maval/,
  "The generic confirm-PIN RPC must stay free of any hardcoded PIN/locality/Taluka names.",
);

// --- Precedence: Admin-confirmed > official > fallback, preserved in the --
// --- Edge Function that writes/reads geo_pincode_localities on every lookup
const pincodeFunction = await read("supabase/functions/lookup-india-pincode/index.ts");
assert.match(
  pincodeFunction,
  /"admin_verified": 4/,
  "admin_verified must remain the highest-trust source.",
);
assert.match(
  pincodeFunction,
  /existing\?\.admin_confirmed \|\| Number\(existing\?\.source_trust \?\? 0\) > forProviderTrust\) return null/,
  "A live provider re-lookup must never overwrite a locality row once it is admin_confirmed, even when the new provider's own trust is higher (e.g. official data.gov.in without Taluka coverage must not blank out an Admin-confirmed Taluka).",
);
assert.match(
  pincodeFunction,
  /existingIsResolved && existingTrust > newTrust\)/,
  "A resolved PIN from a higher-trust source (Admin-confirmed) must never be downgraded by a lower-trust provider's re-fetch.",
);
// Untrusted cache rows must always retry the live provider instead of being
// served stale for up to PIN_CACHE_STALE_DAYS -- otherwise fixing the
// official provider integration would never reach any PIN that was already
// cached as needs_review.
assert.match(
  pincodeFunction,
  /geoCacheIsFresh = Boolean\(\s*cachedGeoRow\?\.resolution_status === "resolved"/,
  "Only an already-resolved cache row may be treated as fresh; needs_review/unresolved rows must always retry the live provider.",
);
// A post office's own name (e.g. "Indapur S.O.") often IS its Taluka's
// name, but the provider's Taluka/Block field is frequently blank for
// exactly these rows -- without this fallback, a whole PIN stays
// "unresolved" even when its own Taluka headquarters office is right there.
assert.match(
  pincodeFunction,
  /stripPostOfficeSuffix/,
  "A blank Taluka/Block field must fall back to matching the office's own name (suffix-stripped) against known Taluka names -- otherwise Talukas whose headquarters office arrives with no Block field stay unresolved forever, even when already toggled ON.",
);
// The same real post office often lands as two separate rows -- an official
// import (e.g. "Bhigwan S.O.", trusted, no Taluka) and an unofficial one
// (plain "Bhigwan", untrusted, DOES have a Taluka) -- because their
// normalized names differ. Left undeduped, a vendor can pick the one
// duplicate that happens to carry no Taluka and dead-end on "needs to be
// verified", even though the identical place right next to it already
// works.
assert.match(
  pincodeFunction,
  /function dedupeLocalitiesBySamePlace/,
  "Localities for the same real post office (with/without the S.O./B.O. suffix) must be merged into one option, preferring whichever copy actually carries a Taluka -- otherwise a vendor can pick the taluka-less duplicate and hit a dead end even though the Taluka is enabled.",
);
assert.match(
  pincodeFunction,
  /return dedupeLocalitiesBySamePlace\(\(data \?\? \[\]\)\.map\(localityFromRow\)\)/,
  "listCachedLocalities (used by both the cached and live-resolution paths) must apply the dedupe before returning localities to any caller.",
);
assert.match(
  pincodeFunction,
  /function inheritUniquePinTaluka/,
  "Village B.O.s with a blank Block must inherit the PIN's unique Taluka in the lookup response so picking any office under an enabled Taluka can apply.",
);
assert.match(
  pincodeFunction,
  /taluka_id: matchedTaluka\?\.id \?\? \(ambiguous \? null : talukaRow\?\.id\) \?\? null/,
  "When writing locality rows, a unique PIN-level Taluka must be stored on villages that did not match a Taluka by name themselves.",
);
assert.doesNotMatch(
  pincodeFunction,
  /needs to be verified by RoyalLagn/,
  "lookup-india-pincode must not tell vendors a found PIN 'needs to be verified' -- unofficial source + Taluka ON is enough to apply.",
);

// --- Server-side eligibility gate stays authoritative and unweakened ------
const submitFunction = await read("supabase/functions/submit-vendor-application/index.ts");
assert.match(
  submitFunction,
  /const \{ data: talukaRow, error: talukaError \} = await service\s*\n\s*\.from\("geo_talukas"\)/,
  "submit-vendor-application must keep its own independent DB re-check of accept_vendor_applications -- never trust the nested lookup response's boolean alone.",
);
assert.match(
  submitFunction,
  /if \(!talukaRow \|\| !talukaRow\.accept_vendor_applications\)/,
  "A Taluka with accept_vendor_applications=false must still block new applications even when the PIN/locality mapping itself is trusted.",
);
assert.match(
  submitFunction,
  /geoStatus === "ambiguous" && !selectedGeoLocality/,
  "A genuinely multi-Taluka (ambiguous) PIN must still require an explicit locality choice before any Taluka is authoritative.",
);
// The actual "toggle ON auto-allows" rule: once a locality (and its Taluka)
// is known, an *unofficial* source is enough -- a vendor is never forced to
// wait for a manual Admin confirmation just because the match came from the
// free fallback provider rather than an official one.
assert.match(
  submitFunction,
  /!resolvedTalukaId \|\| \(!selectedGeoLocality && \(geoStatus === "needs_review" \|\| geoStatus === "unresolved" \|\| !geoStatus\)\)/,
  "Once a locality is selected, its Taluka must be authoritative regardless of trust level -- only a Taluka with NO resolved locality at all should require a locality choice before applying.",
);
assert.doesNotMatch(
  submitFunction,
  /needs to be verified by RoyalLagn/,
  "submit-vendor-application must not reject a found locality with 'needs to be verified' wording -- only a missing Taluka or a paused toggle may block.",
);

// --- Toggle ON must auto-allow submission with zero Admin action, even ---
// --- for a brand-new PIN whose Taluka match only came from the unofficial
// --- fallback provider -- the client must never show a hard "sent for
// --- Admin review" block once a specific locality (and its Taluka) is
// --- known, only when the Taluka is genuinely disabled or truly unmapped.
const vendorLocationEditor = await read("components/locations/VendorServiceLocationEditor.tsx");
assert.match(
  vendorLocationEditor,
  /blockedMessageFor = \(/,
  "VendorServiceLocationEditor must compute the block message from the resolved locality, not the raw needs_review/ambiguous PIN status.",
);
assert.match(
  vendorLocationEditor,
  /locality\?\.taluka \?\? pinTaluka/,
  "A selected village must inherit the PIN's unique Taluka when its own row has none -- never a 'needs to be verified' dead-end for location data that was already found.",
);
assert.doesNotMatch(
  vendorLocationEditor,
  /sent for Admin review/,
  "Vendor-facing copy must never say a PIN was sent for Admin review -- that wording is a false block once a Taluka is known or can be inherited.",
);
assert.doesNotMatch(
  vendorLocationEditor,
  /needs to be verified by RoyalLagn/,
  "Vendor-facing copy must never say 'needs to be verified by RoyalLagn' once a PIN has returned localities -- that message was a false block for villages whose Taluka is already toggled ON.",
);
assert.doesNotMatch(
  vendorLocationEditor,
  /appStatus && appStatus !== "resolved_enabled" && appStatus !== "ambiguous"/,
  "Regression guard: the old blanket rule set a hard block for ANY needs_review PIN before a locality was chosen -- including the single-locality auto-select path, which never calls selectLocality() and so could never clear it. That permanently blocked Submit for a single-candidate, Taluka-enabled PIN even though the server would accept it.",
);
// A selected, unofficial-but-accepted locality is informational, not an
// error -- red alert-colored text there reads as "something's blocking me"
// to a vendor even when Submit is already enabled.
assert.match(
  vendorLocationEditor,
  /pendingMessage|pendingText/,
  "A selected locality that is merely unofficial (but its Taluka is known and accepting) must render as a neutral/informational note, not the same red alert styling used for an actual block.",
);
assert.doesNotMatch(
  vendorLocationEditor,
  /canonical hierarchy pending review/,
  "That wording reads as blocked/developer-jargon to a vendor even when they are free to continue -- use plain language that says so.",
);
// A vendor never needs to weigh official-vs-unofficial data source -- if a
// locality is shown as selectable at all, its Taluka is already known and
// accepting. That distinction is internal plumbing and must not leak into
// vendor-facing copy outside the one genuinely-official "verified" case.
assert.doesNotMatch(
  vendorLocationEditor,
  /not yet officially verified|Unofficial candidate/,
  "Vendor-facing copy must never say a selected, allowed locality is 'not officially verified' or an 'unofficial candidate' -- if it's selectable, it already works; that language only reads as a block that isn't real.",
);
// Same rule applied to COLOR, not just wording: a selected, allowed
// locality must render identically (green/verified styling) whether its
// match came from an official or unofficial source -- a vendor asking
// "why isn't mine green" is the same underlying complaint as the wording
// one above, just about color instead of text.
assert.doesNotMatch(
  vendorLocationEditor,
  /setLookupVerified\(Boolean\(locality\.trusted|setLookupVerified\(trusted\)/,
  "setLookupVerified must not depend on the locality's trust/official-source flag -- every selected, allowed locality gets the same (verified/green) styling, full stop.",
);

// --- Auto-lookup once a full PIN is typed, debounced, no double-fire -----
assert.match(
  vendorLocationEditor,
  /setTimeout\(\(\) => void lookupRef\.current\(\), 600\)/,
  "A full 6-digit PIN must trigger the lookup automatically (debounced), not require pressing Verify.",
);
assert.match(
  vendorLocationEditor,
  /lastTriggeredPincodeRef\.current === value\.pincode\) return/,
  "The auto-lookup effect must skip a PIN that's already being/been looked up, so it can't double-fire alongside the pre-filled-value hydration effect.",
);

// --- The Edge Function's deliberate HTTP 404 ("no provider has this PIN") -
// --- must not be discarded as a generic "temporarily unavailable" error --
// --- supabase-js's Functions client treats ANY non-2xx as an error, so ---
// --- the real, well-formed 404 body has to be read back out explicitly. --
// --- Supplementary-provider fallback: when the official provider finds no
// --- Taluka match at all, also try the free fallback provider's Block
// --- field before giving up -- but the resulting Taluka must stay
// --- unofficial-trust (never silently promoted to "resolved"), and the
// --- fallback must never run when the official provider already found a
// --- match, or when it IS the fallback provider already.
assert.match(
  pincodeFunction,
  /provider !== "postalpincode\.in" && findTalukaCandidateIds\(rows\)\.size === 0/,
  "The supplementary fallback must only trigger when the primary provider found zero Taluka candidates and isn't already postalpincode.in.",
);
assert.match(
  pincodeFunction,
  /talukaTrustProvider = supplementaryRows\.length > 0 && talukaCandidates\.size > 0\s*\n\s*\?\s*"postalpincode\.in"/,
  "A Taluka found only via the supplementary fallback must be scored at the fallback provider's (lower) trust, never silently inherit the primary official provider's trust.",
);
assert.match(
  pincodeFunction,
  /localityPayloadsByName/,
  "Primary and supplementary locality rows must be deduped by normalized_name before one upsert call -- the same office name appearing in both would otherwise hit the same ON CONFLICT target twice in one batch.",
);

const locationsService = await read("services/locations.ts");
assert.match(
  locationsService,
  /error instanceof FunctionsHttpError && error\.context\?\.status === 404/,
  "lookupIndianPincode must recover the Edge Function's own 404 body (a genuine 'no match found' result, not a real outage) instead of throwing a misleading 'temporarily unavailable' error for it.",
);

// --- Per-locality resolution path for a genuinely multi-Taluka PIN --------
// (Backend only -- there is no Admin UI for this; use it directly via SQL
// or a future admin tool if a PIN's localities ever need untangling.)
const localityMigration = await read(
  "supabase/migrations/20260819120000_admin_confirm_geo_pincode_locality.sql",
);
assert.match(
  localityMigration,
  /admin_confirm_geo_pincode_locality/,
  "The per-locality confirm RPC must exist -- the bulk PIN confirm intentionally refuses a genuinely multi-Taluka PIN.",
);
assert.match(
  localityMigration,
  /locality\.district_id <> taluka\.district_id/,
  "A locality must never be assigned a Taluka from a different District.",
);
assert.match(
  localityMigration,
  /perform private\.refresh_geo_pincode_aggregate\(updated\.pincode\)/,
  "Confirming one locality must recompute the PIN-level aggregate so a genuinely mixed PIN correctly becomes 'ambiguous', not silently 'resolved' to one Taluka.",
);

// --- Whole-PIN aggregate must see ALL locality evidence, not just trusted --
// --- rows, when deciding ambiguity -- a live audit found PINs marked
// --- "resolved" to one Taluka despite other, still-untrusted localities
// --- under the same PIN pointing at different Talukas entirely.
const aggregateFixMigration = await read(
  "supabase/migrations/20260819130000_geo_pincode_aggregate_full_conflict_check.sql",
);
assert.match(
  aggregateFixMigration,
  /distinct_talukas_trusted = 1 and distinct_talukas_any = 1/,
  "A PIN must only be 'resolved' when there is no conflicting Taluka evidence anywhere under it, trusted or not -- trusted-only agreement is not enough on its own.",
);
assert.match(
  aggregateFixMigration,
  /ambiguous = distinct_talukas_any > 1/,
  "The ambiguous flag must reflect ANY conflicting Taluka evidence (trusted or not), not just conflicts among already-trusted rows.",
);
assert.match(
  aggregateFixMigration,
  /create or replace function public\.refresh_geo_pincode_aggregate\(target_pincode text\)/,
  "A public wrapper must exist so the Edge Function (over PostgREST, which never exposes the `private` schema) can call the same canonical aggregate the Admin RPCs use.",
);

// --- The live Edge Function must use that SAME canonical aggregate, not ---
// --- its own separate ambiguity computation -- otherwise the two paths ---
// --- silently drift apart again the next time this code changes. ---------
assert.match(
  pincodeFunction,
  /service\.rpc\("refresh_geo_pincode_aggregate", \{ target_pincode: pincode \}\)/,
  "resolveGeoHierarchy must reconcile through the canonical refresh_geo_pincode_aggregate RPC before returning, not just its own single-provider-response computation.",
);
assert.doesNotMatch(
  pincodeFunction,
  /supported: resolution_status === "resolved"/,
  "Regression guard: the final response must use the freshly re-read/reconciled resolution_status, not the pre-aggregate local variable computed before the full-picture reconciliation ran.",
);

const inheritMigration = await read(
  "supabase/migrations/20260819150000_jaoli_jawali_alias_and_inherit_pin_taluka.sql",
);
assert.match(
  inheritMigration,
  /Jawali/,
  "Jaoli must accept the Jawali Block spelling used by India Post, or Satara village PINs stay taluka-less even after a successful lookup.",
);
assert.match(
  inheritMigration,
  /pin\.taluka_id is not null/,
  "Village offices with a blank Block must inherit the PIN's unique Taluka in a one-time backfill, not wait for each vendor to re-lookup.",
);

console.log("geo-pincode-taluka-mapping: all guards passed.");
