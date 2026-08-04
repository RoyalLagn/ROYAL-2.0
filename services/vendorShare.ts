import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import { buildVendorProfilePath, buildVendorProfilePathBySlug } from "@/services/contactActions";

export type VendorShareInput = {
  vendorId: string;
  vendorName: string;
  category?: string | null;
  location?: string | null;
  slug?: string | null;
};

export type VendorShareResult = "shared" | "copied" | "dismissed";
let activeShare: Promise<VendorShareResult> | null = null;

function configuredWebBase() {
  const value = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || process.env.EXPO_PUBLIC_APP_URL?.trim() || "";
  return /^https?:\/\//i.test(value) ? value.replace(/\/$/, "") : "";
}

export function buildVendorProfileUrl(input: Pick<VendorShareInput, "vendorId" | "category" | "slug">) {
  const path = input.slug?.trim()
    ? buildVendorProfilePathBySlug(input.slug.trim())
    : buildVendorProfilePath(input.vendorId, input.category);
  const configured = configuredWebBase();
  if (configured) return `${configured}${path}`;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${path}`;
  if (input.slug?.trim()) return Linking.createURL(`/vendors/${input.slug.trim()}`);
  return Linking.createURL("/VendorsProfile", { queryParams: { vendorId: input.vendorId, ...(input.category?.trim() ? { category: input.category.trim() } : {}) } });
}

function shareCopy(input: VendorShareInput, url: string) {
  const details = [input.category?.trim(), input.location?.trim()].filter(Boolean).join(" · ");
  return [`Discover ${input.vendorName} on RoyalLagn.`, details, url].filter(Boolean).join("\n");
}

async function copyOnWeb(value: string) {
  const browserNavigator = globalThis.navigator as Navigator & { clipboard?: { writeText: (text: string) => Promise<void> } };
  if (browserNavigator?.clipboard?.writeText) {
    await browserNavigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") throw new Error("Sharing is not supported in this browser.");
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(field);
  if (!copied) throw new Error("The profile link could not be copied.");
}

async function performVendorShare(input: VendorShareInput): Promise<VendorShareResult> {
  const url = buildVendorProfileUrl(input);
  const text = shareCopy(input, url);
  if (Platform.OS === "web") {
    const browserNavigator = globalThis.navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
    if (browserNavigator?.share) {
      try {
        await browserNavigator.share({ title: `${input.vendorName} · RoyalLagn`, text: shareCopy(input, ""), url });
        return "shared";
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return "dismissed";
        // Some desktop browsers expose Web Share but reject URLs or files at
        // runtime. A copied link remains useful and works in every browser.
      }
    }
    await copyOnWeb(text);
    return "copied";
  }
  const result = await Share.share({
    title: `${input.vendorName} · RoyalLagn`,
    message: text,
    url,
  });
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}

export function shareVendorProfile(input: VendorShareInput): Promise<VendorShareResult> {
  if (activeShare) return activeShare;
  activeShare = performVendorShare(input);
  activeShare.finally(() => { activeShare = null; }).catch(() => {
    // The caller owns the user-facing error state; this prevents an unhandled
    // rejection on the cleanup-only promise returned by finally().
  });
  return activeShare;
}
