import { supabase } from "@/services/supabase";
import { clipsConfig } from "../config";
import type { ClipQueueItem, UploadProgress } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import { ClipCacheService } from "./ClipCacheService";
import { ClipCloudinaryService } from "./ClipCloudinaryService";
import { ClipThumbnailService } from "./ClipThumbnailService";
import { ClipUploadService } from "./ClipUploadService";

export type UploadProgressHandler = (progress: UploadProgress) => void;

const OPERATION_TIMEOUT_MS = 30_000;

async function withTimeout<T>(
  label: string,
  operation: PromiseLike<T>,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const startedAt = Date.now();
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ClipLogger.error("database", `${label} timed out`, { elapsedMs: Date.now() - startedAt });
          reject(new ClipModuleError(
            "UPLOAD_ERROR",
            `${label} timed out after 30 seconds. Please try again.`,
            false,
          ));
          onTimeout?.();
        }, OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const ClipUploadOrchestrator = {
  async execute(
    item: ClipQueueItem,
    onProgress: UploadProgressHandler,
    shouldCancel: () => boolean = () => false,
  ) {
    const { draft } = item;
    const uploadId = item.id;
    const pipelineStartedAt = Date.now();
    ClipLogger.uploadDebug(uploadId, "PIPELINE", "START", {
      queueId: item.id,
      vendorId: draft.vendorId,
      categoryId: draft.categoryId,
      attempt: item.retryCount + 1,
    });
    ClipLogger.info("upload", "Preparing upload", { queueId: item.id, vendorId: draft.vendorId });
    const ensureActive = () => {
      if (shouldCancel()) throw new ClipModuleError("UPLOAD_ERROR", "Upload cancelled.");
    };
    try {
      ensureActive();
      let stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "LIMITS", "START");
      ClipLogger.info("upload", "Validating upload limits", { queueId: item.id });
      const limitsStartedAt = Date.now();
      const limits = await withTimeout("Resolving Clip limits", ClipUploadService.resolveLimits(draft.vendorId));
      ClipLogger.info("upload", "Upload limits resolved", {
        queueId: item.id, elapsedMs: Date.now() - limitsStartedAt, limits,
      });
      ClipLogger.uploadDebug(uploadId, "LIMITS", "DONE", {
        elapsedMs: Date.now() - stageStartedAt,
        maximumClips: limits.maximumClips,
      });
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "CLIP_COUNT", "START", {
        table: "clips", operation: "select/count",
      });
      const countStartedAt = Date.now();
      const countController = new AbortController();
      ClipLogger.info("database", "Supabase operation started", {
        table: "clips", operation: "select/count", queueId: item.id,
      });
      const countRequest = supabase.from("clips").select("id", { count: "exact", head: true })
        .eq("vendor_id", draft.vendorId).is("deleted_at", null)
        .abortSignal(countController.signal);
      const { count, error: countError } = await withTimeout<Awaited<typeof countRequest>>(
        "Checking current Clip count",
        countRequest,
        () => countController.abort(),
      );
      ClipLogger.info("database", "Supabase operation completed", {
        table: "clips", operation: "select/count", queueId: item.id,
        data: { count }, error: countError?.message ?? null,
        elapsedMs: Date.now() - countStartedAt,
      });
      ClipLogger.uploadDebug(uploadId, "CLIP_COUNT", "DONE", {
        table: "clips", operation: "select/count", count,
        error: countError ?? null, elapsedMs: Date.now() - stageStartedAt,
      });
      if (countError) throw new ClipModuleError("DATABASE_ERROR", countError.message, true, countError);
      if ((count ?? 0) >= limits.maximumClips) {
        throw new ClipModuleError("LIMIT_EXCEEDED", `You've reached your limit of ${limits.maximumClips} clips.`);
      }

      onProgress({ stage: "validating", progress: 0.03, bytesUploaded: 0, totalBytes: draft.source.fileSizeBytes, attempt: item.retryCount + 1 });
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "VIDEO_PREPARE", "START", {
        bytes: draft.source.fileSizeBytes, mimeType: draft.source.mimeType,
      });
      ClipLogger.info("compression", "Preparing video", { queueId: item.id });
      const prepared = await withTimeout("Preparing video", ClipUploadService.prepare(draft, (value) => {
        onProgress({ stage: "compressing", progress: value * 0.3, bytesUploaded: 0, totalBytes: draft.source.fileSizeBytes, attempt: item.retryCount + 1 });
      }));
      ClipLogger.info("compression", "Video prepared", { queueId: item.id, bytes: prepared.fileSizeBytes });
      ClipLogger.uploadDebug(uploadId, "VIDEO_PREPARE", "DONE", {
        elapsedMs: Date.now() - stageStartedAt, bytes: prepared.fileSizeBytes,
      });
      ensureActive();
      if (prepared.fileSizeBytes > clipsConfig.media.maximumFinalFileSizeBytes) {
        throw new ClipModuleError("COMPRESSION_ERROR", "The video could not be reduced below 52 MB.");
      }

      onProgress({ stage: "thumbnail", progress: 0.35, bytesUploaded: 0, totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1 });
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "THUMBNAIL", "START", {
        custom: Boolean(draft.customThumbnailUri),
      });
      ClipLogger.info("upload", "Generating thumbnail", { queueId: item.id, custom: Boolean(draft.customThumbnailUri) });
      const thumbnail = draft.customThumbnailUri
        ? { uri: draft.customThumbnailUri, capturedAtSeconds: 0 }
        : await withTimeout(
          "Generating thumbnail",
          ClipThumbnailService.generate(prepared, clipsConfig.thumbnail.captureAtSeconds),
        );
      ClipLogger.info("upload", "Thumbnail ready", { queueId: item.id });
      ClipLogger.uploadDebug(uploadId, "THUMBNAIL", "DONE", {
        elapsedMs: Date.now() - stageStartedAt,
      });
      ensureActive();
      const clipId = globalThis.crypto.randomUUID();
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "CLOUDINARY", "START", { clipId });
      ClipLogger.info("upload", "Uploading video and thumbnail", { queueId: item.id, clipId });
      const uploaded = await ClipCloudinaryService.upload({
        debugUploadId: uploadId,
        clipId, vendorId: draft.vendorId, video: prepared, thumbnailUri: thumbnail.uri,
      }, (value) => {
        ClipLogger.uploadDebug(uploadId, "CLOUDINARY", "PROGRESS", {
          clipId, fraction: value, uiProgress: 0.4 + value * 0.5,
        });
        onProgress({
          stage: "uploading", progress: 0.4 + value * 0.5,
          bytesUploaded: Math.round(prepared.fileSizeBytes * value),
          totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1,
        });
      });
      ClipLogger.info("upload", "Cloudinary upload complete", { queueId: item.id, clipId });
      ClipLogger.uploadDebug(uploadId, "CLOUDINARY", "DONE", {
        clipId, elapsedMs: Date.now() - stageStartedAt, uploaded,
      });
      if (shouldCancel()) {
        await withTimeout("Cleaning up cancelled upload", supabase.functions.invoke("clip-cloudinary-delete", {
          body: { vendorId: draft.vendorId, publicId: uploaded.publicId },
        })).catch(() => undefined);
        throw new ClipModuleError("UPLOAD_ERROR", "Upload cancelled.");
      }
      if (uploaded.fileSizeBytes > clipsConfig.media.maximumFinalFileSizeBytes) {
        await withTimeout("Cleaning up oversized upload", supabase.functions.invoke("clip-cloudinary-delete", {
          body: { vendorId: draft.vendorId, publicId: uploaded.publicId },
        })).catch(() => undefined);
        throw new ClipModuleError("UPLOAD_ERROR", "The final Cloudinary asset exceeds 52 MB.");
      }
      onProgress({ stage: "saving", progress: 0.95, bytesUploaded: prepared.fileSizeBytes, totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1 });
      const insertStartedAt = Date.now();
      const insertController = new AbortController();
      ClipLogger.info("database", "Supabase operation started", {
        table: "clips", operation: "insert", queueId: item.id, clipId,
      });
      const insertPayload = {
      id: clipId,
      vendor_id: draft.vendorId,
      category_id: draft.categoryId,
      title: draft.title.trim(),
      caption: draft.caption?.trim() || null,
      video_url: uploaded.videoUrl,
      thumbnail_url: uploaded.thumbnailUrl,
      duration_seconds: uploaded.durationSeconds,
      width: uploaded.resolution.width,
      height: uploaded.resolution.height,
      file_size_bytes: uploaded.fileSizeBytes,
      cloudinary_public_id: uploaded.publicId,
      status: "approved",
      visibility: "public",
      published_at: new Date().toISOString(),
      };
      ClipLogger.uploadDebug(uploadId, "DATABASE_INSERT", "START", {
        table: "clips", operation: "insert", clipId, payload: insertPayload,
      });
      const insertRequest = supabase.from("clips").insert(insertPayload)
        .select("*").abortSignal(insertController.signal).single();
      const { data, error } = await withTimeout<Awaited<typeof insertRequest>>(
        "Saving Clip database record",
        insertRequest,
        () => insertController.abort(),
      );
      ClipLogger.info("database", "Supabase operation completed", {
        table: "clips", operation: "insert", queueId: item.id, clipId,
        data, error: error?.message ?? null, elapsedMs: Date.now() - insertStartedAt,
      });
      ClipLogger.uploadDebug(uploadId, "DATABASE_INSERT", error ? "ERROR" : "DONE", {
        table: "clips", operation: "insert", clipId, data,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        } : null,
        elapsedMs: Date.now() - insertStartedAt,
      });
      if (error) {
        await withTimeout("Cleaning up failed upload", supabase.functions.invoke("clip-cloudinary-delete", {
          body: { vendorId: draft.vendorId, publicId: uploaded.publicId },
        })).catch(() => undefined);
        throw new ClipModuleError("DATABASE_ERROR", error.message, true, error);
      }
      ClipLogger.info("database", "Database insert finished", {
        queueId: item.id, clipId, elapsedMs: Date.now() - insertStartedAt,
      });
      const cacheStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "CACHE_INVALIDATION", "START", { clipId });
      ClipLogger.info("database", "Cache invalidation started", { queueId: item.id, clipId });
      ClipCacheService.invalidate("vendor", draft.vendorId);
      ClipLogger.info("database", "Cache invalidation completed", {
        queueId: item.id, clipId, elapsedMs: Date.now() - cacheStartedAt,
      });
      ClipLogger.uploadDebug(uploadId, "CACHE_INVALIDATION", "DONE", {
        clipId, elapsedMs: Date.now() - cacheStartedAt,
      });
      onProgress({ stage: "complete", progress: 1, bytesUploaded: prepared.fileSizeBytes, totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1 });
      ClipLogger.uploadDebug(uploadId, "UI_PROGRESS_100", "DONE", { clipId, progress: 1 });
      ClipLogger.info("upload", "Complete", { queueId: item.id, clipId });
      ClipLogger.uploadDebug(uploadId, "PIPELINE", "DONE", {
        clipId, elapsedMs: Date.now() - pipelineStartedAt,
      });
      return data;
    } catch (error) {
      ClipLogger.uploadDebug(uploadId, "PIPELINE", "ERROR", {
        elapsedMs: Date.now() - pipelineStartedAt,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      });
      ClipLogger.error("upload", "Upload pipeline failed", {
        queueId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      ClipLogger.uploadDebug(uploadId, "PIPELINE", "FINALLY", {
        elapsedMs: Date.now() - pipelineStartedAt,
      });
    }
  },
};
