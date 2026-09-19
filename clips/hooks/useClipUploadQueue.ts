import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { ClipQueueItem, ClipUploadDraft } from "../types";
import { asClipError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import { ClipQueueService, ClipUploadOrchestrator } from "../services";
import { clipsConfig } from "../config";

// The upload screen can unmount/remount while an upload is still running.
// Keep the worker lock at module scope so there is exactly one queue consumer
// for the whole app, rather than one consumer per hook instance.
let queueProcessor: Promise<void> | null = null;
const deferredProcessingIds = new Set<string>();

/**
 * @param vendorId The currently authenticated vendor's id (or null/undefined
 * while signed out / still resolving). The Upload Queue is scoped to this
 * id (see ClipQueueService.setActiveVendor) so that logging out and back in
 * as a different vendor -- on the same device -- can never surface the
 * previous vendor's queued/in-progress uploads.
 */
export function useClipUploadQueue(vendorId?: string | null) {
  const [items, setItems] = useState<ClipQueueItem[]>([]);
  const processRef = useRef<() => Promise<void>>(async () => undefined);

  const process = useCallback(async () => {
    if (queueProcessor) {
      await queueProcessor;
      const workArrivedWhileFinishing = ClipQueueService.getItems().some(
        (item) => item.status === "waiting" && !deferredProcessingIds.has(item.id),
      );
      if (workArrivedWhileFinishing) return processRef.current();
      return;
    }
    const run = async () => {
      let next = ClipQueueService.getItems().find(
        (item) => item.status === "waiting" && !deferredProcessingIds.has(item.id),
      );
      while (next) {
        let active = next;
        if (!active.clipId) {
          const clipId = globalThis.crypto?.randomUUID?.()
            ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
              const random = Math.floor(Math.random() * 16);
              return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
            });
          await ClipQueueService.update(active.id, { clipId });
          active = ClipQueueService.getItems().find((item) => item.id === active.id) ?? { ...active, clipId };
        }
        const queueStartedAt = Date.now();
        try {
          ClipLogger.uploadDebug(active.id, "QUEUE_PROCESS", "START", {
            status: active.status, attempt: active.retryCount + 1,
          });
          ClipLogger.info("upload", "Queue processing started", { queueId: active.id });
          await ClipQueueService.update(active.id, { status: "uploading", error: null });
          await ClipUploadOrchestrator.execute(active, (progress) => {
            ClipQueueService.updateProgress(active.id, {
              progress,
              status: progress.stage === "compressing" ? "compressing"
                : progress.stage === "thumbnail" ? "thumbnail"
                : progress.stage === "processing" ? "uploading"
                : progress.stage === "saving" ? "saving"
                : progress.stage === "complete" ? "completed" : "uploading",
            });
          }, () => ClipQueueService.getItems().some(
            (candidate) => candidate.id === active.id && candidate.status === "cancelled",
          ));
          if (ClipQueueService.getItems().some(
            (candidate) => candidate.id === active.id && candidate.status === "cancelled",
          )) continue;
          await ClipQueueService.update(active.id, {
            status: "completed",
            progress: {
              stage: "complete",
              progress: 1,
              bytesUploaded: active.draft.source.fileSizeBytes,
              totalBytes: active.draft.source.fileSizeBytes,
              attempt: active.retryCount + 1,
            },
          });
          await ClipQueueService.cleanupCompletedMedia(active.id);
          ClipLogger.uploadDebug(active.id, "QUEUE_COMPLETION_PERSISTED", "DONE", {
            elapsedMs: Date.now() - queueStartedAt, progress: 1,
          });
          ClipLogger.info("upload", "Queue completed", {
            queueId: active.id,
            elapsedMs: Date.now() - queueStartedAt,
          });
        } catch (caught) {
          const error = asClipError(caught);
          const cancelled = /upload cancelled/i.test(error.message)
            || ClipQueueService.getItems().some(
              (candidate) => candidate.id === active.id && candidate.status === "cancelled",
            );
          if (!cancelled) {
            const current = ClipQueueService.getItems().find((item) => item.id === active.id);
            const nextRetryCount = active.retryCount + 1;
            const bunnyStillProcessing = Boolean(current?.bunnyUpload?.uploaded)
              && /processing did not finish in time/i.test(error.message);
            if (bunnyStillProcessing && nextRetryCount < clipsConfig.retry.maximumAttempts) {
              // Encoding latency is not another upload attempt. Keep the exact
              // persisted Bunny video ID and defer status polling so later
              // queued clips are not blocked behind this one forever.
              await ClipQueueService.update(active.id, {
                status: "waiting",
                error: null,
                retryCount: nextRetryCount,
                progress: {
                  ...(current?.progress ?? active.progress),
                  stage: "processing",
                  progress: Math.max(0.9, current?.progress.progress ?? 0.9),
                },
              });
              deferredProcessingIds.add(active.id);
              setTimeout(() => {
                deferredProcessingIds.delete(active.id);
                void processRef.current();
              }, 30_000);
            } else if (error.retryable && nextRetryCount < clipsConfig.retry.maximumAttempts) {
              await ClipQueueService.update(active.id, {
                status: "waiting",
                error: null,
                retryCount: nextRetryCount,
                progress: { ...(current?.progress ?? active.progress), stage: "idle", progress: 0 },
              });
              const delay = Math.min(
                clipsConfig.retry.maximumDelayMs,
                clipsConfig.retry.initialDelayMs * (2 ** active.retryCount),
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
              Alert.alert("Clip upload failed", error.message);
              await ClipQueueService.update(active.id, {
                status: "failed",
                error: `${error.message} Check your connection, then tap Retry.`,
                retryCount: nextRetryCount,
                progress: { ...(current?.progress ?? active.progress), stage: "failed" },
              });
            }
          }
          ClipLogger.error("upload", "Queue failed", {
            queueId: active.id,
            elapsedMs: Date.now() - queueStartedAt,
            error: error.message,
          });
          ClipLogger.uploadDebug(active.id, "QUEUE_PROCESS", "ERROR", {
            elapsedMs: Date.now() - queueStartedAt,
            message: error.message,
            stack: caught instanceof Error ? caught.stack : null,
          });
        } finally {
          ClipLogger.uploadDebug(active.id, "QUEUE_PROCESS", "FINALLY", {
            elapsedMs: Date.now() - queueStartedAt,
          });
        }
        next = ClipQueueService.getItems().find(
          (item) => item.status === "waiting" && !deferredProcessingIds.has(item.id),
        );
      }
    };
    queueProcessor = run().finally(() => { queueProcessor = null; });
    return queueProcessor;
  }, []);
  processRef.current = process;

  useEffect(() => {
    const unsubscribe = ClipQueueService.subscribe(setItems);
    // Re-scopes the queue every time the authenticated vendor id changes --
    // including to null on logout -- so a previous vendor's items are
    // cleared immediately rather than lingering until something else
    // happens to re-render this screen.
    void ClipQueueService.setActiveVendor(vendorId ?? null).then(process);
    const network = ClipQueueService.onReconnect(() => { void process(); });
    return () => { unsubscribe(); network(); };
  }, [process, vendorId]);

  const enqueue = useCallback(async (drafts: ClipUploadDraft[]) => {
    await ClipQueueService.enqueue(drafts);
    await process();
  }, [process]);
  const retry = useCallback(async (id: string) => {
    const item = ClipQueueService.getItems().find((candidate) => candidate.id === id);
    await ClipQueueService.update(id, {
      status: "waiting", error: null, retryCount: (item?.retryCount ?? 0) + 1,
    });
    await process();
  }, [process]);
  const cancel = useCallback(async (id: string) => {
    ClipUploadOrchestrator.cancel(id);
    await ClipQueueService.update(id, { status: "cancelled", error: "Upload cancelled." });
  }, []);
  const remove = useCallback((id: string) => ClipQueueService.remove(id), []);

  return { items, enqueue, retry, cancel, remove, process };
}
