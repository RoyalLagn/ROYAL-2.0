import { clipsConfig } from "../config";
import type { ClipUpload } from "../types";

export type ClipCompressionAttempt = {
  targetBytes: number;
  maxDimension: number;
  videoBitrate: number;
};

const AUDIO_BITRATE_RESERVE = 128_000;

/**
 * Builds a bounded, quality-first plan. The first pass preserves up to 1080p;
 * later passes reduce resolution only after a measured output misses 40 MiB.
 * react-native-compressor preserves aspect ratio/orientation and the source
 * frame rate up to its native 60 fps cap.
 */
export function buildClipCompressionPlan(source: ClipUpload): ClipCompressionAttempt[] {
  const duration = Math.max(1, source.durationSeconds);
  const sourceMaxDimension = Math.max(2, source.resolution.width, source.resolution.height);
  const originalEstimatedBitrate = Math.max(500_000, Math.floor((source.fileSizeBytes * 8) / duration));
  const profiles = [
    { targetBytes: clipsConfig.compression.targetFileSizeBytes, maxDimension: 1920, overheadFactor: 0.94 },
    { targetBytes: 37 * 1024 * 1024, maxDimension: 1280, overheadFactor: 0.9 },
    { targetBytes: 35 * 1024 * 1024, maxDimension: 960, overheadFactor: 0.86 },
  ];

  return profiles.slice(0, clipsConfig.compression.maximumAttempts).map((profile) => {
    const sizeAwareBitrate = Math.max(
      500_000,
      Math.floor(((profile.targetBytes * 8 * profile.overheadFactor) / duration) - AUDIO_BITRATE_RESERVE),
    );
    return {
      targetBytes: profile.targetBytes,
      maxDimension: Math.min(sourceMaxDimension, profile.maxDimension),
      videoBitrate: Math.min(originalEstimatedBitrate, sizeAwareBitrate),
    };
  });
}
