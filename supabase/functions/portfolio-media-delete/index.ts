import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    let media: { id?: string; public_id: string; secure_url?: string; resource_type: "image" | "video"; vendor_id: string } | null = null;
    if (mediaId) {
      const { data, error: mediaLookupError } = await admin.from("vendor_portfolio_media")
        .select("id,public_id,secure_url,resource_type,vendor_id")
        .eq("id", mediaId).maybeSingle();
      if (mediaLookupError) throw mediaLookupError;
      media = data as typeof media;
    }
    if (!media && vendorId && publicId) {
      const { data, error: fallbackLookupError } = await admin.from("vendor_portfolio_media")
        .select("id,public_id,secure_url,resource_type,vendor_id")
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
      if (vendor && (String(publicId).startsWith(expectedPrefix) || /^bunny-stream:[0-9a-f-]+$/i.test(String(publicId)))) {
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

    const streamVideoId = media.resource_type === "video"
      ? media.public_id.match(/^bunny-stream:([0-9a-f-]+)$/i)?.[1]
      : undefined;
    if (streamVideoId) {
      const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
      const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
      if (!libraryId || !apiKey) throw new Error("Bunny Stream deletion is not configured");
      const deletion = await fetch(
        `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(streamVideoId)}`,
        { method: "DELETE", headers: { AccessKey: apiKey } },
      );
      if (!deletion.ok && deletion.status !== 404) throw new Error(`Bunny Stream deletion failed (${deletion.status})`);
      if (media.id) {
        const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
        if (deleteError) throw deleteError;
      }
      return Response.json({ ok: true, provider: "bunny" }, { headers: cors });
    }

    const mediaUrl = media.secure_url ? new URL(media.secure_url) : null;
    const isBunnyUrl = mediaUrl?.hostname.endsWith(".b-cdn.net") === true;
    const bunnyObjectKey = media.public_id.includes(".")
      ? media.public_id
      : isBunnyUrl ? decodeURIComponent(mediaUrl!.pathname.replace(/^\//, "")) : null;
    if (isBunnyUrl && bunnyObjectKey?.endsWith("playlist.m3u8")) {
      const videoId = bunnyObjectKey.split("/")[0];
      const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
      const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
      if (!videoId || !libraryId || !apiKey) throw new Error("Bunny Stream deletion is not configured");
      const deletion = await fetch(
        `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
        { method: "DELETE", headers: { AccessKey: apiKey } },
      );
      if (!deletion.ok && deletion.status !== 404) throw new Error(`Bunny Stream deletion failed (${deletion.status})`);
      if (media.id) {
        const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
        if (deleteError) throw deleteError;
      }
      return Response.json({ ok: true, provider: "bunny" }, { headers: cors });
    }
    if (bunnyObjectKey && !bunnyObjectKey.includes("..") && !bunnyObjectKey.endsWith("playlist.m3u8")) {
      const signedDelete = await presignBunnyObject("DELETE", bunnyObjectKey, 60);
      const deletion = await fetch(signedDelete.uploadUrl, { method: "DELETE" });
      if (!deletion.ok && deletion.status !== 404) throw new Error(`Bunny portfolio deletion failed (${deletion.status})`);
      if (media.id) {
        const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
        if (deleteError) throw deleteError;
      }
      return Response.json({ ok: true, provider: "bunny" }, { headers: cors });
    }

    throw new Error("Portfolio media is not a managed Bunny asset");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete media" },
      { status: 400, headers: cors });
  }
});
