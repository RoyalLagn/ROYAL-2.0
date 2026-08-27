import type { IncomingMessage, ServerResponse } from "node:http";

type RequestWithQuery = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Resolves legacy ID-based public profile URLs to their one canonical slug URL. */
export default async function handler(request: RequestWithQuery, response: ServerResponse) {
  const vendorId = queryValue(request.query?.vendorId ?? request.query?.id)?.trim();
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!vendorId || !base || !key) {
    response.statusCode = 404;
    response.end("Vendor not found");
    return;
  }

  const endpoint = new URL(`${base}/rest/v1/vendors`);
  endpoint.searchParams.set("select", "slug");
  endpoint.searchParams.set("id", `eq.${vendorId}`);
  endpoint.searchParams.set("is_verified", "eq.true");
  endpoint.searchParams.set("limit", "1");

  try {
    const result = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const records = result.ok ? await result.json() as { slug?: string | null }[] : [];
    const slug = records[0]?.slug?.trim();
    if (!slug) {
      response.statusCode = 404;
      response.end("Vendor not found");
      return;
    }
    response.writeHead(301, { Location: `/vendor/${encodeURIComponent(slug)}`, "Cache-Control": "public, max-age=86400" });
    response.end();
  } catch {
    response.statusCode = 404;
    response.end("Vendor not found");
  }
}
