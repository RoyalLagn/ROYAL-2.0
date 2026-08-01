import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const OPERATION_TIMEOUT_MS = 30_000;

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
    if (clipId) {
      const { data: clip } = await supabase.from("clips").select("cloudinary_public_id,vendor_id,vendors!inner(profile_id)")
        .eq("id", clipId).eq("vendors.profile_id", user.id).maybeSingle();
      publicId = clip?.cloudinary_public_id;
      ownedVendorId = clip?.vendor_id;
    } else {
      const { data: vendor } = await supabase.from("vendors").select("id")
        .eq("id", vendorId).eq("profile_id", user.id).maybeSingle();
      if (!vendor || !publicId?.startsWith(`royallagn/clips/${vendorId}/`)) {
        throw new Error("Owned Clip asset not found");
      }
    }
    if (!publicId) throw new Error("Owned Clip not found");
    const { error: accessError } = await supabase.rpc("require_vendor_feature_access", {
      target_vendor_id: ownedVendorId,
      requested_feature_key: "upload_clips",
    });
    if (accessError) throw accessError;
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    if (!apiSecret || !apiKey || !cloudName) throw new Error("Cloudinary deletion is not configured");
    const timestamp = Math.floor(Date.now() / 1000);
    for (const [publicId, resourceType] of [
      [publicId, "video"],
      [publicId.replace(/\/video$/, "/thumbnail"), "image"],
    ]) {
      console.log("[clip-cloudinary-delete] Deleting asset", { requestId, publicId, resourceType });
      const signature = await sha1(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
      const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature });
      const response = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, { method: "POST", body });
      if (!response.ok) throw new Error("Cloudinary asset deletion failed");
      await response.json();
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
