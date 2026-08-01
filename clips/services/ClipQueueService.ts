import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { ClipQueueItem, ClipUploadDraft } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";

const KEY = "@royallagn/clips/upload-queue/v1";
const PERSIST_TIMEOUT_MS = 30_000;
type Listener = (items: ClipQueueItem[]) => void;

class Queue {
  private items: ClipQueueItem[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;
  private writeChain: Promise<void> = Promise.resolve();

  async hydrate() {
    if (this.hydrated) return this.items;
    const raw = await AsyncStorage.getItem(KEY);
    try { this.items = raw ? JSON.parse(raw) : []; } catch { this.items = []; }
    this.items = this.items.map((item) =>
      ["uploading", "compressing", "thumbnail", "saving"].includes(item.status)
        ? { ...item, status: "waiting", error: null }
        : item,
    );
    this.hydrated = true;
    this.emit();
    return this.items;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => this.listeners.delete(listener);
  }

  private async persist() {
    const snapshot = JSON.stringify(this.items);
    const startedAt = Date.now();
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          AsyncStorage.setItem(KEY, snapshot),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ClipModuleError(
              "UPLOAD_ERROR",
              "Saving upload queue timed out after 30 seconds.",
              false,
            )), PERSIST_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
    await this.writeChain;
    ClipLogger.debug("upload", "Queue update persisted", { elapsedMs: Date.now() - startedAt });
    this.emit();
  }

  private emit() {
    const snapshot = [...this.items];
    this.listeners.forEach((listener) => listener(snapshot));
  }

  async enqueue(drafts: ClipUploadDraft[]) {
    const now = new Date().toISOString();
    this.items.push(...drafts.map((draft) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ClipLogger.uploadDebug(id, "QUEUE_ITEM_CREATED", "DONE", {
        vendorId: draft.vendorId, categoryId: draft.categoryId,
        fileName: draft.source.fileName, bytes: draft.source.fileSizeBytes,
      });
      return {
      id,
      draft,
      status: "waiting" as const,
      progress: { stage: "idle" as const, progress: 0, bytesUploaded: 0, totalBytes: draft.source.fileSizeBytes, attempt: 0 },
      error: null,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      };
    }));
    await this.persist();
    return this.items;
  }

  async update(id: string, patch: Partial<ClipQueueItem>) {
    const startedAt = Date.now();
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    );
    ClipLogger.uploadDebug(id, "QUEUE_UPDATE", "START", {
      status: patch.status ?? null, progress: patch.progress?.progress ?? null,
    });
    await this.persist();
    ClipLogger.uploadDebug(id, "QUEUE_UPDATE", "DONE", {
      status: patch.status ?? null, progress: patch.progress?.progress ?? null,
      elapsedMs: Date.now() - startedAt,
    });
    ClipLogger.info("upload", "Queue updated", {
      queueId: id,
      status: patch.status ?? null,
      progress: patch.progress?.progress ?? null,
      elapsedMs: Date.now() - startedAt,
    });
  }

  updateProgress(id: string, patch: Partial<ClipQueueItem>) {
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    );
    this.emit();
  }

  async remove(id: string) {
    const target = this.items.find((item) => item.id === id);
    this.items = this.items.filter((item) => item.id !== id);
    await this.persist();
    if (target && Platform.OS !== "web") {
      for (const uri of [target.draft.source.uri, target.draft.customThumbnailUri]) {
        if (uri?.startsWith(FileSystem.documentDirectory || "__never__")) {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
      }
    }
  }

  getItems() { return [...this.items]; }

  async clear() {
    this.items = [];
    this.hydrated = true;
    await AsyncStorage.removeItem(KEY);
    this.emit();
  }

  onReconnect(callback: () => void) {
    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) callback();
    });
  }
}

export const ClipQueueService = new Queue();
