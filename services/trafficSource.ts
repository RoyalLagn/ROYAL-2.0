import { Platform } from "react-native";

const REFERRER_PATTERNS: [RegExp, string][] = [
  [/wa\.me|whatsapp/i, "whatsapp"],
  [/instagram\.com/i, "instagram"],
  [/facebook\.com|fb\.com/i, "facebook"],
  [/google\./i, "google"],
];

export function resolveTrafficSource(explicitSource?: string | null): string {
  if (explicitSource?.trim()) return explicitSource.trim().toLowerCase();

  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const src = params.get("src");
      if (src?.trim()) return src.trim().toLowerCase();
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
