import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { supabase } from "@/services/supabase";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
export { normalizeWhatsAppPhone } from "@/services/contactActions";

export const ENQUIRY_STATUSES = [
  "new", "contacted", "in_discussion", "quotation_sent", "follow_up",
  "booked", "not_interested", "invalid_lead", "no_response", "closed",
] as const;
export type EnquiryStatus = typeof ENQUIRY_STATUSES[number];
export type EnquiryChannel = "call" | "whatsapp" | "form";
export type EnquirySource = "vendor_profile" | "clip" | "portfolio" | "favorite" | "search" | "listing" | "package" | "other";
export type CustomerConfirmation = "pending" | "contacted" | "cancelled" | "closed";

export type TrackedEnquiry = {
  id: string;
  vendor_id: string;
  customer_id: string | null;
  guest_session_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  event_date: string | null;
  event_type: string | null;
  message: string;
  status: EnquiryStatus;
  reference_code: string;
  enquiry_channel: EnquiryChannel;
  source_type: EnquirySource;
  source_record_id: string | null;
  customer_confirmation: CustomerConfirmation;
  vendor_notes: string | null;
  follow_up_date: string | null;
  booking_confirmed: boolean;
  package_id: string | null;
  package_name: string | null;
  created_at: string;
  updated_at: string;
  vendor_name?: string;
  vendor_phone?: string | null;
  vendor_logo?: string | null;
};

export type TrackContactInput = {
  vendorId: string;
  vendorName: string;
  contactPhone?: string | null;
  channel: "call" | "whatsapp";
  source: EnquirySource;
  sourceRecordId?: string | null;
  packageId?: string | null;
  packageName?: string | null;
};

export type CreateFormEnquiryInput = {
  vendorId: string;
  source?: EnquirySource;
  sourceRecordId?: string | null;
  packageId?: string | null;
  eventDate?: string | null;
  eventType?: string | null;
  message: string;
  customerPhone?: string | null;
};

export type VendorEnquiryAnalytics = {
  total: number;
  callClicks: number;
  whatsappClicks: number;
  newLeads: number;
  contactedLeads: number;
  bookedLeads: number;
  conversionRate: number;
  topSource: EnquirySource | null;
  monthOverMonth: number | null;
};

const GUEST_SESSION_KEY = "royallagn.enquiry.guest-session.v1";
const inFlight = new Map<string, Promise<{ id: string; referenceCode: string; status: EnquiryStatus }>>();

export class EnquiryExternalOpenError extends Error {
  referenceCode: string;
  constructor(message: string, referenceCode: string) {
    super(message);
    this.name = "EnquiryExternalOpenError";
    this.referenceCode = referenceCode;
  }
}

function uuid() {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string; getRandomValues?: (array: Uint8Array) => Uint8Array } | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getGuestSessionId() {
  const existing = await AsyncStorage.getItem(GUEST_SESSION_KEY);
  if (existing) return existing;
  const created = uuid();
  await AsyncStorage.setItem(GUEST_SESSION_KEY, created);
  return created;
}

function phoneDigits(phone?: string | null) {
  return phone?.replace(/\D/g, "") ?? "";
}

function mapEnquiry(row: any): TrackedEnquiry {
  const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
  return {
    ...row,
    vendor_name: vendor?.business_name || "Vendor",
    vendor_phone: vendor?.contact_phone ?? null,
    vendor_logo: vendor?.logo_url ?? null,
  } as TrackedEnquiry;
}

async function create(input: {
  vendorId: string;
  channel: EnquiryChannel;
  source: EnquirySource;
  sourceRecordId?: string | null;
  packageId?: string | null;
  eventDate?: string | null;
  eventType?: string | null;
  message?: string | null;
  customerPhone?: string | null;
}) {
  const guestId = await getGuestSessionId();
  const key = [input.vendorId, input.channel, input.source, input.sourceRecordId ?? ""].join(":");
  const current = inFlight.get(key);
  if (current) return current;
  const promise = (async () => {
    const actionToken = uuid();
    const { data, error } = await supabase.rpc("create_tracked_enquiry", {
      target_vendor_id: input.vendorId,
      channel: input.channel,
      source: input.source,
      source_id: input.sourceRecordId ?? null,
      guest_id: guestId,
      request_token: actionToken,
      selected_package_id: input.packageId ?? null,
      event_on: input.eventDate ?? null,
      event_kind: input.eventType?.trim() || null,
      enquiry_message: input.message?.trim() || null,
      customer_phone_input: input.customerPhone?.trim() || null,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.id || !result?.reference_code) throw new Error("The enquiry could not be saved.");
    // Push delivery is best-effort and must never roll back or hide a saved
    // enquiry. The server verifies this unguessable action token and actor.
    await supabase.functions.invoke("send-enquiry-push", {
      body: { enquiryId: result.id, actionToken, guestId },
    }).catch(() => null);
    return { id: String(result.id), referenceCode: String(result.reference_code), status: result.status as EnquiryStatus };
  })();
  inFlight.set(key, promise);
  try { return await promise; }
  finally { setTimeout(() => inFlight.delete(key), 1200); }
}

async function openExternal(url: string) {
  if (Platform.OS !== "web") {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error("This app cannot be opened on your device.");
  }
  await Linking.openURL(url);
}

export const EnquiryService = {
  getGuestSessionId,
  clearGuestSession: () => {
    inFlight.clear();
    return AsyncStorage.removeItem(GUEST_SESSION_KEY);
  },

  async trackContactAndOpen(input: TrackContactInput) {
    const digits = input.channel === "whatsapp" ? normalizeWhatsAppPhone(input.contactPhone) : phoneDigits(input.contactPhone);
    if (!digits) throw new Error(input.channel === "call" ? "This vendor has not added a phone number." : "This vendor has not added a WhatsApp number.");
    const tracked = await create({
      vendorId: input.vendorId,
      channel: input.channel,
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      packageId: input.packageId,
    });
    const url = input.channel === "call"
      ? `tel:${input.contactPhone!.replace(/[^\d+]/g, "")}`
      : `https://wa.me/${digits}?text=${encodeURIComponent(
        `Hi, I found ${input.vendorName} on RoyalLagn and would like to know more about your services.${input.packageName ? ` I am interested in the ${input.packageName} package.` : ""} Enquiry ID: ${tracked.referenceCode}.`,
      )}`;
    try { await openExternal(url); }
    catch (cause) {
      throw new EnquiryExternalOpenError(cause instanceof Error ? cause.message : "The contact app could not be opened.", tracked.referenceCode);
    }
    return tracked;
  },

  async createFormEnquiry(input: CreateFormEnquiryInput) {
    if (input.message.trim().length < 10) throw new Error("Please add a short message of at least 10 characters.");
    return create({
      vendorId: input.vendorId,
      channel: "form",
      source: input.source ?? (input.packageId ? "package" : "vendor_profile"),
      sourceRecordId: input.sourceRecordId,
      packageId: input.packageId,
      eventDate: input.eventDate,
      eventType: input.eventType,
      message: input.message,
      customerPhone: input.customerPhone,
    });
  },

  async claimGuestEnquiries() {
    const guestId = await getGuestSessionId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data, error } = await supabase.rpc("claim_guest_enquiries", { guest_id: guestId });
    if (error) throw error;
    return Number(data ?? 0);
  },

  async listCustomer(): Promise<TrackedEnquiry[]> {
    await this.claimGuestEnquiries();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase.rpc("list_my_enquiries");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...row, vendor_notes: null, guest_session_id: null } as TrackedEnquiry));
  },

  async listVendor(vendorId: string): Promise<TrackedEnquiry[]> {
    const { data, error } = await supabase.from("vendor_enquiries").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapEnquiry);
  },

  async updateCustomerConfirmation(enquiryId: string, confirmation: Exclude<CustomerConfirmation, "pending">) {
    const { error } = await supabase.rpc("update_customer_enquiry_confirmation", { target_enquiry_id: enquiryId, next_confirmation: confirmation });
    if (error) throw error;
  },

  async updateVendor(enquiryId: string, status: EnquiryStatus, notes?: string | null, followUpDate?: string | null) {
    const { error } = await supabase.rpc("update_vendor_enquiry", {
      target_enquiry_id: enquiryId,
      next_status: status,
      notes: notes?.trim() || null,
      follow_up_on: followUpDate || null,
    });
    if (error) throw error;
  },

  calculateAnalytics(items: TrackedEnquiry[], now = new Date()): VendorEnquiryAnalytics {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const current = items.filter((item) => new Date(item.created_at) >= monthStart);
    const previous = items.filter((item) => { const date = new Date(item.created_at); return date >= previousStart && date < monthStart; });
    const sourceCounts = items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.source_type]: (counts[item.source_type] ?? 0) + 1 }), {});
    const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as EnquirySource | undefined;
    const booked = items.filter((item) => item.status === "booked").length;
    return {
      total: items.length,
      callClicks: items.filter((item) => item.enquiry_channel === "call").length,
      whatsappClicks: items.filter((item) => item.enquiry_channel === "whatsapp").length,
      newLeads: items.filter((item) => item.status === "new").length,
      contactedLeads: items.filter((item) => item.status === "contacted").length,
      bookedLeads: booked,
      conversionRate: items.length ? Math.round((booked / items.length) * 1000) / 10 : 0,
      topSource: topSource ?? null,
      monthOverMonth: previous.length ? Math.round(((current.length - previous.length) / previous.length) * 1000) / 10 : current.length ? 100 : null,
    };
  },
};

export function enquiryStatusLabel(status: EnquiryStatus) {
  return ({ new: "New", contacted: "Contacted", in_discussion: "In discussion", quotation_sent: "Quotation sent", follow_up: "Follow-up", booked: "Booked", not_interested: "Not interested", invalid_lead: "Invalid lead", no_response: "No response", closed: "Closed" } as Record<EnquiryStatus, string>)[status];
}

export function enquirySourceLabel(source: EnquirySource) {
  return ({ vendor_profile: "Vendor profile", clip: "Clip", portfolio: "Portfolio", favorite: "Favourite", search: "Search", listing: "Vendor listing", package: "Package", other: "RoyalLagn" } as Record<EnquirySource, string>)[source];
}
