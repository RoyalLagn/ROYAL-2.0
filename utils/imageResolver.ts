import type { ImageSourcePropType } from "react-native";

export type SafeImageCandidate = ImageSourcePropType | string | null | undefined;

const PLACEHOLDER_IMAGE_HOSTS = new Set([
  "example.com",
  "www.example.com",
  "example.org",
  "www.example.org",
  "example.net",
  "www.example.net",
]);

function isHttpUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** Remote URIs we can actually render. Placeholder hosts such as example.com 404 and only raise a dev warning. */
export function loadableRemoteImageUri(uri: string): string | null {
  const trimmed = uri.trim();
  if (!isHttpUri(trimmed)) return null;
  try {
    const host = new URL(trimmed).hostname.replace(/\.$/, "").toLowerCase();
    if (PLACEHOLDER_IMAGE_HOSTS.has(host)) return null;
  } catch {
    return null;
  }
  return trimmed;
}

function uriFromCandidate(candidate: SafeImageCandidate): string | null {
  if (typeof candidate === "string") return candidate.trim() || null;
  if (
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && "uri" in candidate
    && typeof (candidate as { uri?: unknown }).uri === "string"
  ) {
    return (candidate as { uri: string }).uri.trim() || null;
  }
  return null;
}

export function remoteImageUri(candidate: SafeImageCandidate): string | null {
  const uri = uriFromCandidate(candidate);
  return uri ? loadableRemoteImageUri(uri) : null;
}

function resolveUriSource(
  primary: SafeImageCandidate,
  uri: string,
  fallback: ImageSourcePropType,
): ImageSourcePropType {
  if (isHttpUri(uri) && !loadableRemoteImageUri(uri)) return fallback;
  if (typeof primary === "object" && primary && !Array.isArray(primary)) {
    return { ...primary, uri };
  }
  return { uri };
}

export function resolveImageSource(
  primary: SafeImageCandidate,
  fallback: ImageSourcePropType,
): ImageSourcePropType {
  const uri = uriFromCandidate(primary);
  if (uri) return resolveUriSource(primary, uri, fallback);
  if (typeof primary === "string" || (primary && typeof primary === "object" && !Array.isArray(primary) && "uri" in primary)) {
    return fallback;
  }
  return primary ?? fallback;
}

export function retryImageUri(uri: string, attempt: number): string {
  if (!attempt) return uri;
  const separator = uri.includes("?") ? "&" : "?";
  return `${uri}${separator}royallagn_retry=${attempt}`;
}
