import {
  CLIP_COMPRESSION_SETTINGS,
  CLIP_FEED_SETTINGS,
  CLIP_MEDIA_LIMITS,
  CLIP_PAGINATION,
  CLIP_SUPPORTED_FORMATS,
  CLIP_THUMBNAIL_SETTINGS,
  CLIP_UPLOAD_RETRY,
} from "../constants";

export const clipsConfig = Object.freeze({
  media: CLIP_MEDIA_LIMITS,
  formats: CLIP_SUPPORTED_FORMATS,
  compression: CLIP_COMPRESSION_SETTINGS,
  thumbnail: CLIP_THUMBNAIL_SETTINGS,
  pagination: CLIP_PAGINATION,
  feed: CLIP_FEED_SETTINGS,
  retry: CLIP_UPLOAD_RETRY,
  bunnyFolder: "royallagn/clips",
});

export type ClipsConfig = typeof clipsConfig;
