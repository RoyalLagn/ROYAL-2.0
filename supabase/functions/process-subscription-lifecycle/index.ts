import { corsHeaders, json, requireEnv, serviceClient } from "../_shared/subscriptions.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("x-cron-secret") !== requireEnv("SUBSCRIPTION_CRON_SECRET")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data, error } = await serviceClient().rpc("process_subscription_lifecycle");
  if (error) return json({ error: error.message }, 400);
  return json({ success: true, result: data });
});
