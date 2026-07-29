import type { ImageSourcePropType } from "react-native";

export type SafeImageCandidate = ImageSourcePropType | string | null | undefined;

export function remoteImageUri(candidate: SafeImageCandidate): string | null {
  if (typeof candidate !== "string") return null;
  const uri = candidate.trim();
  return /^https?:\/\//i.test(uri) ? uri : null;
}

export function resolveImageSource(
  primary: SafeImageCandidate,
  fallback: ImageSourcePropType,
): ImageSourcePropType {
  if (typeof primary === "string") {
    const uri = primary.trim();
    return uri ? { uri } : fallback;
  }
  return primary ?? fallback;
}

export function retryImageUri(uri: string, attempt: number): string {
  if (!attempt) return uri;
  const separator = uri.includes("?") ? "&" : "?";
  return `${uri}${separator}royallagn_retry=${attempt}`;
}
