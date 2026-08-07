import type { ImageSourcePropType } from "react-native";

export type SafeImageCandidate = ImageSourcePropType | string | null | undefined;

export function remoteImageUri(candidate: SafeImageCandidate): string | null {
  if (typeof candidate === "string") {
    const uri = candidate.trim();
    return /^https?:\/\//i.test(uri) ? uri : null;
  }
  if (
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && "uri" in candidate
    && typeof (candidate as { uri?: unknown }).uri === "string"
  ) {
    const uri = ((candidate as { uri: string }).uri || "").trim();
    return /^https?:\/\//i.test(uri) ? uri : null;
  }
  return null;
}

export function resolveImageSource(
  primary: SafeImageCandidate,
  fallback: ImageSourcePropType,
): ImageSourcePropType {
  if (typeof primary === "string") {
    const uri = primary.trim();
    return uri ? { uri } : fallback;
  }
  // A caller passing the object form (`{ uri: vendor.image }`) with an
  // empty/blank uri must fall back the same way a bare empty string does --
  // otherwise `{ uri: "" }` reaches RN's Image untouched and native logs
  // "source.uri should not be an empty string" instead of showing fallback.
  if (
    primary
    && typeof primary === "object"
    && !Array.isArray(primary)
    && "uri" in primary
    && typeof (primary as { uri?: unknown }).uri === "string"
  ) {
    const uri = (primary as { uri: string }).uri.trim();
    return uri ? { ...primary, uri } : fallback;
  }
  return primary ?? fallback;
}

export function retryImageUri(uri: string, attempt: number): string {
  if (!attempt) return uri;
  const separator = uri.includes("?") ? "&" : "?";
  return `${uri}${separator}royallagn_retry=${attempt}`;
}
