import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha1(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

    const folder = `royallagn/reviews/${user.id}`;
    const assetId = crypto.randomUUID();
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "hp6vu8o9";
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const uploadPreset = Deno.env.get("CLOUDINARY_UPLOAD_PRESET") || Deno.env.get("EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET");

    if (apiSecret && apiKey) {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        folder,
        overwrite: "false",
        public_id: assetId,
        timestamp,
        unique_filename: "false",
      };
      const canonical = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
      const signature = await sha1(`${canonical}${apiSecret}`);
      return Response.json({
        ...params,
        provider: "cloudinary",
        uploadMode: "signed",
        signature,
        apiKey,
        cloudName,
      }, { headers: cors });
    }

    return Response.json({
      provider: "cloudinary",
      uploadMode: "unsigned",
      uploadPreset: uploadPreset || "royallagn_portfolio",
      cloudName,
      folder,
      public_id: assetId,
    }, { headers: cors });

  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to sign upload" },
      { status: 400, headers: cors },
    );
  }
});
