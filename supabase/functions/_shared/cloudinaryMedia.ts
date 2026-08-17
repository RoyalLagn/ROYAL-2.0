// Shared clip-media (video + thumbnail) Cloudinary deletion logic. Extracted
// verbatim from clip-cloudinary-delete/index.ts (the vendor-facing clip
// deletion function) so a second caller — the admin clip deletion function —
// reuses the exact same, already-tested deletion/fallback/verification
// behavior instead of a second copy of this logic. No behavior changed here;
// this is a relocation, not a rewrite.

const OPERATION_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
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

export function requireCloudinaryEnv() {
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const missingCloudinarySecrets = [
    !cloudName && "CLOUDINARY_CLOUD_NAME",
    !apiKey && "CLOUDINARY_API_KEY",
    !apiSecret && "CLOUDINARY_API_SECRET",
  ].filter(Boolean) as string[];
  if (missingCloudinarySecrets.length > 0) {
    throw new Error(`Cloudinary deletion is not configured. Missing Edge Function secrets: ${missingCloudinarySecrets.join(", ")}`);
  }
  return { cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! };
}

/**
 * Deletes both the video asset at `publicId` and its co-located thumbnail
 * (`publicId` with a trailing `/video` replaced by `/thumbnail`) from
 * Cloudinary, verifying each deletion. Throws a clear Error on any failure —
 * callers must not treat a thrown error as a partial success.
 */
export async function deleteClipCloudinaryAssets(
  publicId: string,
  log: { requestId: string; clipId?: string | null; vendorId?: string | null },
) {
  const { cloudName, apiKey, apiSecret } = requireCloudinaryEnv();
  const { requestId, clipId = null, vendorId = null } = log;
  const deliveryType = "upload";

  for (const [assetPublicId, resourceType] of [
    [publicId, "video"],
    [publicId.replace(/\/video$/, "/thumbnail"), "image"],
  ] as const) {
    console.log("[cloudinaryMedia] Deleting asset", {
      requestId, clipId, vendorId,
      publicId: assetPublicId, publicIdExists: Boolean(assetPublicId),
      deletionMethod: "Admin API DELETE /resources (Basic Auth)",
      resourceType, deliveryType,
    });

    let { response, result, safeResponseBody } = await adminDeleteAsset({
      cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType,
    });
    let deletionMethod = "Admin API DELETE /resources (Basic Auth)";

    const adminApiDeniedAsset = response.status === 403
      || result?.unauthorized?.includes(assetPublicId) === true;
    if (adminApiDeniedAsset) {
      console.error("[cloudinaryMedia] Admin API deletion rejected, retrying via Upload API destroy", {
        requestId, clipId, vendorId,
        publicId: assetPublicId, resourceType, deliveryType,
        cloudinaryStatus: response.status, cloudinaryResponse: safeResponseBody,
      });
      const fallback = await uploadApiDestroyAsset({
        cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType,
      });
      response = fallback.response;
      safeResponseBody = fallback.safeResponseBody;
      deletionMethod = "Upload API destroy (signed, fallback)";
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
      console.error("[cloudinaryMedia] Storage deletion rejected", {
        requestId, clipId, vendorId,
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
      const verification = await adminGetAsset({
        cloudName, apiKey, apiSecret, publicId: assetPublicId, resourceType,
      });
      if (verification.response.status === 404) {
        assetStatus = "not_found";
        isConfirmed = true;
      } else if (!verification.response.ok) {
        console.error("[cloudinaryMedia] Unable to verify storage deletion", {
          requestId, publicId: assetPublicId, resourceType, deletionMethod,
          verificationStatus: verification.response.status,
          verificationResponse: verification.safeResponseBody,
        });
      }
    }
    if (!isConfirmed) {
      console.error("[cloudinaryMedia] Storage deletion returned an unexpected result", {
        requestId, publicId: assetPublicId, resourceType, deletionMethod, result,
      });
      throw new Error(
        `Cloudinary ${resourceType} deletion was not confirmed`
        + ` [debug method=${deletionMethod} status=${response.status} body=${safeResponseBody}]`,
      );
    }
    console.log("[cloudinaryMedia] Asset deletion result", {
      requestId, clipId, vendorId,
      publicId: assetPublicId, deletionMethod,
      resourceType, deliveryType, cloudinaryStatus: response.status,
      cloudinaryResult: assetStatus,
    });
  }
}
