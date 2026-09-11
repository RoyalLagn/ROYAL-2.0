import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deleteClipCloudinaryAssets, fetchWithTimeout } from "../_shared/cloudinaryMedia.ts";
import { presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const requestId = crypto.randomUUID();
  console.log("[clip-cloudinary-delete] Preparing deletion", { requestId });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader }, fetch: fetchWithTimeout },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { clipId, vendorId, publicId: requestedPublicId } = await request.json();
    let publicId = requestedPublicId as string | undefined;
    let ownedVendorId = vendorId as string | undefined;
    let deleteClipRecord = false;
    if (clipId) {
      const { data: clip, error: clipError } = await supabase.from("clips").select("cloudinary_public_id,vendor_id,vendors!inner(profile_id)")
        .eq("id", clipId).eq("vendors.profile_id", user.id).maybeSingle();
      if (clipError) throw clipError;
      publicId = clip?.cloudinary_public_id;
      ownedVendorId = clip?.vendor_id;
      deleteClipRecord = true;
    } else {
      const { data: vendor } = await supabase.from("vendors").select("id")
        .eq("id", vendorId).eq("profile_id", user.id).maybeSingle();
      if (!vendor || !(publicId?.startsWith(`royallagn/clips/${vendorId}/`) || publicId?.startsWith("bunny:"))) {
        throw new Error("Owned Clip asset not found");
      }
    }
    if (!publicId) throw new Error("Owned Clip not found");
    console.log("[clip-cloudinary-delete] Ownership verified", {
      requestId, clipId: clipId ?? null, vendorId: ownedVendorId,
      publicId, publicIdExists: true,
    });

    if (publicId.startsWith("bunny:")) {
      const [, videoId, storedClipId] = publicId.split(":");
      const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
      const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
      if (!libraryId || !apiKey || !videoId) throw new Error("Bunny Stream deletion is not configured");
      const videoDelete = await fetchWithTimeout(
        `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
        { method: "DELETE", headers: { AccessKey: apiKey } },
      );
      if (!videoDelete.ok && videoDelete.status !== 404) throw new Error(`Bunny Stream deletion failed (${videoDelete.status})`);
      if (ownedVendorId && (clipId || requestedPublicId)) {
        const targetClipId = clipId || storedClipId;
        for (const extension of ["jpg", "png"]) {
          const signed = await presignBunnyObject("DELETE", `clips/${ownedVendorId}/${targetClipId}/thumbnail.${extension}`);
          const response = await fetchWithTimeout(signed.uploadUrl, { method: "DELETE" });
          if (!response.ok && response.status !== 404) console.warn("Bunny thumbnail deletion failed", { requestId, status: response.status });
        }
      }
    } else {
      await deleteClipCloudinaryAssets(publicId, { requestId, clipId: clipId ?? null, vendorId: ownedVendorId ?? null });
    }

    if (deleteClipRecord) {
      const { error: deleteError } = await supabase.rpc("vendor_soft_delete_clip", { target_clip_id: clipId });
      if (deleteError) {
        console.error("[clip-cloudinary-delete] Database deletion failed after storage cleanup", {
          requestId, clipId, vendorId: ownedVendorId, error: deleteError,
        });
        throw new Error(`Clip media was cleared, but the database update failed: ${deleteError.message}`);
      }
      console.log("[clip-cloudinary-delete] Supabase soft deletion complete", {
        requestId, clipId, vendorId: ownedVendorId,
      });
    }
    console.log("[clip-cloudinary-delete] Complete", { requestId });
    return Response.json({ deleted: true }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Cloudinary deletion timed out after 30 seconds"
      : error instanceof Error ? error.message : "Unable to delete Clip media";
    console.error("[clip-cloudinary-delete] Failed", { requestId, error: message });
    return Response.json({ error: message }, { status: 400, headers: cors });
  }
});
