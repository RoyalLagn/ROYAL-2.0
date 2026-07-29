import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipQueueItem, ClipUploadDraft } from "../types";
import { asClipError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import { ClipQueueService, ClipUploadOrchestrator } from "../services";

export function useClipUploadQueue() {
  const [items, setItems] = useState<ClipQueueItem[]>([]);
  const processing = useRef(false);

  const process = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    try {
      let next = ClipQueueService.getItems().find((item) => item.status === "waiting");
      while (next) {
        const active = next;
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
          ClipLogger.uploadDebug(active.id, "QUEUE_COMPLETION_PERSISTED", "DONE", {
            elapsedMs: Date.now() - queueStartedAt, progress: 1,
          });
          ClipLogger.info("upload", "Queue completed", {
            queueId: active.id,
            elapsedMs: Date.now() - queueStartedAt,
          });
        } catch (caught) {
          const error = asClipError(caught);
          const cancelled = ClipQueueService.getItems().some(
            (candidate) => candidate.id === active.id && candidate.status === "cancelled",
          );
          if (!cancelled) {
            await ClipQueueService.update(active.id, { status: "failed", error: error.message });
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
        next = ClipQueueService.getItems().find((item) => item.status === "waiting");
      }
    } finally {
      processing.current = false;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = ClipQueueService.subscribe(setItems);
    void ClipQueueService.hydrate().then(process);
    const network = ClipQueueService.onReconnect(() => {
      void (async () => {
        const offlineFailures = ClipQueueService.getItems().filter(
          (item) => item.status === "failed" && /network|offline|fetch/i.test(item.error || ""),
        );
        for (const item of offlineFailures) {
          await ClipQueueService.update(item.id, {
            status: "waiting", error: null, retryCount: item.retryCount + 1,
          });
        }
        await process();
      })();
    });
    return () => { unsubscribe(); network(); };
  }, [process]);

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
  const cancel = useCallback((id: string) => ClipQueueService.update(id, { status: "cancelled" }), []);
  const remove = useCallback((id: string) => ClipQueueService.remove(id), []);

  return { items, enqueue, retry, cancel, remove, process };
}
