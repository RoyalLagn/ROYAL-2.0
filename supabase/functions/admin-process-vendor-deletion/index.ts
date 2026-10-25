import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { destroyCloudinaryAsset, extractCloudinaryPublicId, cloudinaryResourceType } from "../_shared/cloudinaryAdmin.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
function hasAal2(token: string) { try { const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).aal === "aal2"; } catch { return false; } }

async function deleteCloudinaryUrl(value: string | null | undefined, allowedPrefixes: string[]) {
  if (!value) return;
  try {
    const publicId = extractCloudinaryPublicId(value);
    if (!publicId || !allowedPrefixes.some((prefix) => publicId.startsWith(prefix))) return;
    await destroyCloudinaryAsset(publicId, cloudinaryResourceType(value));
  } catch (error) {
    console.error("[admin-process-vendor-deletion] media cleanup skipped", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteMediaAsset(
  media: { public_id?: string | null; secure_url?: string | null; resource_type?: string | null },
  vendorPrefix: string,
) {
  if (!media.secure_url) return;
  try {
    const publicId = extractCloudinaryPublicId(media.secure_url) || (media.public_id?.startsWith(vendorPrefix) ? media.public_id : null);
    if (!publicId || !publicId.startsWith(vendorPrefix)) return;
    await destroyCloudinaryAsset(publicId, media.resource_type === "video" ? "video" : "image");
  } catch (error) {
    console.error("[admin-process-vendor-deletion] media cleanup skipped", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
      const [{ data: vendorMedia }, { data: portfolioMedia }, { data: applications }] = await Promise.all([
        service.from("vendors").select("logo_url").eq("id", target.vendor_id).maybeSingle(),
        service.from("vendor_portfolio_media").select("public_id,secure_url,resource_type").eq("vendor_id", target.vendor_id),
        service.from("vendor_applications").select("logo_url,cover_image_url,business_documents").eq("profile_id", target.profile_id),
      ]);
      const vendorPrefix = `royallagn/vendors/${target.vendor_id}/`;
      const generalPrefix = `royallagn/general/${target.profile_id}/`;
      const applicationPrefix = `royallagn/applications/${target.profile_id}/`;
      const documentPrefix = `royallagn/documents/${target.profile_id}/`;
      const mediaPrefixes = [vendorPrefix, generalPrefix, applicationPrefix, documentPrefix, "royallagn/general/"];
      await Promise.all([
        deleteCloudinaryUrl(vendorMedia?.logo_url, mediaPrefixes),
        ...(portfolioMedia ?? []).map((media) => deleteMediaAsset(media, vendorPrefix)),
        ...(applications ?? []).flatMap((application) => [
          deleteCloudinaryUrl(application.logo_url, mediaPrefixes),
          deleteCloudinaryUrl(application.cover_image_url, mediaPrefixes),
          ...((application.business_documents ?? []) as { url?: string }[]).map((document) =>
            deleteCloudinaryUrl(document.url, mediaPrefixes),
          ),
        ]),
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
