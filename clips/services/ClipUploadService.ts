import { clipsConfig } from "../config";
import { DEFAULT_CLIP_PLAN_LIMITS } from "../constants";
import type { ClipUploadDraft, ClipPlanLimits } from "../types";
import { ClipModuleError } from "../utils/errors";
import { validateClipSource } from "../utils/validation";
import { ClipCompressionService } from "./ClipCompressionService";

export interface ClipLimitResolver {
  resolve(vendorId: string): Promise<ClipPlanLimits>;
}

let limitResolver: ClipLimitResolver | null = null;
export const ClipUploadService = {
  configureLimitResolver(resolver: ClipLimitResolver | null) {
    limitResolver = resolver;
  },
  validate(draft: ClipUploadDraft) {
    if (!draft.vendorId || !draft.categoryId || !draft.title.trim()) {
      throw new ClipModuleError("VALIDATION_ERROR", "Vendor, category, and title are required.");
    }
    return validateClipSource(draft.source);
  },
  async prepare(draft: ClipUploadDraft, onCompressionProgress?: (value: number) => void) {
    const validation = this.validate(draft);
    if (!validation.requiresCompression) return draft.source;
    const compressed = await ClipCompressionService.compress(draft.source, onCompressionProgress);
    if (compressed.fileSizeBytes > clipsConfig.media.maximumFinalFileSizeBytes) {
      throw new ClipModuleError("COMPRESSION_ERROR", "This video could not be compressed below 40 MB. Please choose a shorter video or a lower-resolution clip.");
    }
    return compressed;
  },
  resolveLimits(vendorId: string) {
    if (!limitResolver) {
      return Promise.resolve(DEFAULT_CLIP_PLAN_LIMITS);
    }
    return limitResolver.resolve(vendorId);
  },
};
