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
  return {
    requiresCompression:
      source.fileSizeBytes > clipsConfig.media.maximumFinalFileSizeBytes
      || source.resolution.width > clipsConfig.media.maximumWidth
      || source.resolution.height > clipsConfig.media.maximumHeight,
  };
}
