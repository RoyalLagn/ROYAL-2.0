import type { ClipCloudinaryAsset, ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { withClipRetry } from "../utils/retry";

export interface ClipCloudinaryUploadInput {
  debugUploadId?: string;
  clipId: string;
  vendorId: string;
  video: ClipUpload;
  thumbnailUri: string;
}
export interface ClipCloudinaryAdapter {
  upload(input: ClipCloudinaryUploadInput, onProgress?: (value: number) => void): Promise<ClipCloudinaryAsset>;
  delete(publicId: string): Promise<void>;
  replace(input: ClipCloudinaryUploadInput, previousPublicId: string, onProgress?: (value: number) => void): Promise<ClipCloudinaryAsset>;
}

let adapter: ClipCloudinaryAdapter | null = null;
export const ClipCloudinaryService = {
  configure(nextAdapter: ClipCloudinaryAdapter | null) {
    adapter = nextAdapter;
  },
  isConfigured: () => adapter !== null,
  upload(input: ClipCloudinaryUploadInput, onProgress?: (value: number) => void) {
    if (!adapter) throw new Error("Clip Cloudinary adapter is not configured.");
    return withClipRetry(
      () => adapter!.upload(input, onProgress),
      (error) => !(error instanceof ClipModuleError) || error.retryable,
    );
  },
  delete(publicId: string) {
    if (!adapter) throw new Error("Clip Cloudinary adapter is not configured.");
    return adapter.delete(publicId);
  },
  replace(input: ClipCloudinaryUploadInput, previousPublicId: string, onProgress?: (value: number) => void) {
    if (!adapter) throw new Error("Clip Cloudinary adapter is not configured.");
    return withClipRetry(
      () => adapter!.replace(input, previousPublicId, onProgress),
      (error) => !(error instanceof ClipModuleError) || error.retryable,
    );
  },
};
