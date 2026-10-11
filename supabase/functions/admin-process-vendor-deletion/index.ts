import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, presignBunnyObject } from "../_shared/bunnyS3.ts";
import { deleteClipBunnyAssets } from "../_shared/bunnyClipMedia.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
function hasAal2(token: string) { try { const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).aal === "aal2"; } catch { return false; } }

async function sha1(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractCloudinaryPublicId(url: string): string | null {
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

async function destroyCloudinaryAsset(publicId: string, resourceType = "image") {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "hp6vu8o9";
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!apiSecret || !apiKey || !cloudName) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    invalidate: "true",
    api_key: apiKey,
    signature,
  });
  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body,
  }).catch(() => undefined);
}

async function deleteCloudinaryUrl(value: string | null | undefined, allowedPrefixes: string[]) {
  if (!value) return;
  const publicId = extractCloudinaryPublicId(value);
  if (!publicId || !allowedPrefixes.some((prefix) => publicId.startsWith(prefix))) return;
  await destroyCloudinaryAsset(publicId);
}

async function deleteBunnyUrl(value: string | null | undefined, allowedPrefixes: string[]) {
  if (!value) return;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return; }
  const bunny = bunnyStorageConfig();
  if (parsed.hostname !== bunny.cdnHostname) return;
  const objectKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (objectKey.includes("..") || !allowedPrefixes.some((prefix) => objectKey.startsWith(prefix))) return;
  try {
    const signed = await presignBunnyObject("DELETE", objectKey, 60);
    const deletion = await fetch(signed.uploadUrl, { method: "DELETE" });
    if (!deletion.ok && deletion.status !== 404) console.warn(`Bunny storage deletion status (${deletion.status})`);
  } catch (e) {
    console.warn("Bunny storage deletion error:", e);
  }
}

async function deleteMediaAsset(
  media: { public_id?: string | null; secure_url?: string | null; resource_type?: string | null },
  vendorPrefix: string,
) {
  if (!media.secure_url) return;
  let parsed: URL;
  try { parsed = new URL(media.secure_url); } catch { return; }

  // Cloudinary
  if (/res\.cloudinary\.com/i.test(parsed.hostname)) {
    const publicId = media.public_id || extractCloudinaryPublicId(media.secure_url);
    if (publicId && publicId.startsWith(vendorPrefix)) {
      await destroyCloudinaryAsset(publicId, media.resource_type === "video" ? "video" : "image");
    }
    return;
  }

  // Bunny Stream / Storage
  const objectKey = media.public_id?.includes(".")
    ? media.public_id
    : decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (objectKey.endsWith("playlist.m3u8") && parsed.hostname.endsWith(".b-cdn.net")) {
    const videoId = objectKey.split("/")[0];
    const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
    if (videoId && libraryId && apiKey) {
      await fetch(
        `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
        { method: "DELETE", headers: { AccessKey: apiKey } },
      ).catch(() => undefined);
    }
    return;
  }
  await deleteBunnyUrl(media.secure_url, [vendorPrefix]);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const adminClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await adminClient.auth.getUser();
    if (!user) return json({ error: "Admin session required" }, 401);
    if (!hasAal2(token)) return json({ error: "Administrator MFA verification required" }, 403);
    const { data: profile } = await service.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
    if (!profile?.is_active || !["admin", "super_admin"].includes(profile.role)) return json({ error: "Admin access required" }, 403);
    const body = await request.json();
    const requestId = String(body.requestId || "");
    const reason = String(body.reason || "").trim();
    if (!requestId || reason.length < 5) return json({ error: "A valid request and decision reason are required" }, 400);

    if (body.decision === "reject") {
      const { data, error } = await service.from("account_deletion_requests").update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString(), decision_reason: reason, updated_at: new Date().toISOString() }).eq("id", requestId).eq("account_type", "vendor").in("status", ["pending", "verified"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This request is no longer pending");
      return json({ success: true });
    }
    if (body.decision !== "approve") return json({ error: "Invalid decision" }, 400);

    const { data: requestRow, error: requestError } = await service.from("account_deletion_requests").select("status,processing_stage,vendor_id,requester_user_id").eq("id", requestId).eq("account_type", "vendor").maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) throw new Error("Vendor deletion request not found");
    let target: { vendor_id: string; profile_id: string } | null = null;
    if (requestRow.status === "processing") {
      if (!requestRow.requester_user_id) throw new Error("Vendor login was already removed; contact database support to finalize this audit record");
      if (requestRow.processing_stage === "auth") {
        const { error: authError } = await service.auth.admin.deleteUser(requestRow.requester_user_id);
        if (authError) throw authError;
        const { error: finalError } = await service.from("account_deletion_requests").update({ status: "completed", email: `deleted+${requestId}@redacted.invalid`, full_name: "Deleted vendor", phone: null, reason: null, vendor_snapshot: null, completed_at: new Date().toISOString(), processing_stage: "completed", processing_error: null, updated_at: new Date().toISOString() }).eq("id", requestId);
        if (finalError) throw finalError;
        return json({ success: true });
      }
      if (!requestRow.vendor_id) throw new Error("Vendor workspace is missing; contact database support before retrying");
      target = { vendor_id: requestRow.vendor_id, profile_id: requestRow.requester_user_id };
    } else {
      const { data: prepared, error: prepareError } = await adminClient.rpc("admin_prepare_vendor_deletion", { target_request_id: requestId, admin_reason: reason });
      if (prepareError) throw prepareError;
      target = prepared?.[0] ?? null;
    }
    if (!target) throw new Error("Vendor no longer exists");
    try {
      const [{ data: vendorMedia }, { data: portfolioMedia }, { data: clips }, { data: applications }] = await Promise.all([
        service.from("vendors").select("logo_url").eq("id", target.vendor_id).maybeSingle(),
        service.from("vendor_portfolio_media").select("public_id,secure_url,resource_type").eq("vendor_id", target.vendor_id),
        service.from("clips").select("id,bunny_asset_id").eq("vendor_id", target.vendor_id),
        service.from("vendor_applications").select("logo_url,cover_image_url,business_documents").eq("profile_id", target.profile_id),
      ]);
      const vendorPrefix = `royallagn/vendors/${target.vendor_id}/`;
      const generalPrefix = `royallagn/general/${target.profile_id}/`;
      const documentPrefix = `royallagn/document/${target.profile_id}/`;
      await Promise.all([
        deleteBunnyUrl(vendorMedia?.logo_url, [vendorPrefix, generalPrefix]),
        deleteCloudinaryUrl(vendorMedia?.logo_url, [vendorPrefix, generalPrefix]),
        ...(portfolioMedia ?? []).map((media) => deleteMediaAsset(media, vendorPrefix)),
        ...(applications ?? []).flatMap((application) => [
          deleteBunnyUrl(application.logo_url, [generalPrefix, vendorPrefix]),
          deleteCloudinaryUrl(application.logo_url, [generalPrefix, vendorPrefix]),
          deleteBunnyUrl(application.cover_image_url, [generalPrefix, vendorPrefix]),
          deleteCloudinaryUrl(application.cover_image_url, [generalPrefix, vendorPrefix]),
          ...((application.business_documents ?? []) as { url?: string }[]).flatMap((document) => [
            deleteBunnyUrl(document.url, [documentPrefix, vendorPrefix]),
            deleteCloudinaryUrl(document.url, [documentPrefix, vendorPrefix]),
          ]),
        ]),
      ]);
      for (const clip of clips ?? []) {
        if (clip.bunny_asset_id) {
          await deleteClipBunnyAssets(clip.bunny_asset_id, {
            requestId: crypto.randomUUID(), clipId: clip.id, vendorId: target.vendor_id,
          });
        }
      }
      const { error: cleanupError } = await adminClient.rpc("admin_complete_vendor_deletion", { target_request_id: requestId });
      if (cleanupError) throw cleanupError;
      const { error: authError } = await service.auth.admin.deleteUser(target.profile_id);
      if (authError) throw authError;
      const { error: finalError } = await service.from("account_deletion_requests").update({ status: "completed", email: `deleted+${requestId}@redacted.invalid`, full_name: "Deleted vendor", phone: null, reason: null, vendor_snapshot: null, completed_at: new Date().toISOString(), processing_stage: "completed", processing_error: null, updated_at: new Date().toISOString() }).eq("id", requestId);
      if (finalError) throw finalError;
      return json({ success: true });
    } catch (error) {
      await service.from("account_deletion_requests").update({ status: "processing", processing_error: error instanceof Error ? error.message : "Deletion failed", updated_at: new Date().toISOString() }).eq("id", requestId);
      throw error;
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to process deletion" }, 400);
  }
});
