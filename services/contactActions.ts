export function normalizeWhatsAppPhone(phone?: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return digits;
}

/**
 * Canonical public web origin for vendor profile links.
 *
 * Shared links, QR codes and marketing-card PDFs are opened by people who may
 * not have the app installed, so they must always be https URLs. The
 * production host is the last-resort fallback rather than a deep link or the
 * current dev origin.
 */
export function vendorWebBase() {
  const configured =
    process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || process.env.EXPO_PUBLIC_APP_URL?.trim() || "";
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, "");
  return "https://royallagn.com";
}

export function buildVendorProfilePath(vendorId: string, category?: string | null) {
  const entries = [`vendorId=${encodeURIComponent(vendorId)}`];
  if (category?.trim()) entries.push(`category=${encodeURIComponent(category.trim())}`);
  return `/VendorsProfile?${entries.join("&")}`;
}

export function buildVendorProfilePathBySlug(slug: string) {
  return buildSeoVendorProfilePathBySlug(slug);
}
import { buildVendorProfilePathBySlug as buildSeoVendorProfilePathBySlug } from "@/services/publicSeoRoutes";
