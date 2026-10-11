import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { presignBunnyObject } from "../_shared/bunnyS3.ts";

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

    const mediaUrl = media.secure_url ? new URL(media.secure_url) : null;
    const isBunnyUrl = mediaUrl?.hostname.endsWith(".b-cdn.net") === true;
    const isBunnyStream = /^bunny-stream:/i.test(media.public_id);

    // 1. Legacy Bunny Stream asset handling
    if (isBunnyStream) {
      const streamVideoId = media.public_id.match(/^bunny-stream:([0-9a-f-]+)$/i)?.[1];
      if (streamVideoId) {
        const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
        const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
        if (libraryId && apiKey) {
          const deletion = await fetch(
            `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(streamVideoId)}`,
            { method: "DELETE", headers: { AccessKey: apiKey } },
          );
          if (!deletion.ok && deletion.status !== 404) {
            console.warn(`Bunny Stream deletion warning (${deletion.status})`);
          }
        }
      }
      if (media.id) {
        const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
        if (deleteError) throw deleteError;
      }
      return Response.json({ ok: true, provider: "bunny" }, { headers: cors });
    }

    // 2. Legacy Bunny Storage asset handling
    if (isBunnyUrl) {
      const bunnyObjectKey = media.public_id.includes(".")
        ? media.public_id
        : decodeURIComponent(mediaUrl!.pathname.replace(/^\//, ""));
      if (bunnyObjectKey && !bunnyObjectKey.includes("..")) {
        try {
          const signedDelete = await presignBunnyObject("DELETE", bunnyObjectKey, 60);
          const deletion = await fetch(signedDelete.uploadUrl, { method: "DELETE" });
          if (!deletion.ok && deletion.status !== 404) {
            console.warn(`Bunny portfolio deletion warning (${deletion.status})`);
          }
        } catch (e) {
          console.warn("Bunny S3 delete error:", e);
        }
      }
      if (media.id) {
        const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
        if (deleteError) throw deleteError;
      }
      return Response.json({ ok: true, provider: "bunny" }, { headers: cors });
    }

    // 3. Cloudinary Asset Destruction
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "hp6vu8o9";
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const targetResourceType = media.resource_type === "video" ? "video" : "image";

    if (apiSecret && apiKey && cloudName) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1(`invalidate=true&public_id=${media.public_id}&timestamp=${timestamp}${apiSecret}`);
      const body = new URLSearchParams({
        public_id: media.public_id,
        timestamp: String(timestamp),
        invalidate: "true",
        api_key: apiKey,
        signature,
      });
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${targetResourceType}/destroy`,
        { method: "POST", body },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !["ok", "not found"].includes(result.result)) {
        throw new Error(result?.error?.message || "Cloudinary deletion failed");
      }
    } else {
      console.warn("Cloudinary API credentials missing in Edge Functions; proceeding with database deletion.");
    }

    if (media.id) {
      const { error: deleteError } = await admin.from("vendor_portfolio_media").delete().eq("id", media.id);
      if (deleteError) throw deleteError;
    }

    return Response.json({ ok: true, provider: "cloudinary" }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete media" },
      { status: 400, headers: cors });
  }
});
