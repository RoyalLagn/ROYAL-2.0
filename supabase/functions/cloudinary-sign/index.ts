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
    // Images reach this signer only after the shared client preparation
    // pipeline has produced the final upload file. Video behavior is unchanged.
    const maxBytes = kind === "video" ? 150 * 1024 * 1024 : 5 * 1024 * 1024;
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

    // Reserve capacity before spending time/bandwidth on the Cloudinary
    // upload, and before finalize_photo_upload (the only way to insert a
    // vendor_portfolio_media row -- see the migration that drops the direct
    // insert policy) so a slot always exists to finalize into. The vendor's
    // plan quota only counts images (reserve_photo_upload_slot / the RPC's
    // active_count query filter on resource_type = 'image'), so a video
    // reservation is effectively always granted unless the vendor's image
    // count alone is already at their limit -- a narrow edge case, not a
    // separate video quota.
    const idempotencyKey = `${albumId}:${crypto.randomUUID()}`;
    const { data: reservation, error: reservationError } = await supabase.rpc("reserve_photo_upload_slot", {
      target_vendor_id: vendorId,
      request_idempotency_key: idempotencyKey,
      upload_resource_type: kind,
    });
    if (reservationError) throw reservationError;
    const reserved = Array.isArray(reservation) ? reservation[0] : reservation;
    const reservationId: string | null = reserved?.reservation_id ?? null;

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `royallagn/vendors/${vendorId}/albums/${albumId}`;
    const assetId = crypto.randomUUID();
    const eager = kind === "video"
      ? "c_limit,w_1280,h_720,q_auto:good,vc_h264,ac_aac,f_mp4|so_0,c_fit,w_960,h_720,q_auto,f_jpg"
      : "c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile|c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile|c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile|c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile";
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
        reservationId,
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
      reservationId,
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sign upload" },
      { status: 400, headers: cors });
  }
});
