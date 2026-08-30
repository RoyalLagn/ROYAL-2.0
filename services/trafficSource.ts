import { Platform } from "react-native";

export const VENDOR_TRAFFIC_SOURCES = [
  "direct",
  "qr",
  "search",
  "share",
  "clip",
  "portfolio",
  "package",
  "favorites",
  "nearby",
  "listing",
  "google",
  "instagram",
  "facebook",
  "whatsapp",
  "referral",
] as const;

export type VendorTrafficSource = typeof VENDOR_TRAFFIC_SOURCES[number];
export type VendorTrafficSourceInput = VendorTrafficSource | "vendor_preview" | "admin_preview";

const SOURCE_SET = new Set<string>(VENDOR_TRAFFIC_SOURCES);
const PREVIEW_SOURCES = new Set<string>(["vendor_preview", "admin_preview"]);

const REFERRER_PATTERNS: [RegExp, VendorTrafficSource][] = [
  [/wa\.me|whatsapp/i, "whatsapp"],
  [/instagram\.com/i, "instagram"],
  [/facebook\.com|fb\.com/i, "facebook"],
  [/google\./i, "google"],
];

export function normalizeTrafficSource(value?: string | null): VendorTrafficSourceInput | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (SOURCE_SET.has(normalized) || PREVIEW_SOURCES.has(normalized)) {
    return normalized as VendorTrafficSourceInput;
  }
  return "referral";
}

export function isPreviewTrafficSource(source: VendorTrafficSourceInput) {
  return PREVIEW_SOURCES.has(source);
}

export function resolveTrafficSource(explicitSource?: string | null): VendorTrafficSourceInput {
  const explicit = normalizeTrafficSource(explicitSource);
  if (explicit) return explicit;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const src = params.get("src");
      const querySource = normalizeTrafficSource(src);
      if (querySource) return querySource;
    } catch {
      // Ignore malformed query strings — fall through to referrer/direct.
    }

    const referrer = typeof document !== "undefined" ? document.referrer : "";
    if (referrer) {
      const match = REFERRER_PATTERNS.find(([pattern]) => pattern.test(referrer));
      if (match) return match[1];
      return "referral";
    }
  }

  return "direct";
}

export function addTrafficSourceToUrl(url: string, source: VendorTrafficSourceInput) {
  if (!url) return url;
  const [withoutHash, hash = ""] = url.split("#", 2);
  const [path, query = ""] = withoutHash.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("src", source);
  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
}
