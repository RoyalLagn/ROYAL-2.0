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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { mediaId, vendorId, publicId, resourceType } = await request.json();
    let media: { id?: string; public_id: string; resource_type: "image" | "video"; vendor_id: string } | null = null;
    if (mediaId) {
      const { data, error: mediaLookupError } = await admin.from("vendor_portfolio_media")
        .select("id,public_id,resource_type,vendor_id")
        .eq("id", mediaId).maybeSingle();
      if (mediaLookupError) throw mediaLookupError;
      media = data as typeof media;
    }
    if (!media && vendorId && publicId) {
      const { data, error: fallbackLookupError } = await admin.from("vendor_portfolio_media")
        .select("id,public_id,resource_type,vendor_id")
        .eq("vendor_id", vendorId).eq("public_id", publicId).maybeSingle();
      if (fallbackLookupError) throw fallbackLookupError;
      media = data as typeof media;
    }
    if (media) {
      const [{ data: ownedVendor }, { data: profile }] = await Promise.all([
        admin.from("vendors").select("id").eq("id", media.vendor_id).eq("profile_id", user.id).maybeSingle(),
        admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      ]);
      if (!ownedVendor && profile?.role !== "admin") media = null;
    } else if (!mediaId && vendorId && publicId) {
      const { data: vendor } = await admin.from("vendors")
        .select("id").eq("id", vendorId).eq("profile_id", user.id).maybeSingle();
      const expectedPrefix = `royallagn/vendors/${vendorId}/`;
      if (vendor && String(publicId).startsWith(expectedPrefix)) {
        media = {
          vendor_id: vendorId,
          public_id: publicId,
          resource_type: resourceType === "video" ? "video" : "image",
        };
      }
    }
    if (!media) throw new Error("Media not found");
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: media.vendor_id,
      requested_feature_key: "upload_gallery",
    });
    if (accessError) throw accessError;

    const timestamp = Math.floor(Date.now() / 1000);
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!;
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!;
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
    if (!apiSecret || !apiKey || !cloudName) throw new Error("Cloudinary server configuration is missing");
    const signature = await sha1(`invalidate=true&public_id=${media.public_id}&timestamp=${timestamp}${apiSecret}`);
    const body = new URLSearchParams({ public_id: media.public_id, timestamp: String(timestamp), invalidate: "true", api_key: apiKey, signature });
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${media.resource_type}/destroy`,
      { method: "POST", body },
    );
    const result = await response.json();
    if (!response.ok || !["ok", "not found"].includes(result.result)) throw new Error("Cloudinary deletion failed");
    if (media.id) {
      const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
      if (deleteError) throw deleteError;
    }
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete media" },
      { status: 400, headers: cors });
  }
});
