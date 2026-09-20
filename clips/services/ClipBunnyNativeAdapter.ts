import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/services/supabase";
import type { ClipBunnyAsset } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import type { ClipBunnyUploadInput } from "./ClipBunnyService";
import { ClipBunnyService } from "./ClipBunnyService";

type SignResponse = {
  provider: "bunny";
  uploadUrl?: string;
  publicUrl?: string;
  objectKey?: string;
  importUrl?: string;
  streamCdnHostname?: string;
};

type StreamUploadResponse = {
  success: true;
  provider: "bunny";
  videoId: string;
  libraryId: string;
  videoUrl: string;
  thumbnailUrl: string;
  bytes: number;
  storageSize: number;
  status: number | null;
  length: number;
  width: number;
  height: number;
  encodeProgress: number;
};

type BunnyUploadResult = {
  secure_url: string;
  public_id: string;
  bytes: number;
  bunny_thumbnail_url?: string;
  duration?: number;
  width?: number;
  height?: number;
};

const OPERATION_TIMEOUT_MS = 30_000;
const MIN_UPLOAD_TIMEOUT_MS = 8 * 60_000;
const MAX_UPLOAD_TIMEOUT_MS = 15 * 60_000;
const ASSUMED_SLOW_UPLOAD_BYTES_PER_SECOND = 128 * 1024;

async function edgeFunctionMessage(error: unknown, fallback: string) {
  const candidate = error as { message?: string; context?: Response } | null;
  const context = candidate?.context;
  if (context && typeof context.clone === "function") {
    const payload = await context.clone().json().catch(() => null) as { error?: string; message?: string } | null;
    if (payload?.error || payload?.message) return payload.error || payload.message || fallback;
  }
  return candidate?.message && !/non-2xx/i.test(candidate.message) ? candidate.message : fallback;
}

function uploadTimeoutForBytes(bytes: number) {
  const estimatedTransferMs = Math.ceil(
    Math.max(0, bytes) / ASSUMED_SLOW_UPLOAD_BYTES_PER_SECOND,
  ) * 1000;
  return Math.min(
    MAX_UPLOAD_TIMEOUT_MS,
    Math.max(MIN_UPLOAD_TIMEOUT_MS, estimatedTransferMs + 60_000),
  );
}

async function withTimeout<T>(
  label: string,
  operation: PromiseLike<T>,
  onTimeout?: () => void,
  timeoutMs = OPERATION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const startedAt = Date.now();
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ClipLogger.error("upload", `${label} timed out`, { elapsedMs: Date.now() - startedAt });
          reject(new ClipModuleError(
            "UPLOAD_ERROR",
            `${label} timed out. Check your connection and try again.`,
            false,
          ));
          onTimeout?.();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function assetSize(uri: string) {
  const startedAt = Date.now();
  ClipLogger.info("upload", "Preparing thumbnail", { platform: Platform.OS });
  if (Platform.OS !== "web") {
    const info = await withTimeout("Preparing thumbnail", FileSystem.getInfoAsync(uri));
    if (!info.exists || !("size" in info) || !info.size) {
      throw new ClipModuleError("UPLOAD_ERROR", "Unable to read the generated thumbnail.");
    }
    ClipLogger.info("upload", "Thumbnail prepared", { elapsedMs: Date.now() - startedAt, bytes: info.size });
    return info.size;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
  try {
    const response = await fetch(uri, { signal: controller.signal });
    if (!response.ok) throw new ClipModuleError("UPLOAD_ERROR", "Unable to read the selected thumbnail.");
    const size = (await response.blob()).size;
    ClipLogger.info("upload", "Thumbnail prepared", { elapsedMs: Date.now() - startedAt, bytes: size });
    return size;
  } catch (error) {
    if (error instanceof ClipModuleError) throw error;
    throw new ClipModuleError(
      "UPLOAD_ERROR",
      error instanceof Error && error.name === "AbortError"
        ? "Preparing thumbnail timed out after 30 seconds."
        : "Unable to read the selected thumbnail.",
      false,
      error,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function uploadBunnyStreamFromStorage(
  data: Extract<SignResponse, { provider: "bunny" }>,
  input: { uri: string; size: number; mimeType: string; name: string; clipId: string; vendorId: string },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
  shouldCancel: () => boolean = () => false,
) {
  const source = await fetch(input.uri);
  if (!source.ok) throw new ClipModuleError("UPLOAD_ERROR", "Unable to read the selected video file.");
  const blob = await source.blob();
  if (blob.size <= 0 || blob.size !== input.size) {
    throw new ClipModuleError("UPLOAD_ERROR", `Invalid video body: read ${blob.size} of ${input.size} bytes.`, false);
  }
  ClipLogger.info("upload", "[CLIP-UPLOAD] CLIENT_FILE", {
    name: input.name,
    type: blob.type || input.mimeType,
    size: blob.size,
  });
  if (shouldCancel()) throw new ClipModuleError("UPLOAD_ERROR", "Upload cancelled.");
  if (!data.publicUrl) throw new ClipModuleError("UPLOAD_ERROR", "Incomplete Bunny Storage source URL.", false);
  await uploadBunnyObject(data, input, (value) => onProgress?.(value * 0.85), registerAbort);
  if (shouldCancel()) throw new ClipModuleError("UPLOAD_ERROR", "Upload cancelled.");
  onProgress?.(0.88);
  const { data: result, error } = await withTimeout(
    "Importing Clip into Bunny Stream",
    supabase.functions.invoke<StreamUploadResponse>("bunny-stream-upload", {
      body: {
        vendorId: input.vendorId,
        clipId: input.clipId,
        fileName: input.name || `clip-${input.clipId}.mp4`,
        sourceUrl: data.publicUrl,
        expectedBytes: blob.size,
      },
    }),
    undefined,
    uploadTimeoutForBytes(input.size),
  );
  ClipLogger.info("upload", "[CLIP-UPLOAD] EDGE_UPLOAD_RESULT", {
    httpStatus: error ? (error as { context?: Response }).context?.status ?? null : 200,
    response: result,
  });
  if (error || !result?.success) {
    throw new ClipModuleError(
      "UPLOAD_ERROR",
      await edgeFunctionMessage(error, "Bunny Stream URL import failed."),
      false,
      error,
    );
  }
  onProgress?.(0.9);
  return {
    secure_url: result.videoUrl,
    public_id: `bunny:${result.videoId}:${input.clipId}`,
    bytes: result.bytes,
    bunny_thumbnail_url: result.thumbnailUrl,
    duration: result.length,
    width: result.width,
    height: result.height,
  };
}

async function uploadBunnyObject(
  data: Extract<SignResponse, { provider: "bunny" }>,
  input: { uri: string; mimeType: string; size: number },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
) {
  if (!data.uploadUrl || !data.publicUrl || !data.objectKey) throw new ClipModuleError("UPLOAD_ERROR", "Incomplete Bunny Storage authorization.");
  if (Platform.OS !== "web") {
    const task = FileSystem.createUploadTask(
      data.uploadUrl, input.uri,
      { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": input.mimeType } },
      ({ totalBytesSent, totalBytesExpectedToSend }) => totalBytesExpectedToSend > 0 && onProgress?.(totalBytesSent / totalBytesExpectedToSend),
    );
    registerAbort?.(() => task.cancelAsync().catch(() => undefined));
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) throw new ClipModuleError("UPLOAD_ERROR", `Bunny thumbnail upload failed (${result?.status ?? "network"}).`, true);
  } else {
    const blob = await fetch(input.uri).then((response) => response.blob());
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", data.uploadUrl!);
      request.setRequestHeader("Content-Type", input.mimeType);
      request.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
      request.onerror = () => reject(new ClipModuleError("UPLOAD_ERROR", "Network error during Bunny thumbnail upload.", true));
      request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new ClipModuleError("UPLOAD_ERROR", `Bunny thumbnail upload failed (${request.status}).`, true));
      registerAbort?.(() => request.abort());
      request.send(blob);
    });
  }
  onProgress?.(1);
  return { secure_url: data.publicUrl, public_id: data.objectKey, bytes: input.size };
}

async function uploadOne(
  input: { debugUploadId?: string; vendorId: string; clipId: string; kind: "video" | "thumbnail"; uri: string; name: string; mimeType: string; size: number },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
  shouldCancel: () => boolean = () => false,
): Promise<BunnyUploadResult> {
  const uploadId = input.debugUploadId ?? input.clipId;
  const signatureStartedAt = Date.now();
  ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_SIGNATURE`, "START", {
    clipId: input.clipId, vendorId: input.vendorId, bytes: input.size,
  });
  ClipLogger.info("upload", "Bunny authorization request started", {
    kind: input.kind, clipId: input.clipId,
  });
  const { data, error } = await withTimeout(
    `Generating ${input.kind} Bunny upload authorization`,
    supabase.functions.invoke<SignResponse>("clip-upload-sign", {
      body: {
        vendorId: input.vendorId, clipId: input.clipId, kind: input.kind,
        mimeType: input.mimeType, fileSize: input.size, debugUploadId: uploadId,
      },
    }),
  );
  if (error || !data) {
    throw new ClipModuleError(
      "UPLOAD_ERROR",
      await edgeFunctionMessage(error, `Unable to authorize ${input.kind} upload. Check your subscription and connection, then retry.`),
      true,
      error,
    );
  }
  if (data.provider !== "bunny") {
    throw new ClipModuleError("UPLOAD_ERROR", "The media service returned an unsupported upload provider.", false);
  }
  ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_SIGNATURE`, "DONE", {
    clipId: input.clipId, elapsedMs: Date.now() - signatureStartedAt,
    provider: data.provider,
  });
  ClipLogger.info("upload", "Bunny authorization request completed", {
    kind: input.kind, elapsedMs: Date.now() - signatureStartedAt,
  });
  if (input.kind === "video") {
    ClipLogger.uploadDebug(uploadId, "VIDEO_STORAGE_IMPORT", "START", {
      clipId: input.clipId, vendorId: input.vendorId, bytes: input.size,
    });
    const result = await uploadBunnyStreamFromStorage(data, input, onProgress, registerAbort, shouldCancel);
    ClipLogger.uploadDebug(uploadId, "VIDEO_STORAGE_IMPORT", "DONE", {
      clipId: input.clipId, bytes: result.bytes, publicId: result.public_id,
    });
    return result;
  }
  return uploadBunnyObject(data, input, onProgress, registerAbort);
}

export async function uploadClipThumbnail(
  vendorId: string,
  clipId: string,
  uri: string,
  onProgress?: (value: number) => void,
) {
  ClipLogger.info("upload", "Preparing thumbnail upload", { clipId });
  const result = await uploadOne({
    vendorId, clipId, kind: "thumbnail", uri,
    name: `thumbnail-${clipId}.jpg`, mimeType: "image/jpeg", size: await assetSize(uri),
  }, onProgress);
  ClipLogger.info("upload", "Thumbnail upload returned", { clipId });
  return { url: result.secure_url, publicId: result.public_id };
}

ClipBunnyService.configure({
  async upload(input: ClipBunnyUploadInput, onProgress, registerAbort, shouldCancel = () => false): Promise<ClipBunnyAsset> {
    ClipLogger.info("upload", "Starting Bunny uploads", { clipId: input.clipId });
    const aborters: Array<() => void> = [];
    let cancelled = false;
    registerAbort?.(() => {
      cancelled = true;
      aborters.forEach((abort) => abort());
    });
    const uploadsStartedAt = Date.now();
    let videoProgress = 0;
    let thumbnailProgress = 0;
    let lastCombinedProgress = 0;
    const reportCombinedProgress = () => {
      const combined = Math.max(
        lastCombinedProgress,
        Math.min(0.89, (videoProgress * 0.85 + thumbnailProgress * 0.15) * 0.89),
      );
      lastCombinedProgress = combined;
      onProgress?.(combined);
    };
    let thumbnail: { url: string; publicId: string } = { url: "", publicId: "" };
    let video: BunnyUploadResult;
    try {
      // Stage the small thumbnail first. If connectivity drops here, no Bunny
      // Stream video has been created yet, so a retry cannot leave an orphaned
      // or duplicate Stream asset behind.
      if (input.thumbnailUri) {
        const size = await assetSize(input.thumbnailUri);
        const result = await uploadOne({
          debugUploadId: input.debugUploadId,
          vendorId: input.vendorId, clipId: input.clipId, kind: "thumbnail",
          uri: input.thumbnailUri, name: `thumbnail-${input.clipId}.jpg`,
          mimeType: "image/jpeg", size,
        }, (value) => {
          thumbnailProgress = Math.max(thumbnailProgress, value);
          reportCombinedProgress();
        }, (abort) => aborters.push(abort), () => cancelled || shouldCancel());
        thumbnail = { url: result.secure_url, publicId: result.public_id };
      } else {
        thumbnailProgress = 1;
        reportCombinedProgress();
      }
      video = await withTimeout(
        "Video upload",
        uploadOne({
          debugUploadId: input.debugUploadId,
          vendorId: input.vendorId, clipId: input.clipId, kind: "video",
          uri: input.video.uri, name: input.video.fileName,
          mimeType: input.video.mimeType, size: input.video.fileSizeBytes,
        }, (value) => {
          videoProgress = Math.max(videoProgress, value);
          reportCombinedProgress();
        }, (abort) => aborters.push(abort), () => cancelled || shouldCancel()),
        () => aborters.forEach((abort) => abort()),
        uploadTimeoutForBytes(input.video.fileSizeBytes) + OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      aborters.forEach((abort) => abort());
      throw error;
    }
    ClipLogger.info("upload", "Bunny uploads returned", {
      clipId: input.clipId, elapsedMs: Date.now() - uploadsStartedAt,
    });
    const uploadedDuration = Number(video.duration);
    const uploadedWidth = Number(video.width);
    const uploadedHeight = Number(video.height);
    return {
      videoUrl: video.secure_url,
      thumbnailUrl: thumbnail.url || video.bunny_thumbnail_url || "",
      publicId: video.public_id,
      durationSeconds: Number.isFinite(uploadedDuration) && uploadedDuration > 0
        ? uploadedDuration
        : input.video.durationSeconds,
      resolution: {
        width: Number.isFinite(uploadedWidth) && uploadedWidth > 0 ? uploadedWidth : input.video.resolution.width,
        height: Number.isFinite(uploadedHeight) && uploadedHeight > 0 ? uploadedHeight : input.video.resolution.height,
      },
      fileSizeBytes: Number(video.bytes),
    };
  },
  async delete(clipId) {
    const { error } = await supabase.functions.invoke("clip-media-delete", { body: { clipId } });
    if (error) {
      let message = error.message;
      const context = (error as { context?: Response }).context;
      if (context && typeof context.clone === "function") {
        const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
        if (payload?.error) message = payload.error;
      }
      throw new ClipModuleError("MEDIA_ERROR", message || "Unable to delete this Clip. Please try again.", true, error);
    }
  },
  async replace(input, _previousPublicId, onProgress) {
    return this.upload(input, onProgress);
  },
});
