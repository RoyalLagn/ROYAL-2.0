import {
  buildCloudinaryImageUrl,
  isCloudinaryUrl,
  type CloudinaryTransformOptions,
} from "@/services/cloudinary";

export type MediaDeliveryPreset =
  | "thumbnail"
  | "card"
  | "optimized"
  | "hero"
  | "fullscreen";

export type MediaDeliveryOptions = {
  preset?: MediaDeliveryPreset;
  width?: number;
  height?: number;
  crop?: "fill" | "limit" | "fit" | "scale";
  gravity?: "auto" | "face" | "center";
  dpr?: number;
  quality?: "auto" | "auto:eco" | "auto:good" | "auto:best" | number;
  format?: "auto" | "jpg" | "png" | "webp";
};

const PRESET_CONFIGS: Record<MediaDeliveryPreset, CloudinaryTransformOptions> = {
  thumbnail: {
    crop: "fill",
    gravity: "auto",
    width: 400,
    height: 300,
    quality: "auto:eco",
    format: "auto",
  },
  card: {
    crop: "fill",
    gravity: "auto",
    width: 600,
    height: 450,
    quality: "auto:good",
    format: "auto",
  },
  optimized: {
    crop: "limit",
    width: 1000,
    quality: "auto:good",
    format: "auto",
  },
  hero: {
    crop: "limit",
    width: 1600,
    quality: "auto:good",
    format: "auto",
  },
  fullscreen: {
    crop: "limit",
    width: 2200,
    quality: "auto:good",
    format: "auto",
  },
};

/**
 * Transforms an image URL for optimal delivery.
 * Supports:
 * - Cloudinary URLs (injects dynamic transformation parameters)
 * - Local / data / blob / other URLs (passes through safely)
 */
export function mediaDeliveryUrl(
  url: string | null | undefined,
  options: MediaDeliveryOptions = {}
): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Handle local assets, data URIs, blob URIs
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  // Handle Cloudinary URLs
  if (isCloudinaryUrl(trimmed)) {
    let transformOptions: CloudinaryTransformOptions = {};

    if (options.preset && PRESET_CONFIGS[options.preset]) {
      transformOptions = { ...PRESET_CONFIGS[options.preset] };
    }

    // Explicit options override preset defaults
    if (options.width) {
      transformOptions.width = options.width;
    }
    if (options.height) {
      transformOptions.height = options.height;
    }
    if (options.crop) {
      transformOptions.crop = options.crop;
    }
    if (options.gravity) {
      transformOptions.gravity = options.gravity;
    }
    if (options.dpr) {
      transformOptions.dpr = options.dpr;
    }
    if (options.quality) {
      transformOptions.quality = options.quality;
    }
    if (options.format) {
      transformOptions.format = options.format;
    }

    // Default to auto format & quality if none set
    if (!transformOptions.quality) transformOptions.quality = "auto";
    if (!transformOptions.format) transformOptions.format = "auto";

    return buildCloudinaryImageUrl(trimmed, transformOptions);
  }

  return trimmed;
}

export type MediaVideoDeliveryOptions = {
  width?: number;
  height?: number;
  crop?: "limit" | "fill" | "fit";
  quality?: "auto" | "auto:eco" | "auto:good";
};

export function mediaVideoDeliveryUrl(
  url: string | null | undefined,
  _options: MediaVideoDeliveryOptions = {}
): string {
  if (!url || typeof url !== "string") return "";
  return url.trim();
}
