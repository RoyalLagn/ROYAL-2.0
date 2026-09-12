import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, extensionForMime, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha1(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function publicIdFromUrl(value: string) {
  const parsed = new URL(value);
  const marker = "/image/upload/";
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  const tail = parsed.pathname.slice(markerIndex + marker.length);
  const parts = tail.split("/");
  const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
  const assetParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts;
  return decodeURIComponent(assetParts.join("/")).replace(/\.[^.]+$/, "");
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

    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const uploadPreset = Deno.env.get("CLOUDINARY_UPLOAD_PRESET");
    if (body.action === "delete") {
      const currentUrl = typeof body.url === "string" ? new URL(body.url) : null;
      const bunny = bunnyStorageConfig();
      if (currentUrl?.hostname === bunny.cdnHostname) {
        const objectKey = decodeURIComponent(currentUrl.pathname.replace(/^\//, ""));
        if (!objectKey.startsWith(prefix) || objectKey.includes("..")) throw new Error("Profile image not found");
        const signedDelete = await presignBunnyObject("DELETE", objectKey, 60);
        const deletion = await fetch(signedDelete.uploadUrl, { method: "DELETE" });
        if (!deletion.ok && deletion.status !== 404) throw new Error("Bunny profile image deletion failed");
        return Response.json({ ok: true, managed: true, provider: "bunny" }, { headers: cors });
      }
      if (!apiSecret || !apiKey || !cloudName) {
        throw new Error("Cloudinary API credentials are required to delete previous images");
      }
      const publicId = typeof body.url === "string" ? publicIdFromUrl(body.url) : null;
      if (!publicId || !publicId.startsWith(prefix) || publicId.includes("..")) {
        return Response.json({ ok: true, managed: false }, { headers: cors });
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const canonical = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}`;
      const destroyBody = new URLSearchParams({
        public_id: publicId,
        timestamp: String(timestamp),
        invalidate: "true",
        api_key: apiKey,
        signature: await sha1(`${canonical}${apiSecret}`),
      });
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        { method: "POST", body: destroyBody },
      );
      const result = await response.json();
      if (!response.ok || !["ok", "not found"].includes(result.result)) {
        throw new Error("Cloudinary deletion failed");
      }
      return Response.json({ ok: true, managed: true }, { headers: cors });
    }

    const mimeType = String(body.mimeType ?? "").toLowerCase();
    const fileSize = Number(body.fileSize ?? 0);
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]).has(mimeType)) {
      throw new Error("Unsupported profile image type");
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
      throw new Error("Profile image optimization did not produce a valid upload file");
    }

    const objectKey = `${prefix}${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
    return Response.json(await presignBunnyObject("PUT", objectKey), { headers: cors });

    /* Cloudinary signing below is retained temporarily as migration reference.
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = prefix.slice(0, -1);
    const publicId = crypto.randomUUID();
    if (!apiSecret || !apiKey) {
      if (!uploadPreset) throw new Error("Cloudinary upload credentials are missing");
      return Response.json({
        uploadMode: "unsigned",
        uploadPreset,
        cloudName,
        folder,
        public_id: publicId,
      }, { headers: cors });
    }
    const params = {
      folder,
      overwrite: "false",
      public_id: publicId,
      timestamp,
      unique_filename: "false",
    };
    const canonical = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    return Response.json({
      ...params,
      uploadMode: "signed",
      apiKey,
      cloudName,
      signature: await sha1(`${canonical}${apiSecret}`),
    }, { headers: cors });
    */
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to manage profile image" },
      { status: 400, headers: cors },
    );
  }
});
