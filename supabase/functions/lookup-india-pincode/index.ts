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
    if (cached && cachedCity?.is_active && (!cachedArea || cachedArea.is_active)) {
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
      }, { headers: cors });
    }

    const { provider, rows } = await providerLookup(pincode);
    if (!rows.length) {
      return Response.json({
        supported: false,
        found: false,
        pincode,
        message: "No Indian postal location was found for this PIN code.",
      }, { status: 404, headers: cors });
    }

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
