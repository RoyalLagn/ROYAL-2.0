import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as tus from "tus-js-client";
import { supabase } from "@/services/supabase";
import type { ClipCloudinaryAsset, ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import type { ClipCloudinaryUploadInput } from "./ClipCloudinaryService";
import { ClipCloudinaryService } from "./ClipCloudinaryService";

type SignResponse = {
  provider?: "cloudinary";
  uploadMode: "signed" | "unsigned";
  uploadPreset?: string;
  cloudName: string;
  resourceType: "video" | "image";
  folder: string;
  public_id: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  eager?: string;
  eager_async?: string;
  overwrite?: string;
  unique_filename?: string;
} | {
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

const OPERATION_TIMEOUT_MS = 30_000;
const MIN_UPLOAD_TIMEOUT_MS = 3 * 60_000;
const MAX_UPLOAD_TIMEOUT_MS = 10 * 60_000;
const ASSUMED_SLOW_UPLOAD_BYTES_PER_SECOND = 128 * 1024;

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

async function uploadBunnyTus(
  data: Extract<SignResponse, { provider: "bunny" }>,
  input: { uri: string; size: number; mimeType: string; name: string; clipId: string; vendorId: string },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
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
    onProgress?.(1);
    return { secure_url: data.videoUrl, public_id: `bunny:${data.videoId}:${input.clipId}`, bytes: input.size, bunny_thumbnail_url: data.thumbnailUrl };
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
    onProgress?.(1);
    return { secure_url: data.videoUrl, public_id: `bunny:${data.videoId}:${input.clipId}`, bytes: file.size, bunny_thumbnail_url: data.thumbnailUrl };
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
  onProgress?.(1);
  return {
    secure_url: data.videoUrl,
    public_id: `bunny:${data.videoId}:${input.clipId}`,
    bytes: input.size,
    bunny_thumbnail_url: data.thumbnailUrl,
  };
}

async function uploadBunnyObject(
  data: Extract<SignResponse, { provider: "bunny" }>,
  input: { uri: string; mimeType: string },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
) {
  if (!data.uploadUrl || !data.publicUrl) throw new ClipModuleError("UPLOAD_ERROR", "Incomplete Bunny Storage authorization.");
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
  return { secure_url: data.publicUrl, public_id: data.objectKey };
}

async function uploadOne(
  input: { debugUploadId?: string; vendorId: string; clipId: string; kind: "video" | "thumbnail"; uri: string; name: string; mimeType: string; size: number },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
) {
  const uploadId = input.debugUploadId ?? input.clipId;
  const uploadTimeoutMs = uploadTimeoutForBytes(input.size);
  const signatureStartedAt = Date.now();
  ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_SIGNATURE`, "START", {
    clipId: input.clipId, vendorId: input.vendorId, bytes: input.size,
  });
  ClipLogger.info("cloudinary", "Signature request started", { kind: input.kind, clipId: input.clipId });
  const { data, error } = await withTimeout(
    `Generating ${input.kind} upload signature`,
    supabase.functions.invoke<SignResponse>("clip-upload-sign", {
    body: {
      vendorId: input.vendorId, clipId: input.clipId, kind: input.kind,
      mimeType: input.mimeType, fileSize: input.size, debugUploadId: uploadId,
    },
    }),
  );
  if (error || !data) throw new ClipModuleError("CLOUDINARY_ERROR", error?.message || "Unable to authorize upload.", true, error);
  if (data.provider === "bunny") {
    return input.kind === "video"
      ? uploadBunnyTus(data, input, onProgress, registerAbort)
      : uploadBunnyObject(data, input, onProgress, registerAbort);
  }
  ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_SIGNATURE`, "DONE", {
    clipId: input.clipId, elapsedMs: Date.now() - signatureStartedAt,
    uploadMode: data.uploadMode, resourceType: data.resourceType,
  });
  ClipLogger.info("cloudinary", "Signature request completed", {
    kind: input.kind, uploadMode: data.uploadMode, elapsedMs: Date.now() - signatureStartedAt,
  });
  const body = new FormData();
  if (Platform.OS === "web") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
    let blob: Blob;
    try {
      const response = await fetch(input.uri, { signal: controller.signal });
      if (!response.ok) throw new Error(`Local media read failed (${response.status})`);
      blob = await response.blob();
    } catch (error) {
      throw new ClipModuleError("UPLOAD_ERROR", "Preparing Clip media failed or timed out.", false, error);
    } finally {
      clearTimeout(timer);
    }
    body.append("file", new File([blob], input.name, { type: input.mimeType }));
  } else {
    body.append("file", { uri: input.uri, name: input.name, type: input.mimeType } as unknown as Blob);
  }
  if (data.uploadMode === "signed") {
    if (!data.apiKey || !data.timestamp || !data.signature || !data.eager) throw new ClipModuleError("CLOUDINARY_ERROR", "Incomplete signed upload.");
    body.append("api_key", data.apiKey);
    body.append("timestamp", String(data.timestamp));
    body.append("folder", data.folder);
    body.append("public_id", data.public_id);
    body.append("overwrite", data.overwrite || "true");
    body.append("unique_filename", data.unique_filename || "false");
    body.append("eager", data.eager);
    if (data.eager_async) body.append("eager_async", data.eager_async);
    body.append("signature", data.signature);
  } else {
    if (!data.uploadPreset) throw new ClipModuleError("CLOUDINARY_ERROR", "Upload preset is missing.");
    // Cloudinary rejects signed-only parameters on unsigned uploads. Delete them
    // explicitly so the wire payload remains valid even if this builder changes
    // or FormData construction is refactored later.
    body.delete("api_key");
    body.delete("timestamp");
    body.delete("signature");
    body.delete("overwrite");
    body.delete("unique_filename");
    body.delete("eager");
    body.delete("eager_async");
    body.append("upload_preset", data.uploadPreset);
    body.append("folder", data.folder);
    body.append("public_id", data.public_id);
  }
  const outgoingPayload: Record<string, unknown> = {};
  body.forEach((value, key) => {
    outgoingPayload[key] = typeof value === "string"
      ? value
      : {
        type: value.type,
        size: value.size,
        name: "name" in value ? value.name : input.name,
      };
  });
  const overwritePresent = body.has("overwrite");
  ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_OUTGOING_PAYLOAD`, "DONE", {
    clipId: input.clipId,
    uploadMode: data.uploadMode,
    keys: Object.keys(outgoingPayload),
    overwritePresent,
    payload: outgoingPayload,
  });
  if (data.uploadMode === "unsigned" && overwritePresent) {
    throw new ClipModuleError(
      "CLOUDINARY_ERROR",
      "Unsigned Cloudinary payload unexpectedly contains overwrite.",
      false,
    );
  }
  return new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const uploadStartedAt = Date.now();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const clearWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = undefined;
    };
    const fail = (error: ClipModuleError) => {
      if (settled) return;
      settled = true;
      clearWatchdog();
      ClipLogger.error("cloudinary", `${input.kind} upload failed`, {
        clipId: input.clipId, error: error.message, elapsedMs: Date.now() - uploadStartedAt,
      });
      ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_XHR`, "ERROR", {
        clipId: input.clipId, elapsedMs: Date.now() - uploadStartedAt,
        message: error.message, stack: error.stack,
      });
      reject(error);
    };
    request.open("POST", `https://api.cloudinary.com/v1_1/${data.cloudName}/${data.resourceType}/upload`);
    request.timeout = uploadTimeoutMs;
    ClipLogger.info("cloudinary", `${input.kind} upload started`, { clipId: input.clipId, bytes: input.size });
    ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_XHR`, "START", {
      clipId: input.clipId, url: `https://api.cloudinary.com/v1_1/${data.cloudName}/${data.resourceType}/upload`,
      bytes: input.size,
    });
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const fraction = event.loaded / event.total;
      ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_XHR`, "PROGRESS", {
        clipId: input.clipId, loaded: event.loaded, total: event.total, fraction,
      });
      onProgress?.(fraction);
    };
    request.onerror = () => fail(new ClipModuleError("UPLOAD_ERROR", `Network error while uploading ${input.kind}.`, true));
    request.ontimeout = () => {
      fail(new ClipModuleError("UPLOAD_ERROR", `${input.kind} upload timed out. Check your connection and try again.`, false));
      request.abort();
    };
    request.onabort = () => fail(new ClipModuleError("UPLOAD_ERROR", `${input.kind} upload was cancelled.`, false));
    request.onload = () => {
      if (settled) return;
      try {
        ClipLogger.info("cloudinary", `${input.kind} HTTP response received`, {
          clipId: input.clipId,
          httpStatus: request.status,
          responseBody: request.responseText,
          elapsedMs: Date.now() - uploadStartedAt,
        });
        const payload = JSON.parse(request.responseText);
        ClipLogger.info("cloudinary", `${input.kind} response parsed`, {
          clipId: input.clipId,
          secureUrl: payload.secure_url ?? null,
          publicId: payload.public_id ?? null,
          assetId: payload.asset_id ?? null,
          version: payload.version ?? null,
          resourceType: payload.resource_type ?? null,
          eager: payload.eager ?? null,
          processing: payload.processing ?? null,
          error: payload.error ?? null,
        });
        if (request.status < 200 || request.status >= 300) throw new Error(payload.error?.message || "Upload failed");
        settled = true;
        clearWatchdog();
        onProgress?.(1);
        ClipLogger.info("cloudinary", `${input.kind} upload completed`, {
          clipId: input.clipId, publicId: payload.public_id, elapsedMs: Date.now() - uploadStartedAt,
        });
        ClipLogger.uploadDebug(uploadId, `${input.kind.toUpperCase()}_XHR`, "DONE", {
          clipId: input.clipId, httpStatus: request.status,
          elapsedMs: Date.now() - uploadStartedAt,
          response: {
            secure_url: payload.secure_url ?? null,
            public_id: payload.public_id ?? null,
            asset_id: payload.asset_id ?? null,
            version: payload.version ?? null,
            resource_type: payload.resource_type ?? null,
            eager: payload.eager ?? null,
            processing: payload.processing ?? null,
          },
        });
        resolve(payload);
      } catch (caught) {
        fail(new ClipModuleError("CLOUDINARY_ERROR", caught instanceof Error ? caught.message : "Upload failed.", true, caught));
      }
    };
    const abort = () => {
      if (!settled) request.abort();
    };
    registerAbort?.(abort);
    watchdog = setTimeout(() => {
      if (settled) return;
      fail(new ClipModuleError(
        "UPLOAD_ERROR",
        `${input.kind} upload timed out while waiting for Cloudinary to return a response.`,
        false,
      ));
      request.abort();
    }, uploadTimeoutMs);
    request.send(body);
  });
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
  return { url: result.eager?.[0]?.secure_url || result.secure_url, publicId: result.public_id };
}

ClipCloudinaryService.configure({
  async upload(input: ClipCloudinaryUploadInput, onProgress): Promise<ClipCloudinaryAsset> {
    ClipLogger.info("upload", "Starting Cloudinary uploads", { clipId: input.clipId });
    const aborters: Array<() => void> = [];
    const uploadsStartedAt = Date.now();
    let videoProgress = 0;
    let thumbnailProgress = 0;
    let lastCombinedProgress = 0;
    const reportCombinedProgress = () => {
      const combined = Math.max(
        lastCombinedProgress,
        Math.min(1, videoProgress * 0.85 + thumbnailProgress * 0.15),
      );
      lastCombinedProgress = combined;
      onProgress?.(combined);
    };
    const uploads = Promise.all([
      uploadOne({
        debugUploadId: input.debugUploadId,
        vendorId: input.vendorId, clipId: input.clipId, kind: "video",
        uri: input.video.uri, name: input.video.fileName,
        mimeType: input.video.mimeType, size: input.video.fileSizeBytes,
      }, (value) => {
        videoProgress = Math.max(videoProgress, value);
        reportCombinedProgress();
      }, (abort) => aborters.push(abort)),
      (async () => {
        const size = await assetSize(input.thumbnailUri);
        const result = await uploadOne({
          debugUploadId: input.debugUploadId,
          vendorId: input.vendorId, clipId: input.clipId, kind: "thumbnail",
          uri: input.thumbnailUri, name: `thumbnail-${input.clipId}.jpg`,
          mimeType: "image/jpeg", size,
        }, (value) => {
          thumbnailProgress = Math.max(thumbnailProgress, value);
          reportCombinedProgress();
        }, (abort) => aborters.push(abort));
        return { url: result.eager?.[0]?.secure_url || result.secure_url, publicId: result.public_id };
      })(),
    ]);
    const [video, thumbnail] = await withTimeout(
      "Video and thumbnail uploads",
      uploads,
      () => aborters.forEach((abort) => abort()),
      uploadTimeoutForBytes(input.video.fileSizeBytes) + OPERATION_TIMEOUT_MS,
    );
    ClipLogger.info("upload", "Cloudinary uploads returned", {
      clipId: input.clipId, elapsedMs: Date.now() - uploadsStartedAt,
    });
    const eagerVideo = video.eager?.find((item: any) => String(item.secure_url || "").endsWith(".mp4"));
    const uploadedDuration = Number(video.duration);
    const uploadedWidth = Number(video.width);
    const uploadedHeight = Number(video.height);
    return {
      videoUrl: eagerVideo?.secure_url || video.secure_url,
      thumbnailUrl: String(video.public_id || "").startsWith("bunny:")
        ? (thumbnail.url || video.bunny_thumbnail_url)
        : thumbnail.url,
      publicId: video.public_id,
      durationSeconds: Number.isFinite(uploadedDuration) && uploadedDuration > 0
        ? uploadedDuration
        : input.video.durationSeconds,
      resolution: {
        width: Number.isFinite(uploadedWidth) && uploadedWidth > 0 ? uploadedWidth : input.video.resolution.width,
        height: Number.isFinite(uploadedHeight) && uploadedHeight > 0 ? uploadedHeight : input.video.resolution.height,
      },
      fileSizeBytes: Number(eagerVideo?.bytes ?? video.bytes),
    };
  },
  async delete(clipId) {
    const { error } = await supabase.functions.invoke("clip-cloudinary-delete", { body: { clipId } });
    if (error) {
      let message = error.message;
      const context = (error as { context?: Response }).context;
      if (context && typeof context.clone === "function") {
        const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
        if (payload?.error) message = payload.error;
      }
      throw new ClipModuleError("CLOUDINARY_ERROR", message || "Unable to delete this Clip. Please try again.", true, error);
    }
  },
  async replace(input, _previousPublicId, onProgress) {
    return this.upload(input, onProgress);
  },
});
