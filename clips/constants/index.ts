export const CLIP_MEDIA_LIMITS = Object.freeze({
  maximumDurationSeconds: 30,
  maximumFinalFileSizeBytes: 52 * 1024 * 1024,
  maximumWidth: 1080,
  maximumHeight: 1920,
});

export const CLIP_SUPPORTED_FORMATS = Object.freeze(["mp4", "mov", "m4v", "hevc"] as const);
export const CLIP_REJECTED_FORMATS = Object.freeze(["avi", "mkv", "wmv", "flv"] as const);

export const CLIP_COMPRESSION_SETTINGS = Object.freeze({
  preferredContainer: "mp4",
  preferredVideoCodec: "h264",
  preferredAudioCodec: "aac",
  maximumAttempts: 2,
  targetVideoBitrate: 8_000_000,
});

export const CLIP_THUMBNAIL_SETTINGS = Object.freeze({
  width: 720,
  height: 1280,
  format: "jpg",
  quality: 80,
  captureAtSeconds: 1,
  futureVariantCount: 3,
});

export const CLIP_PAGINATION = Object.freeze({
  defaultPageSize: 20,
  maximumPageSize: 50,
});

export const CLIP_FEED_SETTINGS = Object.freeze({
  prefetchAhead: 2,
  cacheTtlMs: 5 * 60 * 1000,
  staleWhileRevalidateMs: 60 * 1000,
  autoAdvanceOnEnd: true,
  minimumViewDurationMs: 3_000,
});

export const DEFAULT_CLIP_PLAN_LIMITS = Object.freeze({
  maximumClips: 10,
});

export const CLIP_UPLOAD_RETRY = Object.freeze({
  maximumAttempts: 3,
  initialDelayMs: 750,
  maximumDelayMs: 5_000,
});
