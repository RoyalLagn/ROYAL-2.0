import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extensionForMime, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const body = await request.json();
    const mimeType = String(body.mimeType ?? "").toLowerCase();
    const fileSize = Number(body.fileSize ?? 0);
    const purpose = body.purpose === "document" ? "document" : "general";
    const allowed = purpose === "document"
      ? new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"])
      : new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    const maximum = purpose === "document" ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!allowed.has(mimeType)) throw new Error("Unsupported media type");
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maximum) throw new Error("Media file size is not allowed");
    const objectKey = `royallagn/${purpose}/${user.id}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
    return Response.json(await presignBunnyObject("PUT", objectKey), { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to authorize upload" }, { status: 400, headers: cors });
  }
});
