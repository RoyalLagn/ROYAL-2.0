import { destroyCloudinaryAsset, extractCloudinaryPublicId } from "./cloudinaryAdmin.ts";

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

/**
 * Removes verified Cloudinary clip media. Unmigrated identities must never
 * be acknowledged as deleted: keep the outbox job for recovery.
 */
export async function deleteClipMediaAssets(
  assetId: string,
  _log: { requestId: string; clipId?: string | null; vendorId?: string | null },
) {
  const id = String(assetId ?? "").trim();
  if (!id) return;

  const publicId = extractCloudinaryPublicId(id) ?? (id.startsWith("royallagn/clips/") ? id : null);
  if (!publicId || !publicId.startsWith("royallagn/clips/")) throw new Error("Clip requires media migration; deletion deferred");
  if (_log.vendorId && !publicId.startsWith(`royallagn/clips/${_log.vendorId}/`)) throw new Error("Clip ownership mismatch");

  await destroyCloudinaryAsset(publicId, "video");
}
