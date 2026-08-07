/**
 * Build sized Cloudinary delivery URLs for web/native Image tags and for
 * Clips video playback. Strips any existing transform chain, then applies
 * fresh optimizations — safe because Cloudinary transformations always
 * apply against the original master asset (public_id), not against
 * whichever derivative happens to be referenced in the source URL, so a
 * device-appropriate derivative is generated (and cached) on first request.
 */

import { Platform } from "react-native";

export type CloudinaryDeliveryOptions = {
  /** Max width in CSS pixels (will be multiplied by dpr when provided). */
  width?: number;
  height?: number;
  /** Default c_fill for cards; use c_limit for hero so creatives are not cropped. */
  crop?: "fill" | "limit" | "fit";
  /** Device pixel ratio — clamped 1–3. */
  dpr?: number;
  quality?: "auto" | "auto:eco" | "auto:good";
};

function isTransformSegment(segment: string) {
  if (!segment || segment === ".") return false;
  if (/^v\d+$/.test(segment)) return false;
  if (segment.includes(",")) return true;
  return /^(?:(?:[a-z]{1,2}|fl|pg|dpr|t)_[a-zA-Z0-9.:-]+|q_auto(?::[a-z]+)?|f_auto)$/i.test(segment);
}

/** True when the URL is a Cloudinary image delivery URL we can rewrite. */
export function isCloudinaryImageUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.hostname.includes("res.cloudinary.com")
      && parsed.pathname.includes("/image/upload/")
    );
  } catch {
    return false;
  }
}

/**
 * Returns a delivery URL with f_auto, q_auto, optional w_/h_/c_/dpr_.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function cloudinaryDeliveryUrl(
  url: string,
  options: CloudinaryDeliveryOptions = {},
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const marker = "/image/upload/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0 || !parsed.hostname.includes("cloudinary.com")) return trimmed;

    const afterUpload = parsed.pathname.slice(index + marker.length);
    const segments = afterUpload.split("/").filter(Boolean);
    let cursor = 0;
    while (cursor < segments.length && isTransformSegment(segments[cursor])) {
      cursor += 1;
    }
    const assetPath = segments.slice(cursor).join("/");
    if (!assetPath) return trimmed;

    const parts = ["f_auto", `q_${options.quality ?? "auto"}`];
    const dpr = Math.min(3, Math.max(1, Number(options.dpr ?? 1)));
    if (options.width && options.width > 0) {
      parts.push(`w_${Math.round(options.width * dpr)}`);
    }
    if (options.height && options.height > 0) {
      parts.push(`h_${Math.round(options.height * dpr)}`);
    }
    if (options.crop && (options.width || options.height)) {
      parts.push(`c_${options.crop}`);
    }

    parsed.pathname = `${parsed.pathname.slice(0, index + marker.length)}${parts.join(",")}/${assetPath}`;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export type CloudinaryVideoDeliveryOptions = {
  /** Target pixel width of the delivered video (already dpr-multiplied by the caller). */
  width?: number;
  height?: number;
  crop?: "limit" | "fill" | "fit";
  quality?: "auto" | "auto:eco" | "auto:good";
};

/** True when the URL is a Cloudinary video delivery URL we can rewrite. */
export function isCloudinaryVideoUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.hostname.includes("res.cloudinary.com")
      && parsed.pathname.includes("/video/upload/")
    );
  } catch {
    return false;
  }
}

/**
 * Returns a mobile-appropriate Cloudinary video delivery URL: capped width
 * (never upscaled, via c_limit), automatic quality, and an explicit codec on
 * native so the player always receives a directly playable MP4 — f_auto is
 * only safe on web, where Cloudinary can sniff the Accept header of a real
 * browser request. Non-Cloudinary URLs are returned unchanged.
 */
export function cloudinaryVideoDeliveryUrl(
  url: string,
  options: CloudinaryVideoDeliveryOptions = {},
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const marker = "/video/upload/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0 || !parsed.hostname.includes("cloudinary.com")) return trimmed;

    const afterUpload = parsed.pathname.slice(index + marker.length);
    const segments = afterUpload.split("/").filter(Boolean);
    let cursor = 0;
    while (cursor < segments.length && isTransformSegment(segments[cursor])) {
      cursor += 1;
    }
    const assetPath = segments.slice(cursor).join("/");
    if (!assetPath) return trimmed;

    const parts = [
      Platform.OS === "web" ? "f_auto" : "f_mp4",
      `q_${options.quality ?? "auto"}`,
    ];
    if (options.width && options.width > 0) parts.push(`w_${Math.round(options.width)}`);
    if (options.height && options.height > 0) parts.push(`h_${Math.round(options.height)}`);
    if (options.crop && (options.width || options.height)) parts.push(`c_${options.crop}`);
    else if (options.width || options.height) parts.push("c_limit");

    parsed.pathname = `${parsed.pathname.slice(0, index + marker.length)}${parts.join(",")}/${assetPath}`;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}
