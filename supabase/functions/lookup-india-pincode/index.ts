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
  "data.gov.in": 3,
  "admin_verified": 3,
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

async function lookupWithDataGov(pincode: string): Promise<PostalRecord[]> {
  const apiKey = Deno.env.get("DATA_GOV_IN_API_KEY");
  const resourceId = Deno.env.get("DATA_GOV_IN_PINCODE_RESOURCE_ID");
  if (!apiKey || !resourceId) return [];
  const url = new URL(`https://api.data.gov.in/resource/${resourceId}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "50");
  url.searchParams.set("filters[pincode]", pincode);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("The configured PIN-code provider is unavailable");
  const body = await response.json();
  return (Array.isArray(body?.records) ? body.records : []).map((record: any) => ({
    pincode,
    officeName: String(record.officename ?? record.office_name ?? "").trim(),
    area: String(record.taluk ?? record.block ?? record.officename ?? "").trim(),
    city: String(record.city ?? record.taluk ?? record.district ?? "").trim(),
    district: String(record.district ?? record.districtname ?? "").trim(),
    state: String(record.statename ?? record.state ?? "").trim(),
    raw: record,
  }));
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
  const dataGovRows = await lookupWithDataGov(pincode);
  return dataGovRows.length ? { provider: "data.gov.in", rows: dataGovRows } : {
    provider: "postalpincode.in",
    rows: await lookupWithPostalPincode(pincode),
  };
}

type GeoResolution = {
  supported: boolean;
  status: "resolved" | "needs_review" | "unresolved";
  state: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
  taluka: { id: string; name: string } | null;
  ambiguous: boolean;
  sourceTrust: "official" | "unofficial_pending_review" | "admin_verified" | "none";
};

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
): Promise<{ resolution_status: GeoResolution["status"]; skippedAsLowerTrust: boolean }> {
  const { data: existing } = await service
    .from("geo_pincodes")
    .select("taluka_id,resolution_status,source")
    .eq("pincode", pincode)
    .maybeSingle<ExistingCacheRow>();

  const newTrust = trustOf(provider);
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

  await service.from("geo_pincodes").upsert({
    pincode,
    state_id: patch.state_id,
    district_id: patch.district_id,
    taluka_id: officialMatch ? patch.taluka_id : (resolution_status === "resolved" ? patch.taluka_id : null),
    area: patch.area,
    office_name: patch.office_name,
    resolution_status,
    ambiguous: patch.ambiguous,
    source: provider,
    raw_response: patch.raw_response,
    verified_at: new Date().toISOString(),
  });

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
  const raw_response = { records: rows.map((row) => row.raw) };
  const { data: states, error: statesError } = await service
    .from("geo_states")
    .select("id,name")
    .eq("is_active", true);
  if (statesError) console.error("geo_states lookup failed", statesError);
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
      ambiguous: false, sourceTrust: "none",
    };
  }

  const { data: districts } = await service
    .from("geo_districts")
    .select("id,name")
    .eq("state_id", stateRow.id)
    .eq("is_active", true);
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
      ambiguous: false, sourceTrust: "none",
    };
  }

  const { data: talukas } = await service
    .from("geo_talukas")
    .select("id,name,aliases")
    .eq("district_id", districtRow.id)
    .eq("is_active", true);
  const talukaNameMatches = (taluka: any, candidate: string) =>
    normalize(taluka.name) === normalize(candidate)
    || (Array.isArray(taluka.aliases) && taluka.aliases.some((alias: string) => normalize(alias) === normalize(candidate)));
  // Every post office row under this PIN that resolves to a Taluka.
  const talukaCandidates = new Set(
    rows
      .flatMap((row) => [row.area, row.officeName])
      .map((candidate) => (talukas ?? []).find((item: any) => talukaNameMatches(item, candidate)))
      .filter(Boolean)
      .map((item: any) => item.id),
  );
  const ambiguous = talukaCandidates.size > 1;
  const talukaRow = talukaCandidates.size === 1
    ? (talukas ?? []).find((item: any) => item.id === [...talukaCandidates][0])
    : null;

  const { resolution_status } = await upsertGeoPincodeWithPrecedence(service, pincode, provider, {
    state_id: stateRow.id,
    district_id: districtRow.id,
    taluka_id: talukaRow?.id ?? null,
    area: rows[0]?.area || rows[0]?.officeName || null,
    office_name: rows[0]?.officeName || null,
    ambiguous,
    raw_response,
  });

  // Re-read what actually landed (precedence rules above may have kept an
  // existing higher-trust row instead of this lookup's own result).
  const { data: finalRow } = await service
    .from("geo_pincodes")
    .select("taluka_id,district_id,state_id,resolution_status,ambiguous,source")
    .eq("pincode", pincode)
    .maybeSingle();
  const finalTaluka = finalRow?.taluka_id
    ? (talukas ?? []).find((item: any) => item.id === finalRow.taluka_id) ?? null
    : null;

  return {
    supported: resolution_status === "resolved",
    status: resolution_status,
    state: stateRow,
    district: districtRow,
    taluka: finalTaluka,
    ambiguous: Boolean(finalRow?.ambiguous),
    sourceTrust: finalRow?.source === "admin_verified"
      ? "admin_verified"
      : trustOf(finalRow?.source ?? provider) >= OFFICIAL_TRUST_THRESHOLD
        ? "official"
        : resolution_status === "resolved" ? "official" : "unofficial_pending_review",
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
    const { data: cachedGeoRow } = await service
      .from("geo_pincodes")
      .select("state_id,district_id,taluka_id,resolution_status,ambiguous,source,verified_at,geo_states(id,name),geo_districts(id,name),geo_talukas(id,name)")
      .eq("pincode", pincode)
      .maybeSingle();
    const geoCacheIsFresh = Boolean(
      cachedGeoRow?.verified_at
      && (Date.now() - new Date(cachedGeoRow.verified_at).getTime()) < PIN_CACHE_STALE_DAYS * 86_400_000,
    );
    const geoFromCache = (row: typeof cachedGeoRow): GeoResolution | null => {
      if (!row) return null;
      const state = Array.isArray(row.geo_states) ? row.geo_states[0] : row.geo_states;
      const district = Array.isArray(row.geo_districts) ? row.geo_districts[0] : row.geo_districts;
      const taluka = Array.isArray(row.geo_talukas) ? row.geo_talukas[0] : row.geo_talukas;
      return {
        supported: row.resolution_status === "resolved",
        status: row.resolution_status as GeoResolution["status"],
        state: state ?? null,
        district: district ?? null,
        taluka: taluka ?? null,
        ambiguous: Boolean(row.ambiguous),
        sourceTrust: row.source === "admin_verified"
          ? "admin_verified"
          : trustOf(row.source) >= OFFICIAL_TRUST_THRESHOLD
            ? "official"
            : row.resolution_status === "resolved" ? "official" : "unofficial_pending_review",
      };
    };

    const { data: cached } = await service
      .from("supported_pincodes")
      .select("pincode,office_name,district,state,city_id,area_id,provider,verified_at,supported_cities(id,name,state,is_active),supported_areas(id,name,is_active)")
      .eq("pincode", pincode)
      .eq("is_active", true)
      .maybeSingle();
    const cachedCity = Array.isArray(cached?.supported_cities)
      ? cached?.supported_cities[0]
      : cached?.supported_cities;
    const cachedArea = Array.isArray(cached?.supported_areas)
      ? cached?.supported_areas[0]
      : cached?.supported_areas;
    if (cached && cachedCity?.is_active && (!cachedArea || cachedArea.is_active) && cachedGeoRow && geoCacheIsFresh) {
      return Response.json({
        supported: true,
        cached: true,
        pincode,
        city: cachedCity,
        area: cachedArea ?? null,
        district: cached.district ?? "",
        state: cached.state,
        officeName: cached.office_name ?? "",
        provider: cached.provider,
        geo: geoFromCache(cachedGeoRow),
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
          ambiguous: false, sourceTrust: "none",
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

    if (!city) {
      return Response.json({
        supported: false,
        found: true,
        pincode,
        detected: {
          area: matchedRow.area || matchedRow.officeName,
          city: matchedRow.city,
          district: matchedRow.district,
          state: matchedRow.state,
        },
        message: `RoyalLagn is not yet available in ${matchedRow.district || matchedRow.city || "this location"}.`,
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

    await service.from("supported_pincodes").upsert({
      pincode,
      city_id: city.id,
      area_id: area?.id ?? null,
      office_name: matchedRow.officeName || null,
      district: matchedRow.district || null,
      state: matchedRow.state || city.state,
      provider,
      is_active: true,
      verified_at: new Date().toISOString(),
      raw_response: { records: rows.map((row) => row.raw) },
    });

    return Response.json({
      supported: true,
      cached: false,
      pincode,
      city,
      area,
      district: matchedRow.district,
      state: matchedRow.state || city.state,
      officeName: matchedRow.officeName,
      provider,
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
