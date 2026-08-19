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
  // The queue is persisted per-vendor (see storageKey()) so it is scoped by
  // whichever vendor is currently authenticated. `activeVendorId` is the
  // vendor the in-memory `items` currently belong to; `hydratedVendorId`
  // tracks which vendor's persisted rows have actually been loaded into
  // `items`, so a hydrate() started for a vendor who has since logged out
  // (fast logout/login) is detected and discarded rather than silently
  // repopulating the queue with a stale vendor's data.
  private activeVendorId: string | null = null;
  private hydratedVendorId: string | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  private storageKey(vendorId: string) {
    return `${KEY}:${vendorId}`;
  }

  /**
   * Scopes the queue to one authenticated vendor. Must be called (with the
   * current vendor id, or null when signed out) before the Upload Queue is
   * read/rendered -- on initial mount, and again whenever the authenticated
   * vendor id changes (logout, or a different vendor logging in on the same
   * device). Switching vendors clears `items` synchronously so a previous
   * vendor's clips can never flash on screen while the new vendor's rows
   * are being read from storage, then hydrates the new vendor's own
   * persisted queue (empty for a vendor who has never queued an upload).
   */
  async setActiveVendor(vendorId: string | null) {
    if (vendorId === this.activeVendorId && vendorId === this.hydratedVendorId) {
      return this.items;
    }
    this.activeVendorId = vendorId;
    this.items = [];
    this.hydratedVendorId = null;
    this.emit();
    if (!vendorId) return this.items;
    return this.hydrateForVendor(vendorId);
  }

  private async hydrateForVendor(vendorId: string) {
    const raw = await AsyncStorage.getItem(this.storageKey(vendorId));
    // The active vendor changed again while this read was in flight (a fast
    // logout/login) -- discard this now-stale result instead of applying a
    // previous vendor's rows on top of whatever setActiveVendor already did.
    if (this.activeVendorId !== vendorId) return this.items;
    let parsed: ClipQueueItem[] = [];
    try { parsed = raw ? JSON.parse(raw) : []; } catch { parsed = []; }
    this.items = parsed.map((item) =>
      ["uploading", "compressing", "thumbnail", "saving"].includes(item.status)
        ? { ...item, status: "waiting", error: null }
        : item,
    );
    this.hydratedVendorId = vendorId;
    this.emit();
    return this.items;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => this.listeners.delete(listener);
  }

  private async persist() {
    // No authenticated vendor to scope this write to -- nothing to persist.
    // (Every mutating method below requires an active vendor before calling
    // persist(), so this is a defensive no-op, not the common path.)
    if (!this.activeVendorId) return;
    const storageKey = this.storageKey(this.activeVendorId);
    const snapshot = JSON.stringify(this.items);
    const startedAt = Date.now();
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          AsyncStorage.setItem(storageKey, snapshot),
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
    // Defense in depth: the queue must already be scoped to the vendor
    // doing the uploading (via setActiveVendor), and every draft must
    // belong to that exact vendor -- never trust the caller alone to have
    // gotten the vendor id right.
    const mismatched = drafts.find((draft) => draft.vendorId !== this.activeVendorId);
    if (!this.activeVendorId || mismatched) {
      throw new ClipModuleError(
        "VALIDATION_ERROR",
        "Upload queue is not scoped to the signed-in vendor. Please try again.",
      );
    }
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

  /** Clears the CURRENT vendor's persisted queue only -- never touches
   * another vendor's storage key. */
  async clear() {
    const vendorId = this.activeVendorId;
    this.items = [];
    if (vendorId) {
      this.hydratedVendorId = vendorId;
      await AsyncStorage.removeItem(this.storageKey(vendorId));
    }
    this.emit();
  }

  onReconnect(callback: () => void) {
    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) callback();
    });
  }
}

export const ClipQueueService = new Queue();
