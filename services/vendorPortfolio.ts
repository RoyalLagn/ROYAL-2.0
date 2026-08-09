import { supabase } from "@/services/supabase";

export const PORTFOLIO_LIMITS = {
  albums: 5,
  mediaPerAlbum: 15,
  heroMin: 5,
  heroMax: 8,
  imageBytes: 5 * 1024 * 1024,
  videoBytes: 25 * 1024 * 1024,
  videoWarningSeconds: 3 * 60,
  videoMaxSeconds: 4 * 60,
} as const;

export type PortfolioProcessingStatus =
  | "uploading"
  | "compressing"
  | "processing"
  | "ready"
  | "failed";

export type VendorPortfolioMedia = {
  id: string;
  vendor_id: string;
  album_id: string;
  secure_url: string;
  optimized_url: string | null;
  hero_url: string | null;
  fullscreen_url: string | null;
  public_id: string;
  resource_type: "image" | "video";
  format: string | null;
  width: number | null;
  height: number | null;
  aspect_ratio: number | null;
  duration: number | null;
  bytes: number | null;
  original_size_bytes: number | null;
  optimized_size_bytes: number | null;
  source_fingerprint?: string | null;
  thumbnail_url: string | null;
  video_poster_url: string | null;
  focal_point_x: number;
  focal_point_y: number;
  display_order: number;
  is_cover: boolean;
  upload_status: "processing" | "completed" | "failed";
  processing_status: PortfolioProcessingStatus;
  created_at: string;
  updated_at: string;
  subscription_locked: boolean;
  subscription_locked_at: string | null;
};

export type VendorPortfolioAlbum = {
  id: string;
  vendor_id: string;
  title: string;
  description: string | null;
  display_order: number;
  is_visible: boolean;
  media_count: number;
  cover_media_id: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorHeroMedia = {
  id: string;
  vendor_id: string;
  media_id: string;
  display_order: number;
  created_at: string;
};

export type PublicPortfolioAlbum = VendorPortfolioAlbum & {
  media: VendorPortfolioMedia[];
  cover: VendorPortfolioMedia | null;
  hasVideo: boolean;
};

function cloudinaryTransform(
  url: string,
  transformation: string,
  resourceType: "image" | "video" = "image",
) {
  const marker = `/${resourceType}/upload/`;
  return url.includes(marker)
    ? url.replace(marker, `${marker}${transformation}/`)
    : url;
}

export function portfolioMediaUrl(
  media: VendorPortfolioMedia,
  variant: "thumbnail" | "cover" | "card" | "hero" | "fullscreen" = "card",
) {
  if (variant === "thumbnail") {
    return media.resource_type === "video"
      ? media.video_poster_url
        || media.thumbnail_url
        || cloudinaryTransform(media.secure_url, "so_0,c_fit,w_480,h_480,q_auto,f_jpg", "video")
      : cloudinaryTransform(media.secure_url, "c_limit,w_480,h_480,q_auto:eco,f_auto");
  }
  if (media.resource_type === "video") {
    return media.video_poster_url
      || media.thumbnail_url
      || cloudinaryTransform(media.secure_url, "so_0,c_fit,w_960,h_720,q_auto,f_jpg", "video");
  }
  if (variant === "cover") {
    return cloudinaryTransform(media.secure_url, "c_limit,w_720,h_780,q_auto:good,f_auto");
  }
  if (variant === "hero") {
    return cloudinaryTransform(media.secure_url, "c_limit,w_1600,h_1600,q_auto:good,f_auto");
  }
  if (variant === "fullscreen") {
    return media.fullscreen_url
      || cloudinaryTransform(media.secure_url, "c_limit,w_2560,h_2560,q_auto:good,f_auto");
  }
  return cloudinaryTransform(media.secure_url, "c_limit,w_1200,h_1200,q_auto:good,f_auto");
}

export function stableHeroSelection(
  albums: PublicPortfolioAlbum[],
  selectedIds: string[],
) {
  const allReadyImages = albums
    .flatMap((album) => album.media)
    .filter((media) =>
      media.resource_type === "image"
      && !media.subscription_locked
      && media.upload_status === "completed"
      && media.processing_status === "ready",
    );
  const byId = new Map(allReadyImages.map((media) => [media.id, media]));
  const manual = selectedIds
    .map((id) => byId.get(id))
    .filter((media): media is VendorPortfolioMedia => Boolean(media))
    .slice(0, PORTFOLIO_LIMITS.heroMax);
  if (manual.length) return manual;

  const covers = albums
    .map((album) => album.cover)
    .filter((media): media is VendorPortfolioMedia =>
      Boolean(media && media.resource_type === "image" && byId.has(media.id)),
    );
  const seen = new Set(covers.map((media) => media.id));
  return [
    ...covers,
    ...allReadyImages.filter((media) => !seen.has(media.id)),
  ].slice(0, PORTFOLIO_LIMITS.heroMax);
}

export async function replaceHeroMedia(vendorId: string, mediaIds: string[]) {
  if (mediaIds.length > PORTFOLIO_LIMITS.heroMax) {
    throw new Error(`Choose no more than ${PORTFOLIO_LIMITS.heroMax} hero images.`);
  }
  const { error } = await supabase.rpc("replace_vendor_hero_media", {
    target_vendor_id: vendorId,
    target_media_ids: mediaIds,
  });
  if (error) throw error;
}

export async function updateMediaFocalPoint(
  mediaId: string,
  x: number,
  y: number,
) {
  const { error } = await supabase
    .from("vendor_portfolio_media")
    .update({
      focal_point_x: Math.max(0, Math.min(1, x)),
      focal_point_y: Math.max(0, Math.min(1, y)),
    })
    .eq("id", mediaId);
  if (error) throw error;
}

export function portfolioAssetFingerprint(asset: {
  fileName?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}) {
  return [
    asset.fileName?.trim().toLowerCase() || "unnamed",
    asset.fileSize ?? 0,
    asset.width ?? 0,
    asset.height ?? 0,
    asset.duration ?? 0,
  ].join(":");
}
