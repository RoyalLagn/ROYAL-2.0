import type { ClipBunnyAsset, ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { withClipRetry } from "../utils/retry";

export interface ClipBunnyUploadInput {
  debugUploadId?: string;
  clipId: string;
  vendorId: string;
  video: ClipUpload;
  thumbnailUri: string;
}
export interface ClipBunnyAdapter {
  upload(input: ClipBunnyUploadInput, onProgress?: (value: number) => void): Promise<ClipBunnyAsset>;
  delete(publicId: string): Promise<void>;
  replace(input: ClipBunnyUploadInput, previousPublicId: string, onProgress?: (value: number) => void): Promise<ClipBunnyAsset>;
}

let adapter: ClipBunnyAdapter | null = null;
export const ClipBunnyService = {
  configure(nextAdapter: ClipBunnyAdapter | null) {
    adapter = nextAdapter;
  },
  isConfigured: () => adapter !== null,
  upload(input: ClipBunnyUploadInput, onProgress?: (value: number) => void) {
    if (!adapter) throw new Error("Clip Bunny adapter is not configured.");
    return withClipRetry(
      () => adapter!.upload(input, onProgress),
      (error) => !(error instanceof ClipModuleError) || error.retryable,
    );
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
