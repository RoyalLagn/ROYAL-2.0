import type { ClipBunnyAsset, ClipBunnyUploadState, ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { withClipRetry } from "../utils/retry";

export interface ClipBunnyUploadInput {
  debugUploadId?: string;
  clipId: string;
  vendorId: string;
  video: ClipUpload;
  /** Omitted for automatic covers; Bunny Stream's generated thumbnail is used. */
  thumbnailUri?: string | null;
  resume?: ClipBunnyUploadState;
  onUploadState?: (state: ClipBunnyUploadState) => Promise<void>;
}
export interface ClipBunnyAdapter {
  upload(input: ClipBunnyUploadInput, onProgress?: (value: number) => void, registerAbort?: (abort: () => void) => void, shouldCancel?: () => boolean): Promise<ClipBunnyAsset>;
  delete(publicId: string): Promise<void>;
  replace(input: ClipBunnyUploadInput, previousPublicId: string, onProgress?: (value: number) => void): Promise<ClipBunnyAsset>;
}

let adapter: ClipBunnyAdapter | null = null;
export const ClipBunnyService = {
  configure(nextAdapter: ClipBunnyAdapter | null) {
    adapter = nextAdapter;
  },
  isConfigured: () => adapter !== null,
  upload(input: ClipBunnyUploadInput, onProgress?: (value: number) => void, registerAbort?: (abort: () => void) => void, shouldCancel?: () => boolean) {
    if (!adapter) throw new Error("Clip Bunny adapter is not configured.");
    // A whole-pipeline automatic retry creates a second Bunny video object.
    // Keep retries explicit at queue level where cleanup/idempotency is visible.
    return adapter.upload(input, onProgress, registerAbort, shouldCancel);
  },
  delete(publicId: string) {
    if (!adapter) throw new Error("Clip Bunny adapter is not configured.");
    return adapter.delete(publicId);
  },
  replace(input: ClipBunnyUploadInput, previousPublicId: string, onProgress?: (value: number) => void) {
    if (!adapter) throw new Error("Clip Bunny adapter is not configured.");
    return withClipRetry(
      () => adapter!.replace(input, previousPublicId, onProgress),
      (error) => !(error instanceof ClipModuleError) || error.retryable,
    );
  },
};
