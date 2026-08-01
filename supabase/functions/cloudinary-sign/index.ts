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

    const {
      vendorId,
      albumId,
      resourceType = "image",
      mimeType = "",
      fileSize = 0,
      batchSize = 1,
    } = await request.json();
    const kind = resourceType === "video" ? "video" : "image";
    const allowedImages = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    const allowedVideos = new Set(["video/mp4", "video/quicktime", "video/webm"]);
    const allowedTypes = kind === "video" ? allowedVideos : allowedImages;
    // Originals may be larger than the public delivery limits because
    // Cloudinary creates the permanent optimized derivatives below.
    const maxBytes = kind === "video" ? 150 * 1024 * 1024 : 30 * 1024 * 1024;
    if (!allowedTypes.has(String(mimeType).toLowerCase())) throw new Error("Unsupported portfolio file type");
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxBytes) throw new Error("Portfolio file size is not allowed");
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 15) throw new Error("Invalid upload batch");

    const { data: vendor } = await supabase
      .from("vendors").select("id").eq("id", vendorId).eq("profile_id", user.id).maybeSingle();
    const { data: album } = await supabase
      .from("vendor_portfolio_albums").select("id,media_count").eq("id", albumId).eq("vendor_id", vendorId).maybeSingle();
    if (!vendor || !album) throw new Error("Vendor album not found");
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: vendorId,
      requested_feature_key: "upload_gallery",
    });
    if (accessError) throw accessError;
    const { count, error: countError } = await supabase
      .from("vendor_portfolio_media").select("id", { count: "exact", head: true }).eq("album_id", albumId);
    if (countError) throw countError;
    const currentCount = Math.max(album.media_count ?? 0, count ?? 0);
    if (currentCount + batchSize > 15) throw new Error("Album media limit reached");

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `royallagn/vendors/${vendorId}/albums/${albumId}`;
    const assetId = crypto.randomUUID();
    const eager = kind === "video"
      ? "c_limit,w_1280,h_720,q_auto:good,vc_h264,ac_aac,f_mp4|so_0,c_fit,w_960,h_720,q_auto,f_jpg"
      : "c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile|c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile|c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile|c_limit,w_2560,h_2560,q_auto:good,f_auto,fl_strip_profile";
    const params = {
      eager,
      folder,
      overwrite: "false",
      public_id: assetId,
      timestamp,
      unique_filename: "false",
    };
    const canonical = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`).join("&");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const uploadPreset = Deno.env.get("CLOUDINARY_UPLOAD_PRESET");
    if (!cloudName) throw new Error("Cloudinary cloud name is not configured");

    // Keep authorization and capacity checks on the server even when this
    // project is using its existing unsigned Cloudinary preset. Once the API
    // key and secret are configured, clients automatically receive signed
    // upload parameters without another application release.
    if (!apiSecret || !apiKey) {
      if (!uploadPreset) {
        throw new Error("Cloudinary upload credentials are not configured");
      }
      return Response.json({
        uploadMode: "unsigned",
        uploadPreset,
        cloudName,
        resourceType: kind,
        folder,
        public_id: assetId,
        remainingCapacity: 15 - currentCount,
      }, { headers: cors });
    }

    return Response.json({
      ...params,
      uploadMode: "signed",
      signature: await sha1(`${canonical}${apiSecret}`),
      apiKey,
      cloudName,
      resourceType: kind,
      remainingCapacity: 15 - currentCount,
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sign upload" },
      { status: 400, headers: cors });
  }
});
