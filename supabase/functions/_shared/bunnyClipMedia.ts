import { presignBunnyObject } from "./bunnyS3.ts";

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

/** Deletes the Bunny Stream video and the optional custom Bunny thumbnail. */
export async function deleteClipBunnyAssets(
  assetId: string,
  log: { requestId: string; clipId?: string | null; vendorId?: string | null },
) {
  const [, videoId, storedClipId] = String(assetId).split(":");
  if (!assetId.startsWith("bunny:") || !videoId) {
    throw new Error("Clip does not contain a valid Bunny asset ID");
  }
  const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID")?.trim();
  const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY")?.trim();
  if (!libraryId || !apiKey) throw new Error("Bunny Stream deletion is not configured");

  const deletion = await fetchWithTimeout(
    `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoId)}`,
    { method: "DELETE", headers: { AccessKey: apiKey } },
  );
  if (!deletion.ok && deletion.status !== 404) {
    throw new Error(`Bunny Stream deletion failed (${deletion.status})`);
  }

  const targetClipId = log.clipId || storedClipId;
  if (log.vendorId && targetClipId) {
    for (const extension of ["jpg", "png"]) {
      const signed = await presignBunnyObject(
        "DELETE",
        `clips/${log.vendorId}/${targetClipId}/thumbnail.${extension}`,
        60,
      );
      const thumbnailDelete = await fetchWithTimeout(signed.uploadUrl, { method: "DELETE" });
      if (!thumbnailDelete.ok && thumbnailDelete.status !== 404) {
        throw new Error(`Bunny thumbnail deletion failed (${thumbnailDelete.status})`);
      }
    }
  }
}
