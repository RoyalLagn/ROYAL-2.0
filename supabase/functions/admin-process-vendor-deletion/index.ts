import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bunnyStorageConfig, presignBunnyObject } from "../_shared/bunnyS3.ts";
import { deleteClipCloudinaryAssets } from "../_shared/cloudinaryMedia.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
function hasAal2(token: string) { try { const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).aal === "aal2"; } catch { return false; } }

async function deletePrefix(prefix: string, type: "image" | "video") {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const key = Deno.env.get("CLOUDINARY_API_KEY");
  const secret = Deno.env.get("CLOUDINARY_API_SECRET");
  // Legacy cleanup is best-effort so removing Cloudinary credentials cannot
  // block deletion of a Bunny-backed vendor account.
  if (!cloud || !key || !secret) return;
  let cursor = "";
  do {
    const endpoint = new URL(`https://api.cloudinary.com/v1_1/${cloud}/resources/${type}/upload`);
    endpoint.searchParams.set("prefix", prefix);
    endpoint.searchParams.set("invalidate", "true");
    if (cursor) endpoint.searchParams.set("next_cursor", cursor);
    const response = await fetch(endpoint, { method: "DELETE", headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` } });
    if (!response.ok) throw new Error(`Cloudinary ${type} cleanup failed`);
    const payload = await response.json();
    cursor = String(payload.next_cursor || "");
  } while (cursor);
}

async function deleteBunnyUrl(value: string | null | undefined, allowedPrefixes: string[]) {
  if (!value) return;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return; }
  const bunny = bunnyStorageConfig();
  if (parsed.hostname !== bunny.cdnHostname) return;
  const objectKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (objectKey.includes("..") || !allowedPrefixes.some((prefix) => objectKey.startsWith(prefix))) return;
  const signed = await presignBunnyObject("DELETE", objectKey, 60);
  const deletion = await fetch(signed.uploadUrl, { method: "DELETE" });
  if (!deletion.ok && deletion.status !== 404) throw new Error(`Bunny storage deletion failed (${deletion.status})`);
}

async function deleteBunnyPortfolioAsset(
  media: { public_id?: string | null; secure_url?: string | null },
  vendorPrefix: string,
) {
  if (!media.secure_url) return;
  let parsed: URL;
  try { parsed = new URL(media.secure_url); } catch { return; }
  const objectKey = media.public_id?.includes(".")
    ? media.public_id
    : decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (objectKey.endsWith("playlist.m3u8") && parsed.hostname.endsWith(".b-cdn.net")) {
    const videoId = objectKey.split("/")[0];
    const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
    const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
    if (!videoId || !libraryId || !apiKey) throw new Error("Bunny Stream deletion is not configured");
    const deletion = await fetch(
      `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
      { method: "DELETE", headers: { AccessKey: apiKey } },
    );
    if (!deletion.ok && deletion.status !== 404) throw new Error(`Bunny Stream deletion failed (${deletion.status})`);
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
        service.from("vendors").select("logo_url,cover_image_url").eq("id", target.vendor_id).maybeSingle(),
        service.from("vendor_portfolio_media").select("public_id,secure_url").eq("vendor_id", target.vendor_id),
        service.from("clips").select("id,cloudinary_public_id").eq("vendor_id", target.vendor_id),
        service.from("vendor_applications").select("logo_url,cover_image_url,business_documents").eq("profile_id", target.profile_id),
      ]);
      const vendorPrefix = `royallagn/vendors/${target.vendor_id}/`;
      const generalPrefix = `royallagn/general/${target.profile_id}/`;
      const documentPrefix = `royallagn/document/${target.profile_id}/`;
      await Promise.all([
        deleteBunnyUrl(vendorMedia?.logo_url, [vendorPrefix, generalPrefix]),
        deleteBunnyUrl(vendorMedia?.cover_image_url, [vendorPrefix, generalPrefix]),
        ...(portfolioMedia ?? []).map((media) => deleteBunnyPortfolioAsset(media, vendorPrefix)),
        ...(applications ?? []).flatMap((application) => [
          deleteBunnyUrl(application.logo_url, [generalPrefix, vendorPrefix]),
          deleteBunnyUrl(application.cover_image_url, [generalPrefix, vendorPrefix]),
          ...((application.business_documents ?? []) as { url?: string }[]).map((document) =>
            deleteBunnyUrl(document.url, [documentPrefix, vendorPrefix])),
        ]),
      ]);
      for (const clip of clips ?? []) {
        if (clip.cloudinary_public_id) {
          await deleteClipCloudinaryAssets(clip.cloudinary_public_id, {
            requestId: crypto.randomUUID(), clipId: clip.id, vendorId: target.vendor_id,
          });
        }
      }
      await Promise.all([
        deletePrefix(`royallagn/vendors/${target.vendor_id}/`, "image"),
        deletePrefix(`royallagn/vendors/${target.vendor_id}/`, "video"),
        deletePrefix(`royallagn/clips/${target.vendor_id}/`, "image"),
        deletePrefix(`royallagn/clips/${target.vendor_id}/`, "video"),
      ]);
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
