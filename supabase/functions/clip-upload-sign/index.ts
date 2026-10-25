import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const requestId = crypto.randomUUID();
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    console.log("[clip-upload-sign] Clips uploads are retired", { requestId, userId: user.id });
    return Response.json(
      { error: "Clip uploads are no longer available. Use the vendor gallery for photos and videos." },
      { status: 410, headers: cors },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to authorize Clip upload";
    console.error("[clip-upload-sign] Failed", { requestId, error: message });
    return Response.json({ error: message }, { status: 400, headers: cors });
  }
});
