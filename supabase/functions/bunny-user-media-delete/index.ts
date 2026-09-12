import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = request.headers.get("Authorization") ?? "";
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { url } = await request.json();
    const parsed = new URL(String(url ?? ""));
    const bunny = bunnyStorageConfig();
    const objectKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const allowed = [`royallagn/general/${user.id}/`, `royallagn/document/${user.id}/`]
      .some((prefix) => objectKey.startsWith(prefix));
    if (parsed.protocol !== "https:" || parsed.hostname !== bunny.cdnHostname || !allowed || objectKey.includes("..")) {
      throw new Error("Owned Bunny media not found");
    }
    const signed = await presignBunnyObject("DELETE", objectKey, 60);
    const deletion = await fetch(signed.uploadUrl, { method: "DELETE" });
    if (!deletion.ok && deletion.status !== 404) throw new Error(`Bunny deletion failed (${deletion.status})`);
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete media" }, { status: 400, headers: cors });
  }
});
