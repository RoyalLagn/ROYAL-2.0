import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha1(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractPublicIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/res\.cloudinary\.com/i.test(parsed.hostname)) return null;
    const pathname = parsed.pathname;
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;
    const pathAfterUpload = pathname.slice(uploadIndex + "/upload/".length);
    const segments = pathAfterUpload.split("/");
    const versionIndex = segments.findIndex((seg) => /^v\d+$/.test(seg));
    const assetSegments = versionIndex !== -1 ? segments.slice(versionIndex + 1) : segments.filter((s) => !s.includes(",") && !/^[cwghqfevdprst]_/.test(s));
    if (!assetSegments.length) return null;
    return decodeURIComponent(assetSegments.join("/")).replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
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

    const body = await request.json();
    const kind = body.kind === "vendor" ? "vendor" : "customer";
    let prefix: string;
    if (kind === "vendor") {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id")
        .eq("id", body.vendorId)
        .eq("profile_id", user.id)
        .maybeSingle();
      if (!vendor) throw new Error("Vendor profile not found");
      prefix = `royallagn/vendors/${vendor.id}/profile/`;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .eq("role", "public_user")
        .maybeSingle();
      if (!profile) throw new Error("Customer profile not found");
      prefix = `royallagn/profiles/${user.id}/`;
    }

    if (body.action === "delete") {
      const currentUrl = typeof body.url === "string" ? new URL(body.url) : null;
      if (!currentUrl) return Response.json({ ok: true, managed: false }, { headers: cors });

      // 1. Cloudinary Asset Destruction
      if (/res\.cloudinary\.com/i.test(currentUrl.hostname)) {
        const publicId = extractPublicIdFromUrl(body.url);
        if (publicId && publicId.startsWith(prefix)) {
          const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "hp6vu8o9";
          const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
          const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
          if (apiSecret && apiKey && cloudName) {
            const timestamp = Math.floor(Date.now() / 1000);
            const signature = await sha1(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
            const deleteBody = new URLSearchParams({
              public_id: publicId,
              timestamp: String(timestamp),
              invalidate: "true",
              api_key: apiKey,
              signature,
            });
            await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
              method: "POST",
              body: deleteBody,
            });
          }
          return Response.json({ ok: true, managed: true, provider: "cloudinary" }, { headers: cors });
        }
      }

      // 2. Legacy Bunny Asset Destruction
      const bunny = bunnyStorageConfig();
      if (currentUrl.hostname === bunny.cdnHostname) {
        const objectKey = decodeURIComponent(currentUrl.pathname.replace(/^\//, ""));
        if (!objectKey.startsWith(prefix) || objectKey.includes("..")) throw new Error("Profile image not found");
        const signedDelete = await presignBunnyObject("DELETE", objectKey, 60);
        const deletion = await fetch(signedDelete.uploadUrl, { method: "DELETE" });
        if (!deletion.ok && deletion.status !== 404) throw new Error("Bunny profile image deletion failed");
        return Response.json({ ok: true, managed: true, provider: "bunny" }, { headers: cors });
      }

      return Response.json({ ok: true, managed: false }, { headers: cors });
    }

    // Action: Sign / Authorize upload
    const mimeType = String(body.mimeType ?? "").toLowerCase();
    const fileSize = Number(body.fileSize ?? 0);
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]).has(mimeType)) {
      throw new Error("Unsupported profile image type");
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
      throw new Error("Profile image optimization did not produce a valid upload file");
    }

    const assetId = crypto.randomUUID();
    const folder = prefix.replace(/\/$/, "");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "hp6vu8o9";
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const uploadPreset = Deno.env.get("CLOUDINARY_UPLOAD_PRESET") || Deno.env.get("EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET");

    if (apiSecret && apiKey) {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        folder,
        overwrite: "true",
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
      { error: error instanceof Error ? error.message : "Unable to manage profile image" },
      { status: 400, headers: cors },
    );
  }
});
