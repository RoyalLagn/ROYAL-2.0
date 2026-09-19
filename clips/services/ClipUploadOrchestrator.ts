import { supabase } from "@/services/supabase";
import * as FileSystem from "expo-file-system/legacy";
import { clipsConfig } from "../config";
import type { ClipQueueItem, UploadProgress } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import { ClipCacheService } from "./ClipCacheService";
import { ClipBunnyService } from "./ClipBunnyService";
import { ClipUploadService } from "./ClipUploadService";
import { ClipQueueService } from "./ClipQueueService";

export type UploadProgressHandler = (progress: UploadProgress) => void;

const OPERATION_TIMEOUT_MS = 30_000;
const MEDIA_PREPARATION_TIMEOUT_MS = 8 * 60_000;
const activeUploadAborters = new Map<string, () => void>();
const cancelledUploadIds = new Set<string>();

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
          ClipLogger.error("database", `${label} timed out`, { elapsedMs: Date.now() - startedAt });
          reject(new ClipModuleError(
            "UPLOAD_ERROR",
            `${label} timed out. Please try again.`,
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

function createClipId() {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return nativeUuid;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const ClipUploadOrchestrator = {
  cancel(queueId: string) {
    // Cancellation must survive queue-row removal/replacement. Previously the
    // worker only inspected the row status, so immediately starting the same
    // clip again could change/remove that row before the old async pipeline
    // noticed the cancellation and the old upload would continue in parallel.
    cancelledUploadIds.add(queueId);
    activeUploadAborters.get(queueId)?.();
  },
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
    const isCancelled = () => cancelledUploadIds.has(uploadId) || shouldCancel();
    const ensureActive = () => {
      if (isCancelled()) throw new ClipModuleError("UPLOAD_ERROR", "Upload cancelled.");
    };
    // Tracked so the catch block below can release the reservation (a
    // no-op once finalize_clip_upload() has already completed it) if any
    // later stage -- compression, thumbnail generation, the Bunny
    // upload itself -- throws. Without this a failed upload after a
    // successful reservation would otherwise hold the slot until its
    // 15 minute expiry even though no Clip was created.
    let reservationId: string | undefined;
    let temporaryPreparedUri: string | undefined;
    const releaseReservation = async (id: string | undefined) => {
      if (!id) return;
      await Promise.resolve(supabase.rpc("cancel_clip_upload_reservation", { target_reservation_id: id })).catch(() => undefined);
    };
    try {
      ensureActive();
      let stageStartedAt = Date.now();
      // If the app was killed after finalize committed but before the queue
      // persisted completion, treat the existing completed reservation as
      // success instead of uploading the media a second time.
      const { data: completedReservation, error: recoveryError } = await withTimeout(
        "Checking previous Clip upload",
        supabase
          .from("clip_upload_reservations")
          .select("clip_id,status")
          .eq("vendor_id", draft.vendorId)
          .eq("idempotency_key", uploadId)
          .maybeSingle(),
      );
      if (recoveryError) {
        throw new ClipModuleError("DATABASE_ERROR", recoveryError.message, true, recoveryError);
      }
      if (completedReservation?.status === "completed" && completedReservation.clip_id) {
        onProgress({ stage: "complete", progress: 1, bytesUploaded: draft.source.fileSizeBytes, totalBytes: draft.source.fileSizeBytes, attempt: item.retryCount + 1 });
        ClipCacheService.invalidate("vendor", draft.vendorId);
        return completedReservation.clip_id;
      }
      // Resolve the category from the current vendor row immediately before
      // reserving/uploading. Draft storage and UI state are never trusted as
      // the category authority, so old drafts and stale screens cannot publish
      // a Clip under a different marketplace category.
      ClipLogger.uploadDebug(uploadId, "CATEGORY", "START");
      const { data: vendorCategory, error: vendorCategoryError } = await withTimeout(
        "Resolving vendor category",
        supabase
          .from("vendors")
          .select("category_id")
          .eq("id", draft.vendorId)
          .maybeSingle(),
      );
      if (vendorCategoryError) {
        throw new ClipModuleError("DATABASE_ERROR", vendorCategoryError.message, true, vendorCategoryError);
      }
      const authoritativeCategoryId = vendorCategory?.category_id as string | null | undefined;
      if (!authoritativeCategoryId) {
        throw new ClipModuleError(
          "VALIDATION_ERROR",
          "Complete your Business information before uploading a Clip.",
        );
      }
      ClipLogger.uploadDebug(uploadId, "CATEGORY", "DONE", { categoryId: authoritativeCategoryId });

      // The per-plan Clip limit is enforced atomically in the database via
      // reserve_clip_upload_slot() (see
      // supabase/migrations/20260805120000_atomic_clip_upload_reservations.sql).
      // A separate client-side "select count(*) ... then insert" is no
      // longer used here because it cannot be made race-free: two
      // concurrent uploads (two tabs, an automatic retry racing the
      // original) could both read a count under the limit before either
      // committed. The RPC below serializes that check per vendor with a
      // Postgres advisory lock and is the sole source of truth; the
      // client-configured limit resolver is kept only for the queue's
      // fast, optimistic pre-flight UI check.
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

      onProgress({ stage: "validating", progress: 0.03, bytesUploaded: 0, totalBytes: draft.source.fileSizeBytes, attempt: item.retryCount + 1 });
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "VIDEO_PREPARE", "START", {
        bytes: draft.source.fileSizeBytes, mimeType: draft.source.mimeType,
      });
      ClipLogger.info("compression", "Preparing video", { queueId: item.id });
      const prepared = await withTimeout("Preparing video", ClipUploadService.prepare(draft, (value) => {
        onProgress({ stage: "compressing", progress: value * 0.3, bytesUploaded: 0, totalBytes: draft.source.fileSizeBytes, attempt: item.retryCount + 1 });
      }), undefined, MEDIA_PREPARATION_TIMEOUT_MS);
      if (prepared.uri !== draft.source.uri) temporaryPreparedUri = prepared.uri;
      ClipLogger.info("compression", "Video prepared", { queueId: item.id, bytes: prepared.fileSizeBytes });
      ClipLogger.uploadDebug(uploadId, "VIDEO_PREPARE", "DONE", {
        elapsedMs: Date.now() - stageStartedAt, bytes: prepared.fileSizeBytes,
      });
      ensureActive();
      if (prepared.fileSizeBytes > clipsConfig.media.maximumFinalFileSizeBytes) {
        throw new ClipModuleError("COMPRESSION_ERROR", "This video could not be compressed to 20 MB. Please choose a shorter video or a lower-resolution clip.");
      }

      onProgress({ stage: "thumbnail", progress: 0.35, bytesUploaded: 0, totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1 });
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "THUMBNAIL", "START", {
        custom: Boolean(draft.customThumbnailUri),
      });
      ClipLogger.info("upload", "Generating thumbnail", { queueId: item.id, custom: Boolean(draft.customThumbnailUri) });
      // Bunny Stream generates a reliable cover for every video. Only prepare
      // and upload a separate image when the vendor explicitly selected one.
      const thumbnail = draft.customThumbnailUri
        ? { uri: draft.customThumbnailUri, capturedAtSeconds: 0 }
        : null;
      ClipLogger.info("upload", "Thumbnail ready", { queueId: item.id });
      ClipLogger.uploadDebug(uploadId, "THUMBNAIL", "DONE", {
        elapsedMs: Date.now() - stageStartedAt,
      });
      ensureActive();

      // Reserve immediately before network upload. Local compression and
      // thumbnail generation can take several minutes on slower devices; they
      // must not consume the reservation's 15-minute lifetime.
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "RESERVE_SLOT", "START", { queueId: item.id });
      const { data: reservationRows, error: reservationError } = await withTimeout(
        "Reserving Clip upload slot",
        supabase.rpc("reserve_clip_upload_slot", {
          target_vendor_id: draft.vendorId,
          request_idempotency_key: uploadId,
        }),
      );
      if (reservationError) {
        if (reservationError.hint === "LIMIT_REACHED" || reservationError.code === "P0001") {
          throw new ClipModuleError("LIMIT_EXCEEDED", `You've reached your limit of ${limits.maximumClips} clips.`);
        }
        if (reservationError.hint === "SUBSCRIPTION_REQUIRED") {
          throw new ClipModuleError("PERMISSION_ERROR", "An active subscription is required to upload Clips.");
        }
        throw new ClipModuleError("DATABASE_ERROR", reservationError.message, true, reservationError);
      }
      const reservation = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
      if (!reservation?.reservation_id) {
        throw new ClipModuleError("DATABASE_ERROR", "Unable to reserve an upload slot. Please try again.", true);
      }
      reservationId = reservation.reservation_id as string;
      ClipLogger.uploadDebug(uploadId, "RESERVE_SLOT", "DONE", {
        elapsedMs: Date.now() - stageStartedAt,
        reservationId,
      });

      const clipId = item.clipId || createClipId();
      stageStartedAt = Date.now();
      ClipLogger.uploadDebug(uploadId, "BUNNY", "START", { clipId });
      ClipLogger.info("upload", "Uploading video and thumbnail", { queueId: item.id, clipId });
      let serverProcessing = false;
      const uploaded = await ClipBunnyService.upload({
        debugUploadId: uploadId,
        clipId, vendorId: draft.vendorId, video: prepared, thumbnailUri: thumbnail?.uri,
        resume: item.bunnyUpload,
        onUploadState: async (bunnyUpload) => {
          await ClipQueueService.update(item.id, { bunnyUpload });
          item.bunnyUpload = bunnyUpload;
        },
      }, (value) => {
        // The native adapter deliberately caps the combined transfer phase at
        // 0.89 while Bunny encodes the uploaded video. Treat that boundary as
        // server processing so the UI does not look frozen at "Uploading 89%".
        if (value >= 0.89) serverProcessing = true;
        ClipLogger.uploadDebug(uploadId, "BUNNY", "PROGRESS", {
          clipId, fraction: value, uiProgress: 0.4 + value * 0.5,
        });
        onProgress({
          stage: serverProcessing ? "processing" : "uploading",
          progress: Math.min(0.94, 0.4 + value * 0.55),
          bytesUploaded: Math.round(prepared.fileSizeBytes * value),
          totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1,
        });
      }, (abort) => activeUploadAborters.set(uploadId, abort), isCancelled);
      ClipLogger.info("upload", "Bunny upload complete", { queueId: item.id, clipId });
      ClipLogger.uploadDebug(uploadId, "BUNNY", "DONE", {
        clipId, elapsedMs: Date.now() - stageStartedAt, uploaded,
      });
      if (shouldCancel()) {
        await withTimeout("Cleaning up cancelled upload", supabase.functions.invoke("clip-media-delete", {
          body: { vendorId: draft.vendorId, publicId: uploaded.publicId },
        })).catch(() => undefined);
        throw new ClipModuleError("UPLOAD_ERROR", "Upload cancelled.");
      }
      if (uploaded.fileSizeBytes > clipsConfig.media.maximumFinalFileSizeBytes) {
        await withTimeout("Cleaning up oversized upload", supabase.functions.invoke("clip-media-delete", {
          body: { vendorId: draft.vendorId, publicId: uploaded.publicId },
        })).catch(() => undefined);
        throw new ClipModuleError("UPLOAD_ERROR", "The processed clip is above 20 MB and was not saved. Please choose a shorter video or a lower-resolution clip.");
      }
      onProgress({ stage: "saving", progress: 0.95, bytesUploaded: prepared.fileSizeBytes, totalBytes: prepared.fileSizeBytes, attempt: item.retryCount + 1 });
      const insertStartedAt = Date.now();
      ClipLogger.info("database", "Supabase operation started", {
        table: "clips", operation: "rpc/finalize_clip_upload", queueId: item.id, clipId,
      });
      const insertPayload = {
      id: clipId,
      category_id: authoritativeCategoryId,
      title: draft.title.trim(),
      caption: draft.caption?.trim() || null,
      video_url: uploaded.videoUrl,
      thumbnail_url: uploaded.thumbnailUrl,
      duration_seconds: uploaded.durationSeconds,
      width: uploaded.resolution.width,
      height: uploaded.resolution.height,
      file_size_bytes: uploaded.fileSizeBytes,
      bunny_asset_id: uploaded.publicId,
      };
      ClipLogger.uploadDebug(uploadId, "DATABASE_INSERT", "START", {
        table: "clips", operation: "rpc/finalize_clip_upload", clipId, payload: insertPayload,
      });
      // finalize_clip_upload() atomically inserts the Clip row and marks
      // the reservation completed inside a single database transaction --
      // this is what makes "reserve a slot, then insert after the
      // Bunny upload" race-free instead of the old
      // check-count-then-insert sequence. It is also idempotent: if this
      // call is retried after a lost response, the already-inserted Clip
      // is returned rather than duplicated.
      const { data, error } = await withTimeout(
        "Saving Clip database record",
        supabase.rpc("finalize_clip_upload", {
          target_reservation_id: reservationId,
          clip_row: insertPayload,
        }),
      );
      ClipLogger.info("database", "Supabase operation completed", {
        table: "clips", operation: "rpc/finalize_clip_upload", queueId: item.id, clipId,
        data, error: error?.message ?? null, elapsedMs: Date.now() - insertStartedAt,
      });
      ClipLogger.uploadDebug(uploadId, "DATABASE_INSERT", error ? "ERROR" : "DONE", {
        table: "clips", operation: "rpc/finalize_clip_upload", clipId, data,
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        } : null,
        elapsedMs: Date.now() - insertStartedAt,
      });
      if (error) {
        await withTimeout("Cleaning up failed upload", supabase.functions.invoke("clip-media-delete", {
          body: { vendorId: draft.vendorId, publicId: uploaded.publicId },
        })).catch(() => undefined);
        if (error.hint === "RESERVATION_EXPIRED" || error.code === "P0003") {
          throw new ClipModuleError("UPLOAD_ERROR", "This upload took too long and the reserved slot expired. Please try again.", true, error);
        }
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
      // Release the reservation on any failure after it was created (a
      // no-op if finalize_clip_upload() already completed it) so a failed
      // upload frees its slot immediately instead of holding it until the
      // 15 minute expiry.
      const uploadedAwaitingProcessing = Boolean(item.bunnyUpload?.uploaded)
        && /processing did not finish in time/i.test(error instanceof Error ? error.message : String(error));
      // Uploaded bytes are recoverable via the persisted Bunny video id. Keep
      // their reservation alive for the bounded status retry; releasing it here
      // made the retry reserve/upload lifecycle inconsistent.
      if (!uploadedAwaitingProcessing) await releaseReservation(reservationId);
      throw error;
    } finally {
      activeUploadAborters.delete(uploadId);
      cancelledUploadIds.delete(uploadId);
      if (temporaryPreparedUri) {
        await FileSystem.deleteAsync(temporaryPreparedUri, { idempotent: true }).catch(() => undefined);
      }
      ClipLogger.uploadDebug(uploadId, "PIPELINE", "FINALLY", {
        elapsedMs: Date.now() - pipelineStartedAt,
      });
    }
  },
};
