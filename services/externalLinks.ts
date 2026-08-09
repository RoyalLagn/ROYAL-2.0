import { Linking, Platform } from "react-native";
import {
  normalizeEmailAddress,
  normalizeGoogleMapsUrl,
  normalizeInstagramUrl,
  normalizePhoneNumber,
  normalizeWebsiteUrl,
} from "@/services/externalLinkNormalization";

export {
  normalizeEmailAddress,
  normalizeGoogleMapsUrl,
  normalizeInstagramUrl,
  normalizePhoneNumber,
  normalizeWebsiteUrl,
} from "@/services/externalLinkNormalization";

function trimmed(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export async function openExternalUrl(value: string | null | undefined) {
  const url = trimmed(value);
  if (!url) return false;
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (/^https?:\/\//i.test(url)) {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened) opened.opener = null;
        // Browsers may intentionally return null when `noopener` is used even
        // though the new tab opened successfully.
        return true;
      }
      if (/^(?:mailto|tel):/i.test(url)) {
        window.location.assign(url);
        return true;
      }
      return false;
    }
    if (!(await Linking.canOpenURL(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function openWebsite(value: string | null | undefined) {
  return openExternalUrl(normalizeWebsiteUrl(value));
}

export async function openInstagram(value: string | null | undefined) {
  const webUrl = normalizeInstagramUrl(value);
  if (!webUrl) return false;
  if (Platform.OS !== "web") {
    const username = new URL(webUrl).pathname.split("/").filter(Boolean)[0];
    const deepLink = `instagram://user?username=${encodeURIComponent(username)}`;
    try {
      if (await Linking.canOpenURL(deepLink)) {
        await Linking.openURL(deepLink);
        return true;
      }
    } catch {
      // The universal HTTPS link below is the browser fallback.
    }
  }
  return openExternalUrl(webUrl);
}

export function openGoogleMaps(input: Parameters<typeof normalizeGoogleMapsUrl>[0]) {
  return openExternalUrl(normalizeGoogleMapsUrl(input));
}

export function openPhone(value: string | null | undefined) {
  const phone = normalizePhoneNumber(value);
  return openExternalUrl(phone ? `tel:${phone}` : null);
}

export function openWhatsApp(value: string | null | undefined) {
  const phone = normalizePhoneNumber(value);
  return openExternalUrl(phone ? `https://wa.me/${phone.slice(1)}` : null);
}

export function openEmail(value: string | null | undefined) {
  const email = normalizeEmailAddress(value);
  return openExternalUrl(email ? `mailto:${email}` : null);
}
