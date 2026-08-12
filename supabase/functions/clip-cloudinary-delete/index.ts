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

async function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const canonical = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return sha1(`${canonical}${apiSecret}`);
}

function safeCloudinaryResponse(body: string, apiKey: string, signature?: string) {
  let redacted = body.replaceAll(apiKey, "[REDACTED_API_KEY]");
  if (signature) redacted = redacted.replaceAll(signature, "[REDACTED_SIGNATURE]");
  return redacted.slice(0, 2_000);
}

type DestroyResult = { result?: string; error?: { message?: string } };
type AdminDeleteResult = {
  deleted?: Record<string, string>;
  unauthorized?: string[];
  partial?: boolean;
  error?: { message?: string };
};

/**
 * Deletes a single Cloudinary asset using the Admin API's bulk-delete endpoint
 * (DELETE /resources/:resource_type/:type), authenticated with HTTP Basic Auth
 * (api_key:api_secret).
 *
 * This is deliberately used instead of the Upload API's "destroy" method:
 * Cloudinary's restricted/scoped API keys frequently disable the "delete"
 * action on the Upload API while still permitting the equivalent Admin API
 * call, which is the failure mode behind the 403
 * "missing permissions (actions=[\"delete\"])" response this function used to hit.
 */
async function adminDeleteAsset(options: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  publicId: string;
  resourceType: "video" | "image";
}) {
  const { cloudName, apiKey, apiSecret, publicId, resourceType } = options;
  const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload`);
  url.searchParams.set("public_ids[]", publicId);
  url.searchParams.set("invalidate", "true");
  const basicAuth = `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
  const response = await fetchWithTimeout(url.toString(), {
    method: "DELETE",
    headers: { Authorization: basicAuth },
  });
  const responseText = await response.text();
  const safeResponseBody = safeCloudinaryResponse(responseText, apiKey);
  const result = (() => {
    try { return JSON.parse(responseText) as AdminDeleteResult; }
    catch { return null; }
  })();
  return { response, result, safeResponseBody };
}

async function adminGetAsset(options: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  publicId: string;
  resourceType: "video" | "image";
}) {
  const { cloudName, apiKey, apiSecret, publicId, resourceType } = options;
  const encodedPublicId = encodeURIComponent(publicId);
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload/${encodedPublicId}`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
  });
  const responseText = await response.text();
  return {
    response,
    safeResponseBody: safeCloudinaryResponse(responseText, apiKey),
  };
}

/**
 * Falls back to the signed Upload API "destroy" method. Kept as a fallback
 * only: some accounts/keys are configured the other way around (destroy
 * allowed, Admin API restricted), so if the Admin API call itself is
 * rejected for permissions reasons we still give the signed method a try
 * before giving up.
 */
async function uploadApiDestroyAsset(options: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  publicId: string;
  resourceType: "video" | "image";
}) {
  const { cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType } = options;
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = { public_id: assetPublicId, timestamp: String(timestamp) };
  const signature = await signCloudinaryParams(signedParams, apiSecret);
  const body = new URLSearchParams({ ...signedParams, api_key: apiKey, signature });
  const response = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body,
  });
  const responseText = await response.text();
  const safeResponseBody = safeCloudinaryResponse(responseText, apiKey, signature);
  const result = (() => {
    try { return JSON.parse(responseText) as DestroyResult; }
    catch { return null; }
  })();
  return { response, result, safeResponseBody };
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
      if (!vendor || !publicId?.startsWith(`royallagn/clips/${vendorId}/`)) {
        throw new Error("Owned Clip asset not found");
      }
    }
    if (!publicId) throw new Error("Owned Clip not found");
    console.log("[clip-cloudinary-delete] Ownership verified", {
      requestId, clipId: clipId ?? null, vendorId: ownedVendorId,
      publicId, publicIdExists: true,
    });
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const missingCloudinarySecrets = [
      !cloudName && "CLOUDINARY_CLOUD_NAME",
      !apiKey && "CLOUDINARY_API_KEY",
      !apiSecret && "CLOUDINARY_API_SECRET",
    ].filter(Boolean);
    if (missingCloudinarySecrets.length > 0) {
      throw new Error(`Cloudinary deletion is not configured. Missing Edge Function secrets: ${missingCloudinarySecrets.join(", ")}`);
    }
    const deliveryType = "upload";
    for (const [assetPublicId, resourceType] of [
      [publicId, "video"],
      [publicId.replace(/\/video$/, "/thumbnail"), "image"],
    ] as const) {
      console.log("[clip-cloudinary-delete] Deleting asset", {
        requestId, clipId: clipId ?? null, vendorId: ownedVendorId,
        publicId: assetPublicId, publicIdExists: Boolean(assetPublicId),
        deletionMethod: "Admin API DELETE /resources (Basic Auth)",
        resourceType, deliveryType,
      });

      let { response, result, safeResponseBody } = await adminDeleteAsset({
        cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType,
      });
      let deletionMethod = "Admin API DELETE /resources (Basic Auth)";

      // The Admin API returns 200 with a per-asset status even when the
      // asset doesn't exist, so a non-2xx response here is a real failure
      // (auth, permissions, bad cloud name, etc). If it's a permissions
      // failure, retry once via the signed Upload API destroy method in
      // case this particular key/account is configured the other way
      // around.
      const adminApiDeniedAsset = response.status === 403
        || result?.unauthorized?.includes(assetPublicId) === true;
      if (adminApiDeniedAsset) {
        console.error("[clip-cloudinary-delete] Admin API deletion rejected, retrying via Upload API destroy", {
          requestId, clipId: clipId ?? null, vendorId: ownedVendorId,
          publicId: assetPublicId, resourceType, deliveryType,
          cloudinaryStatus: response.status, cloudinaryResponse: safeResponseBody,
        });
        const fallback = await uploadApiDestroyAsset({
          cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType,
        });
        response = fallback.response;
        safeResponseBody = fallback.safeResponseBody;
        deletionMethod = "Upload API destroy (signed, fallback)";
        // Normalize the Upload API's "ok" / "not found" result strings onto
        // the same "deleted" / "not_found" vocabulary the Admin API uses,
        // so the confirmation check below treats both paths identically.
        const fallbackStatus = fallback.result?.result === "ok"
          ? "deleted"
          : fallback.result?.result === "not found"
          ? "not_found"
          : undefined;
        result = fallbackStatus
          ? { deleted: { [assetPublicId]: fallbackStatus }, error: fallback.result?.error }
          : result;
      }

      if (!response.ok) {
        console.error("[clip-cloudinary-delete] Storage deletion rejected", {
          requestId, clipId: clipId ?? null, vendorId: ownedVendorId,
          publicId: assetPublicId, publicIdExists: Boolean(assetPublicId),
          deletionMethod, resourceType, deliveryType,
          cloudinaryStatus: response.status, cloudinaryResponse: safeResponseBody,
        });
        const cloudinaryMessage = result?.error?.message?.trim();
        throw new Error(
          `Cloudinary ${resourceType} deletion failed with status ${response.status}`
          + (cloudinaryMessage ? `: ${cloudinaryMessage}` : ""),
        );
      }

      let assetStatus = result?.deleted?.[assetPublicId];
      let isConfirmed = assetStatus === "deleted" || assetStatus === "not_found";
      if (!isConfirmed) {
        // Cloudinary has returned more than one successful bulk-delete body
        // shape over time. Do not fail (and retry the delete three times)
        // merely because a 2xx response omitted the expected map entry.
        // Confirm the authoritative post-condition with the Admin resource
        // endpoint: 404 means the asset is gone, regardless of response shape.
        const verification = await adminGetAsset({
          cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType,
        });
        if (verification.response.status === 404) {
          assetStatus = "not_found";
          isConfirmed = true;
        } else if (!verification.response.ok) {
          console.error("[clip-cloudinary-delete] Unable to verify storage deletion", {
            requestId, publicId: assetPublicId, resourceType, deletionMethod,
            verificationStatus: verification.response.status,
            verificationResponse: verification.safeResponseBody,
          });
        }
      }
      if (!isConfirmed) {
        console.error("[clip-cloudinary-delete] Storage deletion returned an unexpected result", {
          requestId, publicId: assetPublicId, resourceType, deletionMethod, result,
        });
        throw new Error(
          `Cloudinary ${resourceType} deletion was not confirmed`
          + ` [debug method=${deletionMethod} status=${response.status} body=${safeResponseBody}]`,
        );
      }
      console.log("[clip-cloudinary-delete] Asset deletion result", {
        requestId, clipId: clipId ?? null, vendorId: ownedVendorId,
        publicId: assetPublicId, deletionMethod,
        resourceType, deliveryType, cloudinaryStatus: response.status,
        cloudinaryResult: assetStatus,
      });
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
