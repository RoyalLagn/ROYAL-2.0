/** Delivery helpers for Bunny-backed media. Bunny URLs are already final CDN
 * or adaptive-stream URLs, so callers must not inject provider transforms. */
export type MediaDeliveryOptions = {
  width?: number;
  height?: number;
  crop?: "fill" | "limit" | "fit";
  dpr?: number;
  quality?: "auto" | "auto:eco" | "auto:good";
};
export function mediaDeliveryUrl(
  url: string,
  _options: MediaDeliveryOptions = {},
): string {
  return url.trim();
}

export type MediaVideoDeliveryOptions = {
  width?: number;
  height?: number;
  crop?: "limit" | "fill" | "fit";
  quality?: "auto" | "auto:eco" | "auto:good";
};
export function mediaVideoDeliveryUrl(
  url: string,
  _options: MediaVideoDeliveryOptions = {},
): string {
  return url.trim();
}
