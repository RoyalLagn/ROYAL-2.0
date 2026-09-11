import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const OPERATION_TIMEOUT_MS = 30_000;
// The device may accept a source file up to the vendor plan's 40 MiB limit,
// but it must compress that source locally before requesting this signature.
// This signer is the server-side backstop: Cloudinary never receives a Clip
// video larger than the 20 MiB stored-media boundary.
const MAX_PREPARED_CLIP_BYTES = 20 * 1024 * 1024;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sha1(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const requestId = crypto.randomUUID();
  console.log("[clip-upload-sign] Preparing upload", { requestId });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader }, fetch: fetchWithTimeout },
    });
    console.log("[clip-upload-sign] Validating user", { requestId });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { vendorId, clipId, kind, mimeType, fileSize, debugUploadId } = await request.json();
    const uploadId = typeof debugUploadId === "string" ? debugUploadId : requestId;
    console.log(`[CLIP-DEBUG][${uploadId}] EDGE_SIGNATURE_BODY DONE`, {
      requestId, uploadId, vendorId, clipId, kind, mimeType, fileSize,
    });
    if (!vendorId || !clipId || !["video", "thumbnail"].includes(kind)) throw new Error("Invalid upload request");
    const { data: policyRows, error: policyError } = await supabase.rpc("get_my_subscription_media_policy", {
      target_vendor_id: vendorId,
    });
    if (policyError) throw policyError;
    const policy = Array.isArray(policyRows) ? policyRows[0] : policyRows;
    if (!policy?.max_clip_upload_mb) throw new Error("Clips are not included in your current plan.");
    const maximum = kind === "video"
      ? Math.min(Number(policy.max_clip_upload_mb) * 1024 * 1024, MAX_PREPARED_CLIP_BYTES)
      : 8 * 1024 * 1024;
    const allowed = kind === "video"
      ? new Set(["video/mp4", "video/quicktime", "video/x-m4v", "video/hevc"])
      : new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    if (!allowed.has(String(mimeType).toLowerCase())) throw new Error("Unsupported Clip media type");
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maximum) {
      throw new Error(
        kind === "video"
          ? "This clip must be compressed to 20 MB before upload. Please choose a shorter or lower-resolution video."
          : "Clip media size is not allowed",
      );
    }
    console.log(`[CLIP-DEBUG][${uploadId}] EDGE_VENDOR_AUTH START`, { requestId, vendorId, clipId, kind });
    const { data: vendor } = await supabase.from("vendors").select("id")
      .eq("id", vendorId).eq("profile_id", user.id).eq("is_verified", true).maybeSingle();
    if (!vendor) throw new Error("Approved Vendor access required");
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: vendorId,
      requested_feature_key: "upload_clips",
    });
    if (accessError) throw accessError;
    console.log(`[CLIP-DEBUG][${uploadId}] EDGE_VENDOR_AUTH DONE`, { requestId, vendorId, clipId, kind });

    const resourceType = kind === "video" ? "video" : "image";
    const folder = `royallagn/clips/${vendorId}/${clipId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = kind;
    const eager = kind === "video"
      ? "c_limit,w_1080,h_1920,q_auto:good,vc_h264,ac_aac,f_mp4"
      : "c_fill,w_720,h_1280,g_auto,q_auto:good,f_jpg";
    const params = {
      eager,
      ...(kind === "video" ? { eager_async: "true" } : {}),
      folder,
      overwrite: "true",
      public_id: publicId,
      timestamp,
      unique_filename: "false",
    };
    const canonical = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`).join("&");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const uploadPreset = Deno.env.get("CLOUDINARY_UPLOAD_PRESET");
    if (!cloudName) throw new Error("Cloudinary is not configured");
    if (!apiSecret || !apiKey) {
      if (!uploadPreset) throw new Error("Cloudinary upload credentials are not configured");
      console.log("[clip-upload-sign] Returning unsigned response", { requestId, clipId, kind });
      return Response.json({ uploadMode: "unsigned", uploadPreset, cloudName, resourceType, folder, public_id: publicId }, { headers: cors });
    }
    console.log(`[CLIP-DEBUG][${uploadId}] EDGE_SIGNATURE START`, { requestId, clipId, kind });
    const response = Response.json({
      ...params, uploadMode: "signed", signature: await sha1(`${canonical}${apiSecret}`),
      apiKey, cloudName, resourceType,
    }, { headers: cors });
    console.log(`[CLIP-DEBUG][${uploadId}] EDGE_SIGNATURE DONE`, { requestId, clipId, kind });
    return response;
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Upload authorization timed out after 30 seconds"
      : error instanceof Error ? error.message : "Unable to authorize Clip upload";
    console.error("[clip-upload-sign] Failed", { requestId, error: message });
    return Response.json({ error: message }, { status: 400, headers: cors });
  }
});
