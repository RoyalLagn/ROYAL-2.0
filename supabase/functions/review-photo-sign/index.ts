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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_active || profile.role !== "public_user") {
      throw new Error("Only active customers may upload review photos");
    }

    const { mimeType = "", fileSize = 0 } = await request.json();
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]);
    if (!allowed.has(String(mimeType).toLowerCase())) {
      throw new Error("Unsupported review photo type");
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
      throw new Error("Review photo optimization did not produce a valid upload file");
    }

    const objectKey = `royallagn/reviews/${user.id}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
    return Response.json(await presignBunnyObject("PUT", objectKey), { headers: cors });

  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to sign upload" },
      { status: 400, headers: cors },
    );
  }
});
