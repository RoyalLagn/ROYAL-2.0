import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, extensionForMime, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      const bunny = bunnyStorageConfig();
      if (currentUrl?.hostname === bunny.cdnHostname) {
        const objectKey = decodeURIComponent(currentUrl.pathname.replace(/^\//, ""));
        if (!objectKey.startsWith(prefix) || objectKey.includes("..")) throw new Error("Profile image not found");
        const signedDelete = await presignBunnyObject("DELETE", objectKey, 60);
        const deletion = await fetch(signedDelete.uploadUrl, { method: "DELETE" });
        if (!deletion.ok && deletion.status !== 404) throw new Error("Bunny profile image deletion failed");
        return Response.json({ ok: true, managed: true, provider: "bunny" }, { headers: cors });
      }
      return Response.json({ ok: true, managed: false }, { headers: cors });
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

  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to manage profile image" },
      { status: 400, headers: cors },
    );
  }
});
