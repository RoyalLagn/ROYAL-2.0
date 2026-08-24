// Fixed-window rate limiter backed by public.rate_limit_events, written to
// only by Edge Functions through the service-role client (RLS blocks
// anon/authenticated entirely -- see the rate_limit_events migration:
// 20260818190000_edge_function_rate_limiting.sql).
//
// Fails OPEN on any unexpected DB error: a rate-limit outage must never
// block real traffic, only real abuse. Callers should keep every existing
// auth/ownership check as-is -- this only adds a request-volume ceiling on
// top, it is never the only gate on an endpoint.
export async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  service: any,
  rateKey: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

    // Best-effort cleanup of this key's own expired rows -- keeps the table
    // small without a separate cron job. Never blocks the check below if it
    // fails for some reason.
    await service.from("rate_limit_events").delete().eq("rate_key", rateKey).lt("created_at", windowStart);

    const { count, error: countError } = await service
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("rate_key", rateKey)
      .gte("created_at", windowStart);
    if (countError) throw countError;

    if ((count ?? 0) >= maxAttempts) return false;

    const { error: insertError } = await service.from("rate_limit_events").insert({ rate_key: rateKey });
    if (insertError) throw insertError;

    return true;
  } catch (error) {
    console.error("[rateLimit] check failed, allowing request", {
      message: error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? ""),
      code: error && typeof error === "object" && "code" in error ? String(error.code) : null,
      details: error && typeof error === "object" && "details" in error ? String(error.details) : null,
    });
    return true;
  }
}
