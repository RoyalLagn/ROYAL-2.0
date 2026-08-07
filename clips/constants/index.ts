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
  // Only the active clip mounts a real video player/decoder. This is how far
  // ahead we still prefetch a lightweight poster image for — NOT a second
  // video player — so a single phone-class Android decoder is never asked
  // to run more than one Clip at once (matches Instagram-style "one clip
  // plays at a time" behaviour and avoids decoder-exhaustion jank/crashes).
  prefetchAhead: 1,
  cacheTtlMs: 5 * 60 * 1000,
  staleWhileRevalidateMs: 60 * 1000,
  autoAdvanceOnEnd: true,
  minimumViewDurationMs: 3_000,
});

/**
 * Cloudinary video delivery — a single fixed transformation bucket, not a
 * per-device/per-render size. Cloudinary transcodes video on-the-fly per
 * unique transformation string, and that transcode is genuinely slow
 * (measured 7-11s cold vs ~2s for the untransformed original). A width that
 * varies with viewport/DPR means practically every device requests its own
 * never-before-seen string, so it *never* hits a warm derivative. Every
 * clip in the DB is already capped at 1080x1920 at upload (see
 * clips_resolution_valid), so this bucket matches the source almost exactly
 * — Cloudinary mostly just re-encodes format/quality rather than resizing —
 * and it's the same single string for every viewer, so at most one viewer
 * ever pays the cold-transcode cost per clip.
 */
export const CLIP_VIDEO_DELIVERY = Object.freeze({
  width: 1080,
  height: 1920,
  nativeQuality: "auto:good",
  webQuality: "auto:good",
});

export const DEFAULT_CLIP_PLAN_LIMITS = Object.freeze({
  maximumClips: 10,
});

export const CLIP_UPLOAD_RETRY = Object.freeze({
  maximumAttempts: 3,
  initialDelayMs: 750,
  maximumDelayMs: 5_000,
});
