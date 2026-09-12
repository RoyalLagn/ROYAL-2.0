import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extensionForMime, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
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
      originalFileSize = fileSize,
      batchSize = 1,
    } = await request.json();
    const kind = resourceType === "video" ? "video" : "image";
    const allowedImages = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    const allowedVideos = new Set(["video/mp4", "video/quicktime", "video/webm"]);
    const allowedTypes = kind === "video" ? allowedVideos : allowedImages;
    const { data: policyRows, error: policyError } = await supabase.rpc("get_my_subscription_media_policy", {
      target_vendor_id: vendorId,
    });
    if (policyError) throw policyError;
    const policy = Array.isArray(policyRows) ? policyRows[0] : policyRows;
    if (!policy) throw new Error("An active subscription plan is required");
    const sourceImageMaxBytes = Number(policy.max_image_upload_mb) * 1024 * 1024;
    const maxBytes = kind === "video" ? 150 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!allowedTypes.has(String(mimeType).toLowerCase())) throw new Error("Unsupported portfolio file type");
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxBytes) throw new Error("Portfolio file size is not allowed");
    if (kind === "image" && (!Number.isFinite(originalFileSize) || originalFileSize <= 0 || originalFileSize > sourceImageMaxBytes)) {
      throw new Error(`Your plan allows image uploads up to ${policy.max_image_upload_mb} MB.`);
    }
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

    // Reserve capacity before spending time/bandwidth on the Bunny
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

    const folder = `royallagn/vendors/${vendorId}/albums/${albumId}`;
    const assetId = crypto.randomUUID();
    if (kind === "video") {
      const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
      const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
      const cdnHostname = Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME")?.trim()
        .replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!libraryId || !apiKey || !cdnHostname) throw new Error("Bunny Stream is not configured");
      const createResponse = await fetch(
        `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`,
        {
          method: "POST",
          headers: { AccessKey: apiKey, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ title: `portfolio-${albumId}-${assetId}` }),
        },
      );
      const created = await createResponse.json().catch(() => ({})) as { guid?: string; message?: string };
      if (!createResponse.ok || !created.guid) throw new Error(created.message || "Unable to create Bunny Stream video");
      const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      return Response.json({
        provider: "bunny",
        uploadMode: "tus",
        endpoint: "https://video.bunnycdn.com/tusupload",
        authorizationSignature: await sha256(`${libraryId}${apiKey}${expires}${created.guid}`),
        authorizationExpire: expires,
        videoId: created.guid,
        libraryId,
        videoUrl: `https://${cdnHostname}/${created.guid}/playlist.m3u8`,
        thumbnailUrl: `https://${cdnHostname}/${created.guid}/thumbnail.jpg`,
        objectKey: `bunny-stream:${created.guid}`,
        resourceType: kind,
        remainingCapacity: 15 - currentCount,
        reservationId,
      }, { headers: cors });
    }
    const objectKey = `${folder}/${assetId}.${extensionForMime(String(mimeType))}`;
    return Response.json({
      ...await presignBunnyObject("PUT", objectKey),
      resourceType: kind,
      remainingCapacity: 15 - currentCount,
      reservationId,
    }, { headers: cors });

  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sign upload" },
      { status: 400, headers: cors });
  }
});
