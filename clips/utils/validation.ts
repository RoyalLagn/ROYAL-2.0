import { clipsConfig } from "../config";
import type { ClipUpload } from "../types";
import { ClipModuleError } from "./errors";

export function validateClipSource(source: ClipUpload) {
  const extension = source.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!clipsConfig.formats.includes(extension as (typeof clipsConfig.formats)[number])) {
    throw new ClipModuleError("VALIDATION_ERROR", "Unsupported video format.");
  }
  if (source.durationSeconds <= 0 || source.durationSeconds > clipsConfig.media.maximumDurationSeconds) {
    throw new ClipModuleError("VALIDATION_ERROR", "Clip duration must be 30 seconds or less.");
  }
  if (source.fileSizeBytes <= 0) {
    throw new ClipModuleError("VALIDATION_ERROR", "Clip file size is unavailable.");
  }
  if (source.fileSizeBytes > clipsConfig.media.maximumSourceFileSizeBytes) {
    throw new ClipModuleError(
      "VALIDATION_ERROR",
      "Upload clips up to 40 MB only. Choose a smaller video.",
    );
  }
  return {
    // A file at 20 MiB or below goes straight to Bunny. Anything larger
    // is prepared locally first, so the original source never reaches storage.
    requiresCompression: source.fileSizeBytes > clipsConfig.media.compressionThresholdBytes,
  };
}
