import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PostalRecord = {
  pincode: string;
  officeName: string;
  area: string;
  city: string;
  district: string;
  state: string;
  raw: unknown;
};

// ============================================================================
// Provider source precedence (P1-2).
//
// data.gov.in / India Post's official PIN-code directory
// (https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month)
// is the authoritative source. postalpincode.in is retained purely for
// availability (it needs no API key and has no rate limit issues in this
// environment) but is NOT a Government source -- a Taluka match found only
// through it is never silently promoted to "resolved" the way an official
// match is. It is cached as "needs_review" instead, unless an existing
// cache entry already carries an official (or Admin-verified) match to the
// *same* Taluka, which counts as corroboration.
// ============================================================================
const PROVIDER_TRUST: Record<string, number> = {
  "admin_verified": 4,
  "data.gov.in": 3,
  "india_post_ogd": 3,
  "postalpincode.in": 1,
};
const OFFICIAL_TRUST_THRESHOLD = 2;
const trustOf = (provider: string) => PROVIDER_TRUST[provider] ?? 0;

// A cached PIN resolution is treated as stale after this many days and is
// re-fetched live rather than trusted blindly, even if it was previously
// "resolved". Keeps the geo hierarchy in sync as official data gets
// imported/corrected over time without requiring a manual cache-bust.
const PIN_CACHE_STALE_DAYS = 180;

const normalize = (value: unknown) => String(value ?? "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ");

// A post office's own name often IS its Taluka's name -- e.g. "Indapur
// S.O." / "Indapur Bazar S.O." is the Taluka headquarters office for
// Indapur -- but the provider's separate Taluka/Block field is frequently
// blank for exactly these rows (common for Sub/Branch/Head Post Offices).
// Stripping the standard Indian postal designator suffix before matching
// against known Taluka names/aliases recovers that match instead of
// leaving the whole PIN "unresolved" for want of an explicit Block field.
// Mirrors private.strip_post_office_suffix() in
// 20260819110000_taluka_match_from_office_name_fallback.sql -- keep both in
// sync if this pattern changes.
const stripPostOfficeSuffix = (value: string) => value
  .replace(
    /\s*[([]?\b(S\.?\s*O\.?|B\.?\s*O\.?|H\.?\s*O\.?|G\.?\s*P\.?\s*O\.?|Sub\s+Post\s+Office|Branch\s+Post\s+Office|Head\s+Post\s+Office|Sub\s+Office|Branch\s+Office|Head\s+Office)\b[)\]]?\s*$/gi,
    "",
  )
  .trim();

// data.gov.in resource API responses describe their own schema in a `field`
// array (e.g. [{ id: "officename", name: "Office Name", type: "keyword" }, ...]).
// Field ids vary between pincode-directory resources (e.g. "taluk" vs
// "taluka" vs "block", "statename" vs "state"), so this reads that metadata
// live instead of assuming one fixed set of field ids -- the safe way to
// avoid silently mismatching a resource whose exact schema wasn't inspected
// ahead of time. Falls back to the previous best-guess id list when the API
// doesn't return `field` metadata at all (some resources omit it).
type DataGovField = { id?: unknown; name?: unknown };

function buildDataGovFieldIndex(fields: DataGovField[]): Record<string, string | null> {
  const byId = new Map(
    fields
      .map((field) => String(field?.id ?? "").trim())
      .filter(Boolean)
      .map((id) => [id.toLowerCase(), id] as const),
  );
  const pick = (...candidates: string[]) => {
    for (const candidate of candidates) {
      const hit = byId.get(candidate.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };
  return {
    pincode: pick("pincode", "pin_code", "pin"),
    officename: pick("officename", "office_name", "office"),
    taluk: pick("taluk", "taluka", "block", "subdistrict", "sub_district", "mandal"),
    district: pick("district", "districtname", "district_name"),
    state: pick("statename", "state_name", "state"),
    officetype: pick("officetype", "office_type"),
    delivery: pick("deliverystatus", "delivery_status", "delivery"),
  };
}

/** Best-guess fallback field ids, used only when the API response carries no
 * `field` metadata to build a real index from. */
const DATA_GOV_FALLBACK_FIELD_IDS = {
  pincode: "pincode",
  officename: "officename",
  taluk: "taluk",
  district: "district",
  state: "statename",
  officetype: "officetype",
  delivery: "deliverystatus",
};

const readField = (record: any, fieldId: string | null, ...legacyFallbacks: string[]) => {
  if (fieldId && record?.[fieldId] !== undefined && record?.[fieldId] !== null) {
    return String(record[fieldId]).trim();
  }
  for (const legacy of legacyFallbacks) {
    if (record?.[legacy] !== undefined && record?.[legacy] !== null) return String(record[legacy]).trim();
  }
  return "";
};

/** Server-log-only diagnostics (Supabase function logs), never returned to
 * the client and never containing the API key or resource id's secret
 * value -- just enough to tell, from the logs, *why* a lookup fell back to
 * the unofficial provider. */
function logDataGovDiagnostic(reason: string, extra?: Record<string, unknown>) {
  console.warn(`[lookup-india-pincode] data.gov.in: ${reason}`, extra ?? {});
}

async function lookupWithDataGov(pincode: string): Promise<PostalRecord[]> {
  const apiKey = Deno.env.get("DATA_GOV_IN_API_KEY");
  const resourceId = Deno.env.get("DATA_GOV_IN_PINCODE_RESOURCE_ID");
  if (!apiKey || !resourceId) {
    logDataGovDiagnostic("not configured (missing API key or resource id) -- using fallback provider");
    return [];
  }
  const url = new URL(`https://api.data.gov.in/resource/${resourceId}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "50");
  url.searchParams.set("filters[pincode]", pincode);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    logDataGovDiagnostic("provider HTTP error", { status: response.status });
    throw new Error("The configured PIN-code provider is unavailable");
  }
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object") {
    logDataGovDiagnostic("provider returned a non-JSON/empty body");
    return [];
  }
  // The API returns HTTP 200 even for an invalid api-key or unknown
  // resource id -- it signals the real problem via `status`/`message`
  // instead, so an "ok" HTTP response is never enough on its own to trust
  // the payload.
  if (body.status && String(body.status).toLowerCase() !== "ok") {
    logDataGovDiagnostic("provider reported a non-ok status", { status: body.status, message: body.message });
    return [];
  }
  const declaredFields: DataGovField[] = Array.isArray(body.field) ? body.field : [];
  const index = declaredFields.length ? buildDataGovFieldIndex(declaredFields) : null;
  if (!index) {
    logDataGovDiagnostic("no field metadata in response -- using best-guess field ids");
  }
  const fieldIds = index ?? DATA_GOV_FALLBACK_FIELD_IDS;

  const rawRecords = Array.isArray(body.records) ? body.records : [];
  if (!rawRecords.length) {
    logDataGovDiagnostic("provider returned zero records for this PIN code", { pincode });
    return [];
  }

  const rows = rawRecords
    .map((record: any): PostalRecord => ({
      pincode,
      officeName: readField(record, fieldIds.officename, "officename", "office_name"),
      area: readField(record, fieldIds.taluk, "taluk", "block")
        || readField(record, fieldIds.officename, "officename"),
      city: readField(record, fieldIds.district, "district", "districtname")
        || readField(record, fieldIds.taluk, "taluk"),
      district: readField(record, fieldIds.district, "district", "districtname"),
      state: readField(record, fieldIds.state, "statename", "state"),
      raw: record,
    }))
    // A record missing both a name and a district is malformed for our
    // purposes -- never trusted as a real match (P: "a successful HTTP
    // response with malformed/empty records is not a trusted match").
    .filter((row) => row.officeName || row.district);

  if (!rows.length) {
    logDataGovDiagnostic("provider records had no usable officename/district field -- field mapping likely stale", {
      sampleKeys: Object.keys(rawRecords[0] ?? {}),
    });
  }
  return rows;
}

async function lookupWithPostalPincode(pincode: string): Promise<PostalRecord[]> {
  const configuredBase = Deno.env.get("PINCODE_API_BASE_URL")?.replace(/\/$/, "")
    ?? "https://api.postalpincode.in/pincode";
  const response = await fetch(`${configuredBase}/${pincode}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("The PIN-code lookup provider is unavailable");
  const body = await response.json();
  const envelope = Array.isArray(body) ? body[0] : body;
  if (String(envelope?.Status ?? "").toLowerCase() !== "success") return [];
  return (Array.isArray(envelope?.PostOffice) ? envelope.PostOffice : []).map((record: any) => ({
    pincode,
    officeName: String(record.Name ?? "").trim(),
    area: String(record.Block ?? record.Name ?? "").trim(),
    city: String(record.District ?? record.Division ?? "").trim(),
    district: String(record.District ?? "").trim(),
    state: String(record.State ?? "").trim(),
    raw: record,
  }));
}

async function providerLookup(pincode: string) {
  let dataGovRows: PostalRecord[] = [];
  try {
    dataGovRows = await lookupWithDataGov(pincode);
  } catch (error) {
    // Availability fallback only. postalpincode.in results stay
    // `needs_review`, so an official-provider outage can never silently
    // create a canonical Taluka assignment.
    console.warn("Official PIN-code provider unavailable; using review-only fallback", error);
  }
  return dataGovRows.length ? { provider: "data.gov.in", rows: dataGovRows } : {
    provider: "postalpincode.in",
    rows: await lookupWithPostalPincode(pincode),
  };
}

// ============================================================================
// Vendor-application authorization outcome (P: "one clear, consistent
// outcome" -- never a Taluka candidate offered alongside a message that
// contradicts it). This is the single source of truth both this function's
// caller-facing response AND submit-vendor-application key off of, so the
// early client-side warning and the server-side enforcement can never drift
// apart into two different opinions about the same PIN.
//
//   resolved_enabled  -- a Taluka match exists (official or unofficial) and
//                         accept_vendor_applications = true. The Admin
//                         toggle is the only vendor-facing gate -- source
//                         trust never blocks an application.
//   resolved_disabled -- same match, but the Admin has paused new
//                         applications from this Taluka specifically.
//   ambiguous         -- more than one candidate Taluka under this PIN;
//                         the caller must choose a locality before any
//                         decision can be made.
//   needs_review      -- kept for PIN-cache provenance only; vendor apply
//                         does not use this as a hard block once a Taluka
//                         is known and accepting.
//   unresolved        -- no Taluka candidate at all (a true blank). The
//                         only case with nothing to toggle ON.
// ============================================================================
type ApplicationStatus = "resolved_enabled" | "resolved_disabled" | "ambiguous" | "needs_review" | "unresolved";

function computeApplicationOutcome(input: {
  talukaId: string | null;
  talukaName: string | null;
  acceptingApplications: boolean | null;
  ambiguous: boolean;
  resolutionStatus: GeoResolution["status"];
}): { applicationStatus: ApplicationStatus; applicationMessage: string | null } {
  if (input.ambiguous) {
    return {
      applicationStatus: "ambiguous",
      applicationMessage: "Multiple localities match this PIN code. Choose the post office or locality that matches the business address before applying.",
    };
  }
  if (!input.talukaId || input.resolutionStatus === "unresolved") {
    return {
      applicationStatus: "unresolved",
      applicationMessage: "This PIN code isn't yet mapped to a Taluka RoyalLagn recognizes. Try another PIN, or pick a locality if one is listed.",
    };
  }
  if (input.acceptingApplications === false) {
    return {
      applicationStatus: "resolved_disabled",
      applicationMessage: `RoyalLagn is not currently accepting new vendor applications from ${input.talukaName}.`,
    };
  }
  return { applicationStatus: "resolved_enabled", applicationMessage: null };
}

type GeoResolution = {
  supported: boolean;
  status: "resolved" | "needs_review" | "unresolved";
  state: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
  taluka: { id: string; name: string; acceptingApplications?: boolean } | null;
  ambiguous: boolean;
  sourceTrust: "official" | "unofficial_pending_review" | "admin_verified" | "none";
  localities: GeoLocality[];
  localitySelectionRequired: boolean;
  /** The authoritative "can a vendor apply from here" decision -- see
   * computeApplicationOutcome above. Always present, never null. */
  applicationStatus: ApplicationStatus;
  applicationMessage: string | null;
};

type GeoLocality = {
  id: string;
  name: string;
  officeType: string | null;
  deliveryStatus: string | null;
  trusted: boolean;
  source: string;
  state: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
  taluka: { id: string; name: string } | null;
  /** Locality-level lat/lng, when the source row has it -- lets a GPS-based
   * "near me" caller resolve a PIN-fallback origin point without a second
   * round trip. Absent (null) for older cached rows resolved before this
   * column was selected here. */
  latitude: number | null;
  longitude: number | null;
};

const firstRelation = (value: any) => Array.isArray(value) ? value[0] ?? null : value ?? null;
const localityFromRow = (row: any): GeoLocality => ({
  id: String(row.id),
  name: String(row.locality_name),
  officeType: row.office_type ?? null,
  deliveryStatus: row.delivery_status ?? null,
  trusted: Boolean(row.is_trusted),
  source: String(row.source ?? ""),
  state: firstRelation(row.geo_states),
  district: firstRelation(row.geo_districts),
  taluka: (() => {
    const taluka = firstRelation(row.geo_talukas);
    return taluka ? {
      id: String(taluka.id),
      name: String(taluka.name),
      acceptingApplications: Boolean(taluka.accept_vendor_applications),
    } : null;
  })(),
  latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
  longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
});

/**
 * Different providers describe the SAME real post office differently -- an
 * official India Post import row named "Bhigwan S.O." (trusted, but its
 * Block/Taluka field was blank) and a postalpincode.in row named plain
 * "Bhigwan" (untrusted, but it DOES carry a Taluka) both land in
 * geo_pincode_localities as separate rows, because their normalized_name
 * differs. Left as-is, a vendor sees "Bhigwan" and "Bhigwan S.O." as two
 * different villages to choose from -- picking the one that happens to have
 * no Taluka attached dead-ends them with "needs to be verified", even
 * though the identical real place, listed right next to it, already works.
 * This merges any such pair (matched by suffix-stripped normalized name)
 * into one option: whichever row actually carries a Taluka wins (since
 * that's what lets a vendor apply at all), borrowing office-type/delivery
 * metadata and the more descriptive name from its sibling when useful.
 */
function pinTalukaFromRow(taluka: any): GeoLocality["taluka"] {
  if (!taluka) return null;
  return {
    id: String(taluka.id),
    name: String(taluka.name),
    acceptingApplications: Boolean(taluka.accept_vendor_applications),
  };
}

/** Village B.O./S.O. rows often have a blank Block field even when the PIN
 * as a whole uniquely resolves to one Taluka (the headquarters office, or
 * the supplementary provider's Block). Attaching that unique PIN Taluka to
 * every still-unmapped locality under the same PIN is what lets a vendor
 * pick "Asani B.O." and apply when Jaoli/Jawali is already toggled ON,
 * instead of dead-ending on a false "needs to be verified" block. Never
 * applied when the PIN is ambiguous -- each locality keeps its own Taluka. */
function inheritUniquePinTaluka(
  localities: GeoLocality[],
  pinTaluka: GeoLocality["taluka"],
  ambiguous: boolean,
): GeoLocality[] {
  if (ambiguous || !pinTaluka) return localities;
  return localities.map((item) => item.taluka ? item : { ...item, taluka: pinTaluka });
}

function dedupeLocalitiesBySamePlace(localities: GeoLocality[]): GeoLocality[] {
  const groups = new Map<string, GeoLocality[]>();
  for (const locality of localities) {
    const key = normalize(stripPostOfficeSuffix(locality.name)) || normalize(locality.name);
    const group = groups.get(key);
    if (group) group.push(locality); else groups.set(key, [locality]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const withTaluka = group.filter((item) => item.taluka);
    const winner = withTaluka.find((item) => item.trusted) ?? withTaluka[0]
      ?? group.find((item) => item.trusted) ?? group[0];
    const metadataSource = group.find((item) => item.officeType) ?? winner;
    const mostDescriptiveName = group.reduce((a, b) => (b.name.length > a.name.length ? b : a));
    return {
      ...winner,
      name: mostDescriptiveName.name,
      officeType: winner.officeType ?? metadataSource.officeType,
      deliveryStatus: winner.deliveryStatus ?? metadataSource.deliveryStatus,
    };
  });
}

async function listCachedLocalities(service: ReturnType<typeof createClient>, pincode: string) {
  const { data, error } = await service
    .from("geo_pincode_localities")
    .select("id,locality_name,office_type,delivery_status,is_trusted,source,latitude,longitude,geo_states(id,name),geo_districts(id,name),geo_talukas(id,name,accept_vendor_applications)")
    .eq("pincode", pincode)
    .eq("is_active", true)
    .order("is_trusted", { ascending: false })
    .order("locality_name");
  // Backward-compatible during deployment ordering: the Edge Function can
  // still return the PIN result before the locality migration is applied.
  if (error && /geo_pincode_localities|schema cache|PGRST205|42P01/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) return [];
  if (error) throw error;
  return dedupeLocalitiesBySamePlace((data ?? []).map(localityFromRow));
}

type ExistingCacheRow = {
  taluka_id: string | null;
  resolution_status: string;
  source: string;
};

/**
 * Upserts a geo_pincodes row honoring source precedence: a lower-trust
 * provider is never allowed to downgrade or overwrite an existing row that
 * was already resolved by an equal-or-higher-trust source. If the write is
 * skipped for that reason, the existing (higher-trust) row is returned
 * as-is so the caller's response still reflects the *authoritative* state.
 */
async function upsertGeoPincodeWithPrecedence(
  service: ReturnType<typeof createClient>,
  pincode: string,
  provider: string,
  patch: {
    state_id: string | null;
    district_id: string | null;
    taluka_id: string | null;
    area: string | null;
    office_name: string | null;
    ambiguous: boolean;
    raw_response: unknown;
  },
  /** Overrides which trust level decides "resolved" vs "needs_review",
   * without changing the `source` column value (still `provider`). Used
   * when the Taluka match itself came from a supplementary fallback
   * provider (e.g. postalpincode.in) even though State/District came from
   * a higher-trust one -- the field values are still the best available,
   * but the overall resolution must stay conservative about a Taluka that
   * wasn't actually confirmed by the trusted source. */
  talukaTrustProvider: string = provider,
): Promise<{ resolution_status: GeoResolution["status"]; skippedAsLowerTrust: boolean }> {
  const { data: existing, error: existingError } = await service
    .from("geo_pincodes")
    .select("taluka_id,resolution_status,source")
    .eq("pincode", pincode)
    .maybeSingle<ExistingCacheRow>();
  if (existingError) throw existingError;

  const newTrust = trustOf(talukaTrustProvider);
  const existingTrust = existing ? trustOf(existing.source) : -1;
  const existingIsResolved = existing?.resolution_status === "resolved";

  if (existingIsResolved && existingTrust > newTrust) {
    // A higher-authority source already resolved this PIN; a lower-trust
    // provider's result must not overwrite it (P1-2: "never overwrite an
    // official verified result with lower-authority data").
    return { resolution_status: existing!.resolution_status as GeoResolution["status"], skippedAsLowerTrust: true };
  }

  // Corroboration: this exact same Taluka was already independently
  // resolved by an equal-or-higher-trust source -- safe to keep/confirm as
  // resolved even if the *current* lookup's provider is unofficial.
  const corroborated = Boolean(
    patch.taluka_id
    && existing?.taluka_id === patch.taluka_id
    && existingTrust >= OFFICIAL_TRUST_THRESHOLD,
  );

  const officialMatch = patch.taluka_id && !patch.ambiguous
    && (newTrust >= OFFICIAL_TRUST_THRESHOLD || corroborated);
  const resolution_status: GeoResolution["status"] = !patch.taluka_id
    ? (patch.district_id ? "needs_review" : "unresolved")
    : patch.ambiguous
      ? "needs_review"
      : officialMatch
        ? "resolved"
        : "needs_review";

  const { error: upsertError } = await service.from("geo_pincodes").upsert({
    pincode,
    state_id: patch.state_id,
    district_id: patch.district_id,
    // Keep a single unofficial candidate for Admin review, but the
    // resolution_status remains needs_review and the vendor resolver never
    // copies this candidate into vendors.geo_taluka_id until confirmed.
    taluka_id: patch.taluka_id,
    area: patch.area,
    office_name: patch.office_name,
    resolution_status,
    ambiguous: patch.ambiguous,
    source: provider,
    raw_response: patch.raw_response,
    verified_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;

  return { resolution_status, skippedAsLowerTrust: false };
}

/**
 * Resolves the generic State -> District -> Taluka hierarchy from the same
 * postal provider rows already fetched for the legacy City/Area lookup, and
 * caches the result in geo_pincodes (honoring source precedence -- see
 * upsertGeoPincodeWithPrecedence). This never invents data: a Taluka is
 * only ever recorded via geo_talukas rows imported through the official
 * import pipeline (see docs/locations-import.md); if a matching District or
 * Taluka has not been imported yet, the PIN is cached as
 * "needs_review"/"unresolved" instead of guessing. Taluka names are matched
 * against both the canonical name and any recorded spelling aliases (e.g.
 * "Velhe" for the canonical "Velha", "Rajgurunagar" for "Khed").
 */
async function resolveGeoHierarchy(
  service: ReturnType<typeof createClient>,
  pincode: string,
  rows: PostalRecord[],
  provider: string,
): Promise<GeoResolution> {
  // Deliberately does NOT filter state/district/taluka by is_active here.
  // is_active means "publicly discoverable in manual search" -- a District
  // or Taluka can be real, imported, and pending Admin review (is_active =
  // false) while still needing to *resolve* so its own independent
  // accept_vendor_applications can be checked and its Admin-review PIN
  // queue can populate correctly. Filtering resolution by is_active would
  // make a hidden-but-real Taluka indistinguishable from one that was never
  // imported at all -- exactly the "one field, two responsibilities" bug
  // this whole feature exists to eliminate.
  const raw_response = { records: rows.map((row) => row.raw) };
  const { data: states, error: statesError } = await service
    .from("geo_states")
    .select("id,name");
  if (statesError) throw statesError;
  const stateRow = rows
    .map((row) => (states ?? []).find((item: any) => normalize(item.name) === normalize(row.state)))
    .find(Boolean) ?? null;

  if (!stateRow) {
    await upsertGeoPincodeWithPrecedence(service, pincode, provider, {
      state_id: null,
      district_id: null,
      taluka_id: null,
      area: rows[0]?.area || rows[0]?.officeName || null,
      office_name: rows[0]?.officeName || null,
      ambiguous: false,
      raw_response,
    });
    return {
      supported: false, status: "unresolved", state: null, district: null, taluka: null,
      ambiguous: false, sourceTrust: "none", localities: [], localitySelectionRequired: false,
      applicationStatus: "unresolved",
      applicationMessage: "This PIN code isn't yet mapped to a Taluka RoyalLagn recognizes.",
    };
  }

  const { data: districts, error: districtsError } = await service
    .from("geo_districts")
    .select("id,name")
    .eq("state_id", stateRow.id);
  if (districtsError) throw districtsError;
  const districtRow = rows
    .map((row) => (districts ?? []).find((item: any) => normalize(item.name) === normalize(row.district)))
    .find(Boolean) ?? null;

  if (!districtRow) {
    await upsertGeoPincodeWithPrecedence(service, pincode, provider, {
      state_id: stateRow.id,
      district_id: null,
      taluka_id: null,
      area: rows[0]?.area || rows[0]?.officeName || null,
      office_name: rows[0]?.officeName || null,
      ambiguous: false,
      raw_response,
    });
    return {
      supported: false, status: "unresolved", state: stateRow, district: null, taluka: null,
      ambiguous: false, sourceTrust: "none", localities: [], localitySelectionRequired: false,
      applicationStatus: "unresolved",
      applicationMessage: "This PIN code isn't yet mapped to a Taluka RoyalLagn recognizes.",
    };
  }

  const { data: talukas, error: talukasError } = await service
    .from("geo_talukas")
    .select("id,name,aliases,accept_vendor_applications")
    .eq("district_id", districtRow.id);
  if (talukasError) throw talukasError;
  const talukaNameMatches = (taluka: any, candidate: string) =>
    normalize(taluka.name) === normalize(candidate)
    || (Array.isArray(taluka.aliases) && taluka.aliases.some((alias: string) => normalize(alias) === normalize(candidate)));
  // Every post office row under this PIN that resolves to a Taluka. Tries
  // the explicit area/Block field first, then falls back to the office's
  // own name with its postal-designator suffix stripped (see
  // stripPostOfficeSuffix above) -- covers a Taluka headquarters office
  // whose Block field the provider left blank.
  const findTalukaCandidateIds = (fromRows: PostalRecord[]) => new Set(
    fromRows
      .flatMap((row) => [row.area, row.officeName, stripPostOfficeSuffix(row.officeName)])
      .map((candidate) => (talukas ?? []).find((item: any) => talukaNameMatches(item, candidate)))
      .filter(Boolean)
      .map((item: any) => item.id),
  );

  // The official provider (data.gov.in) frequently has no Taluka/Block
  // field at all for a cluster of offices whose own names don't happen to
  // match their Taluka's name either -- e.g. "Medha S.O." is the real
  // headquarters office of Jaoli Taluka, but the office is named after the
  // town, not the Taluka, so neither the Block field nor the office-name
  // fallback above can find it. When the primary provider's own rows yield
  // zero Taluka matches, also try postalpincode.in's Block field as a
  // supplementary signal -- its locality rows are still recorded (and stay
  // untrusted, exactly like any other unofficial-source locality, never
  // silently promoted) rather than the whole PIN staying unresolved
  // forever for want of a field the official source simply doesn't carry.
  // Never used when the primary provider already found a match, and never
  // applied when the primary provider already IS postalpincode.in (nothing
  // left to fall back to).
  let supplementaryRows: PostalRecord[] = [];
  if (provider !== "postalpincode.in" && findTalukaCandidateIds(rows).size === 0) {
    try {
      supplementaryRows = await lookupWithPostalPincode(pincode);
    } catch {
      // Best-effort only -- proceed with just the primary rows.
    }
  }

  const talukaCandidates = findTalukaCandidateIds([...rows, ...supplementaryRows]);
  const ambiguous = talukaCandidates.size > 1;
  const talukaRow = talukaCandidates.size === 1
    ? (talukas ?? []).find((item: any) => item.id === [...talukaCandidates][0])
    : null;
  // A Taluka found ONLY via the supplementary fallback is unofficial
  // evidence even though State/District came from the official provider --
  // the overall resolution must stay conservative ("needs_review"), the
  // same way a lone postalpincode.in match always has: a real, selectable
  // candidate, but never auto-promoted to "resolved" without Admin
  // confirmation or independent corroboration.
  const talukaTrustProvider = supplementaryRows.length > 0 && talukaCandidates.size > 0
    ? "postalpincode.in"
    : provider;

  const { resolution_status } = await upsertGeoPincodeWithPrecedence(service, pincode, provider, {
    state_id: stateRow.id,
    district_id: districtRow.id,
    taluka_id: talukaRow?.id ?? null,
    area: rows.length === 1 ? rows[0]?.area || rows[0]?.officeName || null : null,
    office_name: rows.length === 1 ? rows[0]?.officeName || null : null,
    ambiguous,
    raw_response,
  }, talukaTrustProvider);

  const { data: existingLocalityRows, error: existingLocalityError } = await service
    .from("geo_pincode_localities")
    .select("normalized_name,source_trust,admin_confirmed")
    .eq("pincode", pincode);
  if (existingLocalityError && !/geo_pincode_localities|schema cache|PGRST205|42P01/i.test(`${existingLocalityError.code ?? ""} ${existingLocalityError.message ?? ""}`)) {
    throw existingLocalityError;
  }
  const existingByName = new Map((existingLocalityRows ?? []).map((item: any) => [item.normalized_name, item]));
  const buildLocalityPayloads = (fromRows: PostalRecord[], forProvider: string) => {
    const forProviderTrust = trustOf(forProvider);
    const forTrusted = forProviderTrust >= OFFICIAL_TRUST_THRESHOLD;
    return fromRows
      .filter((row) => row.officeName.trim())
      .map((row) => {
        const matchedTaluka = (talukas ?? []).find((item: any) =>
          [row.area, row.officeName, stripPostOfficeSuffix(row.officeName)].some((candidate) => talukaNameMatches(item, candidate))
        ) ?? null;
        const raw = row.raw as any;
        const normalizedName = normalize(row.officeName);
        const existing = existingByName.get(normalizedName) as any;
        if (existing?.admin_confirmed || Number(existing?.source_trust ?? 0) > forProviderTrust) return null;
        return {
          pincode,
          locality_name: row.officeName,
          normalized_name: normalizedName,
          office_type: raw?.officetype ?? raw?.officeType ?? raw?.BranchType ?? null,
          delivery_status: raw?.deliverystatus ?? raw?.delivery ?? raw?.DeliveryStatus ?? null,
          state_id: stateRow.id,
          district_id: districtRow.id,
          taluka_id: matchedTaluka?.id ?? (ambiguous ? null : talukaRow?.id) ?? null,
          source: forProvider,
          source_trust: forProviderTrust,
          is_trusted: forTrusted,
          admin_confirmed: false,
          is_active: true,
          raw_response: raw ?? {},
          verified_at: new Date().toISOString(),
        };
      }).filter(Boolean);
  };
  // Deduped by normalized_name (primary and supplementary rows can name the
  // exact same office) so a single upsert call never targets the same
  // conflict key twice -- keeps whichever copy has the higher trust.
  const localityPayloadsByName = new Map<string, any>();
  for (const payload of [
    ...buildLocalityPayloads(rows, provider),
    ...buildLocalityPayloads(supplementaryRows, "postalpincode.in"),
  ]) {
    const current = localityPayloadsByName.get((payload as any).normalized_name);
    if (!current || (payload as any).source_trust > current.source_trust) {
      localityPayloadsByName.set((payload as any).normalized_name, payload);
    }
  }
  const localityPayloads = [...localityPayloadsByName.values()];
  if (localityPayloads.length) {
    const { error: localitiesError } = await service
      .from("geo_pincode_localities")
      .upsert(localityPayloads, { onConflict: "pincode,normalized_name" });
    if (localitiesError && !/geo_pincode_localities|schema cache|PGRST205|42P01/i.test(`${localitiesError.code ?? ""} ${localitiesError.message ?? ""}`)) {
      throw localitiesError;
    }
  }
  // Canonical reconciliation: recomputes resolution_status/ambiguous/
  // taluka_id/locality counts from the FULL accumulated
  // geo_pincode_localities picture for this PIN (every provider that has
  // ever written a row here), not just the rows this one live call
  // happened to fetch. This is the same function Admin actions
  // (admin_confirm_geo_pincode / admin_confirm_geo_pincode_locality) use --
  // a single canonical source of truth so the two paths can never drift
  // apart (see 20260819130000_geo_pincode_aggregate_full_conflict_check.sql
  // for why that drift was a real, found bug: a PIN could show "resolved"
  // to one Taluka while other, still-untrusted localities under the same
  // PIN pointed at different Talukas entirely).
  const { error: aggregateError } = await service.rpc("refresh_geo_pincode_aggregate", { target_pincode: pincode });
  if (aggregateError && !/schema cache|PGRST202|42883/i.test(`${aggregateError.code ?? ""} ${aggregateError.message ?? ""}`)) {
    throw aggregateError;
  }

  // Re-read what actually landed (precedence rules above may have kept an
  // existing higher-trust row instead of this lookup's own result).
  const { data: finalRow, error: finalRowError } = await service
    .from("geo_pincodes")
    .select("taluka_id,district_id,state_id,resolution_status,ambiguous,source")
    .eq("pincode", pincode)
    .maybeSingle();
  if (finalRowError) throw finalRowError;
  if (!finalRow) throw new Error("The canonical PIN-code cache could not be read after update");
  const finalAmbiguous = Boolean(finalRow?.ambiguous);
  if (finalRow.taluka_id && !finalAmbiguous) {
    const { error: inheritError } = await service
      .from("geo_pincode_localities")
      .update({ taluka_id: finalRow.taluka_id })
      .eq("pincode", pincode)
      .is("taluka_id", null)
      .eq("admin_confirmed", false);
    if (inheritError && !/geo_pincode_localities|schema cache|PGRST205|42P01|admin_confirmed/i.test(`${inheritError.code ?? ""} ${inheritError.message ?? ""}`)) {
      throw inheritError;
    }
  }

  const listedLocalities = await listCachedLocalities(service, pincode);
  const trustedLocalities = listedLocalities.filter((item) => item.trusted);
  const finalTaluka = finalRow?.taluka_id
    ? (talukas ?? []).find((item: any) => item.id === finalRow.taluka_id) ?? null
    : null;
  const pinTaluka = pinTalukaFromRow(finalTaluka);
  const localities = inheritUniquePinTaluka(listedLocalities, pinTaluka, finalAmbiguous);

  // The canonical resolution_status is whatever refresh_geo_pincode_aggregate
  // just recomputed from the FULL locality picture above -- never the
  // pre-aggregate `resolution_status` local (that reflected only this one
  // live call's own provider rows, before accumulated conflicts elsewhere
  // under the same PIN were reconciled in).
  const finalResolutionStatus = (finalRow?.resolution_status as GeoResolution["status"] | undefined) ?? resolution_status;
  // finalTaluka can be null even when finalRow.taluka_id is set, in the rare
  // case source precedence kept an existing cache row whose Taluka isn't in
  // this District's own candidate list -- fail closed (treat as unresolved)
  // rather than guessing an accept_vendor_applications value we don't have.
  const { applicationStatus, applicationMessage } = computeApplicationOutcome({
    talukaId: pinTaluka?.id ?? null,
    talukaName: pinTaluka?.name ?? null,
    acceptingApplications: pinTaluka ? Boolean(pinTaluka.acceptingApplications) : null,
    ambiguous: finalAmbiguous,
    resolutionStatus: finalRow?.taluka_id && !finalTaluka ? "unresolved" : finalResolutionStatus,
  });

  return {
    supported: finalResolutionStatus === "resolved",
    status: finalResolutionStatus,
    state: stateRow,
    district: districtRow,
    taluka: pinTaluka,
    ambiguous: finalAmbiguous,
    sourceTrust: finalRow?.source === "admin_verified"
      ? "admin_verified"
      : trustOf(finalRow?.source ?? provider) >= OFFICIAL_TRUST_THRESHOLD
        ? "official"
        : "unofficial_pending_review",
    localities,
    localitySelectionRequired: trustedLocalities.length > 1 || (!trustedLocalities.length && localities.length > 1),
    applicationStatus,
    applicationMessage,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const pincode = String(body?.pincode ?? "").trim();
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return Response.json({ error: "Enter a valid six-digit Indian PIN code" }, { status: 400, headers: cors });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // The geo (State/District/Taluka) cache is keyed the same way as the
    // legacy supported_pincodes cache, and both are refreshed together
    // whenever a live provider lookup happens below.
    const { data: cachedGeoRow, error: cachedGeoError } = await service
      .from("geo_pincodes")
      .select("state_id,district_id,taluka_id,resolution_status,ambiguous,source,verified_at,geo_states(id,name),geo_districts(id,name),geo_talukas(id,name,accept_vendor_applications)")
      .eq("pincode", pincode)
      .maybeSingle();
    if (cachedGeoError) throw cachedGeoError;
    // "Fresh" only ever short-circuits a live re-lookup for a PIN that was
    // already resolved by a trusted source (official provider or Admin).
    // A needs_review/unresolved row must always be retried live -- otherwise,
    // the moment the official provider starts working (e.g. an API key gets
    // configured), every PIN that was ever cached via the unofficial
    // fallback would stay stuck showing "needs Admin review" for up to
    // PIN_CACHE_STALE_DAYS, since nothing would ever ask the now-working
    // official provider again.
    const geoCacheIsFresh = Boolean(
      cachedGeoRow?.resolution_status === "resolved"
      && cachedGeoRow?.verified_at
      && (Date.now() - new Date(cachedGeoRow.verified_at).getTime()) < PIN_CACHE_STALE_DAYS * 86_400_000,
    );
    const cachedLocalities = cachedGeoRow ? await listCachedLocalities(service, pincode) : [];
    const geoFromCache = (row: typeof cachedGeoRow): GeoResolution | null => {
      if (!row) return null;
      const state = Array.isArray(row.geo_states) ? row.geo_states[0] : row.geo_states;
      const district = Array.isArray(row.geo_districts) ? row.geo_districts[0] : row.geo_districts;
      const taluka = Array.isArray(row.geo_talukas) ? row.geo_talukas[0] : row.geo_talukas;
      const status = row.resolution_status as GeoResolution["status"];
      const pinTaluka = pinTalukaFromRow(taluka);
      const ambiguous = Boolean(row.ambiguous);
      const { applicationStatus, applicationMessage } = computeApplicationOutcome({
        talukaId: pinTaluka?.id ?? null,
        talukaName: pinTaluka?.name ?? null,
        acceptingApplications: pinTaluka ? Boolean(pinTaluka.acceptingApplications) : null,
        ambiguous,
        resolutionStatus: row.taluka_id && !taluka ? "unresolved" : status,
      });
      return {
        supported: status === "resolved",
        status,
        state: state ?? null,
        district: district ?? null,
        taluka: pinTaluka,
        ambiguous,
        sourceTrust: row.source === "admin_verified"
          ? "admin_verified"
          : trustOf(row.source) >= OFFICIAL_TRUST_THRESHOLD
            ? "official"
            : "unofficial_pending_review",
        localities: inheritUniquePinTaluka(cachedLocalities, pinTaluka, ambiguous),
        localitySelectionRequired: cachedLocalities.length > 1,
        applicationStatus,
        applicationMessage,
      };
    };

    const { data: cached, error: cachedError } = await service
      .from("supported_pincodes")
      .select("pincode,office_name,district,state,city_id,area_id,provider,verified_at,supported_cities(id,name,state,is_active),supported_areas(id,name,is_active)")
      .eq("pincode", pincode)
      .eq("is_active", true)
      .maybeSingle();
    if (cachedError) throw cachedError;
    const cachedCity = Array.isArray(cached?.supported_cities)
      ? cached?.supported_cities[0]
      : cached?.supported_cities;
    const cachedArea = Array.isArray(cached?.supported_areas)
      ? cached?.supported_areas[0]
      : cached?.supported_areas;
    // Bug fix: a "fresh" geo_pincodes/supported_pincodes row is NOT
    // sufficient evidence that geo_pincode_localities has actually been
    // populated for this PIN. Rows written before the locality-tracking
    // system existed (or seeded directly, e.g. supported_pincodes rows with
    // provider="admin") can be marked resolved/fresh while
    // geo_pincode_localities has zero matching rows -- both cache
    // short-circuits below must therefore also require at least one cached
    // locality, or a PIN with real multi-locality data (confirmed live
    // against the postal provider) permanently returns "No locations found
    // for this PIN" until the row goes stale. Falling through here is cheap
    // and self-healing: it simply re-runs the same live-provider +
    // resolveGeoHierarchy path every uncached PIN already takes, which
    // correctly (re)populates geo_pincode_localities.
    if (cached && cachedCity?.is_active && (!cachedArea || cachedArea.is_active) && cachedGeoRow && geoCacheIsFresh && cachedLocalities.length > 0) {
      const cachedGeoFast = geoFromCache(cachedGeoRow);
      const applicationEnabledFast = cachedGeoFast?.applicationStatus === "resolved_enabled";
      return Response.json({
        supported: applicationEnabledFast,
        cached: true,
        pincode,
        city: cachedCity,
        area: cachedArea ?? null,
        district: cached.district ?? "",
        state: cached.state,
        officeName: cached.office_name ?? "",
        provider: cached.provider,
        message: applicationEnabledFast ? undefined : (cachedGeoFast?.applicationMessage ?? undefined),
        geo: cachedGeoFast,
      }, { headers: cors });
    }
    if (cachedGeoRow && geoCacheIsFresh && cachedGeoRow.resolution_status === "resolved" && cachedLocalities.length > 0) {
      const cachedGeo = geoFromCache(cachedGeoRow);
      // Vendor-application supportedness is decided by the canonical geo
      // resolution (applicationStatus), never by whether the legacy
      // City/Area system happens to have a matching row -- a resolved,
      // accepting Taluka in a District the legacy list has never heard of
      // must still say "supported", and a resolved-but-disabled Taluka must
      // never say "supported" just because the legacy city is configured.
      const applicationEnabled = cachedGeo?.applicationStatus === "resolved_enabled";
      return Response.json({
        supported: applicationEnabled,
        found: true,
        cached: true,
        pincode,
        city: cachedCity?.is_active ? cachedCity : null,
        area: cachedArea?.is_active ? cachedArea : null,
        district: (cachedGeo?.district as { name?: string } | null)?.name ?? "",
        state: (cachedGeo?.state as { name?: string } | null)?.name ?? "",
        officeName: cachedLocalities.length === 1 ? cachedLocalities[0].name : "",
        provider: cachedGeoRow.source,
        message: applicationEnabled ? undefined : (cachedGeo?.applicationMessage ?? undefined),
        geo: cachedGeo,
      }, { headers: cors });
    }

    const { provider, rows } = await providerLookup(pincode);
    if (!rows.length) {
      return Response.json({
        supported: false,
        found: false,
        pincode,
        message: "No Indian postal location was found for this PIN code.",
        geo: {
          supported: false, status: "unresolved", state: null, district: null, taluka: null,
          ambiguous: false, sourceTrust: "none", localities: [], localitySelectionRequired: false,
          applicationStatus: "unresolved",
          applicationMessage: "This PIN code isn't yet mapped to a Taluka RoyalLagn recognizes.",
        },
      }, { status: 404, headers: cors });
    }

    const geo = await resolveGeoHierarchy(service, pincode, rows, provider);

    const { data: cities, error: cityError } = await service
      .from("supported_cities")
      .select("id,name,state,is_active")
      .eq("is_active", true);
    if (cityError) throw cityError;
    const matchedRow = rows.find((row) => (cities ?? []).some((city: any) => {
      const candidates = [row.city, row.district];
      return candidates.some((candidate) => normalize(candidate) === normalize(city.name))
        && normalize(row.state) === normalize(city.state);
    })) ?? rows[0];
    const city = (cities ?? []).find((item: any) => {
      const candidates = [matchedRow.city, matchedRow.district];
      return candidates.some((candidate) => normalize(candidate) === normalize(item.name))
        && normalize(matchedRow.state) === normalize(item.state);
    });

    // Vendor-application supportedness is decided entirely by the canonical
    // geo (State/District/Taluka) resolution from here on -- never by
    // whether the legacy City/Area list happens to have a matching row. A
    // resolved, accepting Taluka in a District the legacy list has never
    // heard of is still supported; a resolved-but-disabled Taluka is never
    // supported just because a legacy city entry exists for it.
    const applicationEnabled = geo.applicationStatus === "resolved_enabled";

    if (!city) {
      return Response.json({
        supported: applicationEnabled,
        found: true,
        pincode,
        detected: {
          area: rows.length === 1 ? matchedRow.area || matchedRow.officeName : undefined,
          city: matchedRow.city,
          district: matchedRow.district,
          state: matchedRow.state,
        },
        message: applicationEnabled
          ? undefined
          : (geo.applicationMessage ?? `RoyalLagn is not yet available in ${matchedRow.district || matchedRow.city || "this location"}.`),
        geo,
      }, { headers: cors });
    }

    const { data: areas } = await service
      .from("supported_areas")
      .select("id,name,is_active")
      .eq("city_id", city.id)
      .eq("is_active", true);
    const areaCandidates = rows.flatMap((row) => [row.area, row.officeName]).map(normalize);
    const area = (areas ?? []).find((item: any) => areaCandidates.includes(normalize(item.name))) ?? null;

    const { error: legacyCacheError } = await service.from("supported_pincodes").upsert({
      pincode,
      city_id: city.id,
      area_id: area?.id ?? null,
      office_name: rows.length === 1 ? matchedRow.officeName || null : null,
      district: matchedRow.district || null,
      state: matchedRow.state || city.state,
      provider,
      is_active: true,
      verified_at: new Date().toISOString(),
      raw_response: { records: rows.map((row) => row.raw) },
    });
    if (legacyCacheError) throw legacyCacheError;

    return Response.json({
      supported: applicationEnabled,
      cached: false,
      pincode,
      city,
      area,
      district: matchedRow.district,
      state: matchedRow.state || city.state,
      officeName: rows.length === 1 ? matchedRow.officeName : "",
      provider,
      message: applicationEnabled ? undefined : (geo.applicationMessage ?? undefined),
      geo,
    }, { headers: cors });
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : "Unknown provider error";
    return Response.json({
      error: "PIN-code lookup is temporarily unavailable.",
      code: "provider_unavailable",
      detail,
    }, { status: 503, headers: cors });
  }
});
