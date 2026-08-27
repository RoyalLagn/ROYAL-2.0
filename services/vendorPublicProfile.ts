import { supabase } from "@/services/supabase";
import { EnquiryService } from "@/services/enquiries";
import { vendorWebBase } from "@/services/contactActions";
import { buildVendorProfilePathBySlug } from "@/services/publicSeoRoutes";
import {
  getApprovedPublicVendorBySlug,
  type PublicVendorListing,
} from "@/services/publicVendorListings";

export type VendorPublicProfileLookup =
  | { kind: "found"; vendor: PublicVendorListing }
  | { kind: "redirect"; slug: string }
  | { kind: "not_found" };

function isPubliclyVisible(vendor: PublicVendorListing): boolean {
  return vendor.managementStatus === "active" && vendor.publicProfileEnabled !== false;
}

export async function getVendorPublicProfileBySlug(slug: string): Promise<VendorPublicProfileLookup> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return { kind: "not_found" };

  const vendor = await getApprovedPublicVendorBySlug(normalized);
  if (vendor) {
    if (!isPubliclyVisible(vendor)) return { kind: "not_found" };
    return { kind: "found", vendor };
  }

  const { data: redirect, error: redirectError } = await supabase
    .from("vendor_slug_history")
    .select("vendor_id")
    .eq("old_slug", normalized)
    .maybeSingle();
  if (redirectError) throw redirectError;
  if (!redirect) return { kind: "not_found" };

  const { data: currentVendor, error: currentVendorError } = await supabase
    .from("vendors")
    .select("slug")
    .eq("id", redirect.vendor_id)
    .maybeSingle();
  if (currentVendorError) throw currentVendorError;
  if (!currentVendor?.slug) return { kind: "not_found" };

  return { kind: "redirect", slug: currentVendor.slug };
}

export function buildVendorPublicProfileUrl(slug: string, source?: string) {
  const url = `${vendorWebBase()}${buildVendorProfilePathBySlug(slug)}`;
  return source ? `${url}?src=${encodeURIComponent(source)}` : url;
}

export type VendorQrRecord = {
  vendorId: string;
  qrUrl: string;
  version: number;
  generatedAt: string;
};

export async function getVendorQrRecord(vendorId: string): Promise<VendorQrRecord | null> {
  const { data, error } = await supabase
    .from("vendor_qr_codes")
    .select("vendor_id,qr_url,version,generated_at")
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { vendorId: data.vendor_id, qrUrl: data.qr_url, version: data.version, generatedAt: data.generated_at };
}

export async function regenerateVendorSlug(vendorId: string) {
  const { data, error } = await supabase.rpc("admin_regenerate_vendor_slug", { target_vendor_id: vendorId });
  if (error) throw error;
  return data;
}

export async function setVendorPublicProfileEnabled(vendorId: string, enabled: boolean) {
  const { data, error } = await supabase.rpc("admin_set_vendor_public_profile", {
    target_vendor_id: vendorId,
    enabled,
  });
  if (error) throw error;
  return data;
}

export type VendorProfileEventType =
  | "view"
  | "qr_scan"
  | "link_share"
  | "copy_link"
  | "call_click"
  | "whatsapp_click"
  | "website_click"
  | "instagram_click"
  | "enquiry";

export async function recordVendorProfileEvent(
  vendorId: string,
  eventType: VendorProfileEventType,
  source?: string | null,
) {
  const guestId = await EnquiryService.getGuestSessionId().catch(() => null);
  const { error } = await supabase.rpc("record_vendor_profile_event", {
    target_vendor_id: vendorId,
    event_type: eventType,
    source: source ?? null,
    guest_id: guestId,
  });
  if (error) throw error;
}

export type VendorProfileEventStats = {
  count: number;
  uniqueVisitors: number;
  bySource: Record<string, number>;
};

export type VendorProfileAnalytics = Partial<Record<VendorProfileEventType, VendorProfileEventStats>>;

export async function getVendorProfileAnalytics(vendorId: string): Promise<VendorProfileAnalytics> {
  const { data, error } = await supabase.rpc("get_vendor_profile_analytics", { target_vendor_id: vendorId });
  if (error) throw error;
  const result: VendorProfileAnalytics = {};
  for (const row of data ?? []) {
    const eventType = row.event_type as VendorProfileEventType;
    const existing = result[eventType] ?? { count: 0, uniqueVisitors: 0, bySource: {} };
    existing.count += Number(row.event_count ?? 0);
    existing.uniqueVisitors += Number(row.unique_visitors ?? 0);
    existing.bySource[row.source ?? "unknown"] = Number(row.event_count ?? 0);
    result[eventType] = existing;
  }
  return result;
}
