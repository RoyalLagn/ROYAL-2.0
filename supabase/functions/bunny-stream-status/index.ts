import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bunny VideoModelStatus: 3 = Finished, 4 = ResolutionFinished,
// 5 = Failed, 6/7/8 = PresignedUploadStarted/Finished/Failed.
const READY_STATUSES = new Set([3, 4]);
const FAILED_STATUSES = new Set([5, 8]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { videoId, vendorId, purpose } = await request.json();
    if (!videoId || !vendorId || !["clip", "portfolio"].includes(purpose)) throw new Error("Invalid Bunny status request");
    const { data: vendor } = await supabase.from("vendors").select("id")
      .eq("id", vendorId).eq("profile_id", user.id).maybeSingle();
    if (!vendor) throw new Error("Vendor access required");
    const feature = purpose === "clip" ? "upload_clips" : "upload_gallery";
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: vendorId,
      requested_feature_key: feature,
    });
    if (accessError) throw accessError;

    const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
    if (!libraryId || !apiKey) throw new Error("Bunny Stream is not configured");
    const response = await fetch(
      `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
      { headers: { AccessKey: apiKey, Accept: "application/json" } },
    );
    const video = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(video.message || `Bunny Stream status failed (${response.status})`);
    const status = typeof video.status === "number" ? video.status : null;
    const storageSize = Number(video.storageSize || 0);
    const encodeProgress = Number(video.encodeProgress || 0);
    const state = status !== null && FAILED_STATUSES.has(status)
      ? "failed"
      : status !== null && READY_STATUSES.has(status) && storageSize > 0
        ? "ready"
        : status === 0 || status === 6 ? "queued" : "processing";
    console.log("[bunny-stream-status] Result", {
      videoId,
      purpose,
      status,
      storageSize,
      encodeProgress,
      state,
    });
    return Response.json({
      state,
      status,
      storageSize,
      encodeProgress,
      width: Number(video.width || 0) || undefined,
      height: Number(video.height || 0) || undefined,
      length: Number(video.length || 0) || undefined,
      error: state === "failed"
        ? String(video.transcodingMessages?.[0]?.message || video.message || "Bunny Stream processing failed.")
        : undefined,
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to check Bunny Stream status" }, {
      status: 400,
      headers: cors,
    });
  }
});
