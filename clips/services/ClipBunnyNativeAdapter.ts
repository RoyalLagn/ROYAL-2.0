import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as tus from "tus-js-client";
import { supabase } from "@/services/supabase";
import { waitForBunnyStreamReady } from "@/services/bunnyStream";
import type { ClipBunnyAsset, ClipBunnyUploadState } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import type { ClipBunnyUploadInput } from "./ClipBunnyService";
import { ClipBunnyService } from "./ClipBunnyService";

type SignResponse = {
  provider: "bunny";
  uploadMode?: "tus";
  endpoint?: string;
  proxyUploadUrl?: string;
  authorizationSignature?: string;
  authorizationExpire?: number;
  videoId?: string;
  libraryId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  uploadUrl?: string;
  publicUrl?: string;
  objectKey?: string;
  importUrl?: string;
  streamCdnHostname?: string;
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
const CLIP_PROCESSING_TIMEOUT_MS = 2 * 60_000;
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

function bunnyTusHeaders(data: Extract<SignResponse, { provider: "bunny" }>) {
  if (!data.authorizationSignature || !data.authorizationExpire || !data.videoId || !data.libraryId) {
    throw new ClipModuleError("UPLOAD_ERROR", "Incomplete Bunny Stream authorization.");
  }
  return {
    AuthorizationSignature: data.authorizationSignature,
    AuthorizationExpire: String(data.authorizationExpire),
    VideoId: data.videoId,
    LibraryId: data.libraryId,
    "Tus-Resumable": "1.0.0",
  };
}

async function verifyBunnyStreamUpload(
  data: Extract<SignResponse, { provider: "bunny" }>,
  input: { vendorId: string; clipId: string },
  onProgress?: (value: number) => void,
  shouldCancel: () => boolean = () => false,
) {
  try {
    return await waitForBunnyStreamReady(
      data.videoId!, input.vendorId, "clip", CLIP_PROCESSING_TIMEOUT_MS,
      (encodeProgress) => onProgress?.(0.9 + (encodeProgress / 100) * 0.09),
      shouldCancel,
    );
  } catch (error) {
    // A timeout or transient status-check failure does not mean Bunny lost
    // the uploaded bytes. Keep the remote object so a retry can recover it;
    // deleting here was turning slow encoding into a real data loss.
    throw new ClipModuleError(
      "UPLOAD_ERROR",
      error instanceof Error ? error.message : "Bunny Stream processing verification failed.",
      true,
      error,
    );
  }
}

async function uploadBunnyTus(
  data: Extract<SignResponse, { provider: "bunny" }>,
  input: { uri: string; size: number; mimeType: string; name: string; clipId: string; vendorId: string },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
  shouldCancel: () => boolean = () => false,
  onUploaded?: () => Promise<void>,
) {
  if (!data.endpoint || !data.videoId || !data.videoUrl || !data.thumbnailUrl) {
    throw new ClipModuleError("UPLOAD_ERROR", "Incomplete Bunny Stream upload details.");
  }
  if (data.proxyUploadUrl) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new ClipModuleError("UPLOAD_ERROR", "Authentication expired. Please sign in again.");
    if (Platform.OS !== "web") {
      const task = FileSystem.createUploadTask(data.proxyUploadUrl, input.uri, {
        httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": input.mimeType, "Content-Length": String(input.size) },
      }, ({ totalBytesSent, totalBytesExpectedToSend }) => totalBytesExpectedToSend > 0 && onProgress?.(totalBytesSent / totalBytesExpectedToSend));
      registerAbort?.(() => task.cancelAsync().catch(() => undefined));
      const result = await task.uploadAsync();
      if (!result || result.status < 200 || result.status >= 300) throw new ClipModuleError("UPLOAD_ERROR", `Bunny Stream upload failed (${result?.status ?? "network"}).`, true);
    } else {
      const blob = await fetch(input.uri).then((response) => response.blob());
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", data.proxyUploadUrl!);
        request.setRequestHeader("Authorization", `Bearer ${token}`);
        request.setRequestHeader("Content-Type", input.mimeType);
        request.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
        request.onerror = () => reject(new ClipModuleError("UPLOAD_ERROR", "Network error during Bunny Stream upload.", true));
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) {
            try {
              const result = JSON.parse(request.responseText || "{}");
              if (result.uploaded !== true || Number(result.storedBytes || 0) <= 0) {
                reject(new ClipModuleError("UPLOAD_ERROR", "Bunny did not store the uploaded video.", true));
                return;
              }
            } catch {
              reject(new ClipModuleError("UPLOAD_ERROR", "Invalid Bunny upload confirmation.", true));
              return;
            }
            resolve();
            return;
          }
          let detail = "";
          try { detail = JSON.parse(request.responseText || "{}").error || ""; } catch { /* Use status fallback. */ }
          reject(new ClipModuleError("UPLOAD_ERROR", detail || `Bunny Stream upload failed (${request.status}).`, true));
        };
        registerAbort?.(() => request.abort()); request.send(blob);
      });
    }
    await onUploaded?.();
    onProgress?.(0.9);
    const status = await verifyBunnyStreamUpload(data, input, onProgress, shouldCancel);
    onProgress?.(1);
    return { secure_url: data.videoUrl, public_id: `bunny:${data.videoId}:${input.clipId}`, bytes: input.size, bunny_thumbnail_url: data.thumbnailUrl, duration: status.length, width: status.width, height: status.height };
  }
  const headers = bunnyTusHeaders(data);
  if (Platform.OS === "web") {
    const blob = await fetch(input.uri).then((response) => response.blob());
    if (blob.size <= 0) {
      throw new ClipModuleError("UPLOAD_ERROR", "The selected video file is empty.", false);
    }
    const file = new File([blob], input.name || `clip-${input.clipId}.mp4`, {
      type: input.mimeType || blob.type || "video/mp4",
    });
    await new Promise<void>((resolve, reject) => {
      // Bunny's browser integration is deliberately kept identical to their
      // documented tus-js-client flow. In particular, pass a File and let TUS
      // derive Upload-Length from it; forcing the separately reported media
      // size can leave Bunny with a completed zero-byte video object.
      const upload = new tus.Upload(file, {
        endpoint: data.endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          AuthorizationSignature: data.authorizationSignature!,
          AuthorizationExpire: String(data.authorizationExpire!),
          VideoId: data.videoId!,
          LibraryId: data.libraryId!,
        },
        metadata: { filetype: file.type, title: file.name },
        removeFingerprintOnSuccess: true,
        onProgress: (uploaded, total) => total > 0 && onProgress?.(uploaded / total),
        onError: (error) => reject(new ClipModuleError("UPLOAD_ERROR", error.message || "Bunny Stream upload failed.", true, error)),
        onSuccess: () => resolve(),
      });
      registerAbort?.(() => upload.abort(true).catch(() => undefined));
      upload.start();
    });
    await onUploaded?.();
    onProgress?.(0.9);
    const status = await verifyBunnyStreamUpload(data, input, onProgress, shouldCancel);
    onProgress?.(1);
    return { secure_url: data.videoUrl, public_id: `bunny:${data.videoId}:${input.clipId}`, bytes: file.size, bunny_thumbnail_url: data.thumbnailUrl, duration: status.length, width: status.width, height: status.height };
  }
  const create = await fetch(data.endpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Upload-Length": String(input.size),
      "Upload-Metadata": `filename ${btoa("clip.mp4")},filetype ${btoa(input.mimeType)},title ${btoa(`clip-${input.clipId}`)}`,
    },
  });
  const location = create.headers.get("Location");
  if (!create.ok || !location) throw new ClipModuleError("UPLOAD_ERROR", `Bunny Stream upload could not start (${create.status}).`, true);
  const uploadUrl = new URL(location, data.endpoint).toString();
  const task = FileSystem.createUploadTask(
      uploadUrl,
      input.uri,
      {
        httpMethod: "PATCH",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { ...headers, "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" },
      },
      ({ totalBytesSent, totalBytesExpectedToSend }) => {
        if (totalBytesExpectedToSend > 0) onProgress?.(totalBytesSent / totalBytesExpectedToSend);
      },
    );
  registerAbort?.(() => task.cancelAsync().catch(() => undefined));
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new ClipModuleError("UPLOAD_ERROR", `Bunny Stream upload failed (${result?.status ?? "network"}).`, true);
  }
  await onUploaded?.();
  onProgress?.(0.9);
  const status = await verifyBunnyStreamUpload(data, input, onProgress, shouldCancel);
  onProgress?.(1);
  return {
    secure_url: data.videoUrl,
    public_id: `bunny:${data.videoId}:${input.clipId}`,
    bytes: input.size,
    bunny_thumbnail_url: data.thumbnailUrl,
    duration: status.length,
    width: status.width,
    height: status.height,
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
  onState?: (state: ClipBunnyUploadState) => Promise<void>,
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
    provider: data.provider, uploadMode: data.uploadMode,
  });
  ClipLogger.info("upload", "Bunny authorization request completed", {
    kind: input.kind, elapsedMs: Date.now() - signatureStartedAt,
  });
  const uploadState = input.kind === "video" && data.videoId && data.videoUrl && data.thumbnailUrl
    ? { videoId: data.videoId, videoUrl: data.videoUrl, thumbnailUrl: data.thumbnailUrl, uploaded: false }
    : null;
  if (uploadState) await onState?.(uploadState);
  return input.kind === "video"
    ? uploadBunnyTus(data, input, onProgress, registerAbort, shouldCancel, async () => {
      if (uploadState) await onState?.({ ...uploadState, uploaded: true });
    })
    : uploadBunnyObject(data, input, onProgress, registerAbort);
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
    if (input.resume?.uploaded) {
      onProgress?.(0.9);
      const status = await waitForBunnyStreamReady(
        input.resume.videoId,
        input.vendorId,
        "clip",
        CLIP_PROCESSING_TIMEOUT_MS,
        (encodeProgress) => onProgress?.(0.9 + (encodeProgress / 100) * 0.09),
        () => cancelled || shouldCancel(),
      );
      onProgress?.(1);
      return {
        videoUrl: input.resume.videoUrl,
        thumbnailUrl: input.resume.thumbnailUrl,
        publicId: `bunny:${input.resume.videoId}:${input.clipId}`,
        durationSeconds: Number(status.length) || input.video.durationSeconds,
        resolution: {
          width: Number(status.width) || input.video.resolution.width,
          height: Number(status.height) || input.video.resolution.height,
        },
        fileSizeBytes: input.video.fileSizeBytes,
      };
    }
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
    const videoUpload = uploadOne({
      debugUploadId: input.debugUploadId,
      vendorId: input.vendorId, clipId: input.clipId, kind: "video",
      uri: input.video.uri, name: input.video.fileName,
      mimeType: input.video.mimeType, size: input.video.fileSizeBytes,
    }, (value) => {
      videoProgress = Math.max(videoProgress, value);
      reportCombinedProgress();
    }, (abort) => aborters.push(abort), () => cancelled || shouldCancel(), input.onUploadState);
    const thumbnailUpload = input.thumbnailUri
      ? (async () => {
        const size = await assetSize(input.thumbnailUri!);
        const result = await uploadOne({
          debugUploadId: input.debugUploadId,
          vendorId: input.vendorId, clipId: input.clipId, kind: "thumbnail",
          uri: input.thumbnailUri!, name: `thumbnail-${input.clipId}.jpg`,
          mimeType: "image/jpeg", size,
        }, (value) => {
          thumbnailProgress = Math.max(thumbnailProgress, value);
          reportCombinedProgress();
        }, (abort) => aborters.push(abort), () => cancelled);
        return { url: result.secure_url, publicId: result.public_id };
      })()
      : Promise.resolve({ url: "", publicId: "" });
    if (!input.thumbnailUri) thumbnailProgress = 1;
    const uploads = Promise.all([
      videoUpload,
      thumbnailUpload,
    ]);
    let video: BunnyUploadResult;
    let thumbnail: { url: string; publicId: string };
    try {
      [video, thumbnail] = await withTimeout(
        "Video and thumbnail uploads",
        uploads,
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
