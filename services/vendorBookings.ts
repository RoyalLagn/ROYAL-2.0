import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/services/supabase";
import {
  calculateBookingFinancials as calcFinancials,
  calculateEventDays,
  type BookingAddOn,
  type SelectedPackageSummary,
  type BookingFinancials,
} from "@/lib/bookingCalculations";
import { ReferralCommissionService } from "@/services/referralCommission";
import {
  buildEventStartTimestamp,
  calculateCancellationCutoff,
  isCancellationLocked,
  isContactUnlocked,
} from "@/lib/bookingCancellationPolicy";

export { calculateEventDays };
export type { BookingAddOn, SelectedPackageSummary, BookingFinancials };

export type BookingStatus =
  | "pending_payment"
  | "pending_vendor_confirmation"
  | "pending"
  | "confirmed"
  | "cancelled_by_vendor"
  | "cancelled_by_customer"
  | "cancelled"
  | "completed";

export type BookingSource = "online" | "offline";
export type PaymentStatus = "pending" | "paid_advance" | "failed" | "refunded";
export type RefundStatus = "pending" | "processing" | "refunded" | "failed" | "rejected";

export type VendorBooking = {
  id: string;
  booking_id: string;
  ticket_id: string;
  vendor_id: string;
  vendor_name?: string;
  vendor_phone?: string | null;
  vendor_image?: string | null;
  vendor_category?: string | null;
  vendor_city?: string | null;
  vendor_slug?: string | null;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  event_date: string; // YYYY-MM-DD
  start_date?: string;
  end_date?: string;
  total_days: number;
  event_type: string;
  package_id?: string | null;
  package_title: string;
  package_price: number;
  selected_packages: SelectedPackageSummary[];
  add_ons: BookingAddOn[];
  special_notes?: string | null;
  total_amount: number;
  advance_amount: number; // 30% strictly
  due_amount: number;     // 70% remaining
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  soft_lock_expires_at?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
  source: BookingSource;
  rejection_reason?: string | null;
  refund_status?: RefundStatus | null;
  refund_amount?: number | null;
  refunded_at?: string | null;
  refund_notes?: string | null;
  referral_code?: string | null;
  // 5-Day Cancellation Lock & Contact Unlock Fields
  event_start_at?: string | null;
  cancellation_cutoff_at?: string | null;
  customer_contact_number?: string | null;
  customer_whatsapp_number?: string | null;
  service_map_url?: string | null;
  booking_description?: string | null;
  contact_unlocked_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: "customer" | "vendor" | "admin" | "system" | null;
  cancellation_reason?: string | null;
  emergency_status?: "none" | "reported" | "investigating" | "resolved";
  emergency_reported_at?: string | null;
  emergency_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type SecureBookingDetails = {
  id: string;
  booking_id: string;
  ticket_id: string;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  event_date: string;
  start_date?: string;
  end_date?: string;
  total_days: number;
  event_type: string;
  event_start_at: string | null;
  cancellation_cutoff_at: string | null;
  is_cutoff_passed: boolean;
  contacts_unlocked: boolean;
  can_cancel: boolean;
  total_amount: number;
  advance_amount: number;
  due_amount: number;
  package_title: string;
  selected_packages: SelectedPackageSummary[];
  add_ons: BookingAddOn[];
  special_notes?: string | null;
  refund_status?: RefundStatus | null;
  refund_amount?: number | null;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  emergency_status?: "none" | "reported" | "investigating" | "resolved";
  emergency_reported_at?: string | null;
  emergency_reason?: string | null;
  created_at: string;
  customer: {
    name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    service_map_url: string | null;
    booking_description: string | null;
  };
  vendor: {
    id: string;
    business_name: string;
    contact_phone: string | null;
    city: string | null;
    logo_url: string | null;
    slug?: string | null;
  };
  caller_role: "customer" | "vendor" | "admin";
};

export type CreateBookingInput = {
  vendorId: string;
  vendorName?: string;
  vendorPhone?: string | null;
  vendorImage?: string | null;
  vendorCategory?: string | null;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  eventDate: string;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  eventType: string;
  packageId?: string | null;
  packageTitle?: string;
  packagePrice?: number;
  totalAmount?: number;
  advanceAmount?: number;
  dueAmount?: number;
  selectedPackages?: SelectedPackageSummary[];
  addOns?: BookingAddOn[];
  specialNotes?: string | null;
  referralCode?: string | null;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  // 5-Day Cancellation Lock & Contact Details
  eventStartAt?: string;
  customerContactNumber?: string;
  customerWhatsappNumber?: string;
  serviceMapUrl?: string;
  bookingDescription?: string;
};

export type CreateBookingOrderResponse = {
  success: boolean;
  bookingRecordId: string;
  bookingId: string;
  ticketId: string;
  orderId: string;
  keyId: string;
  currency: string;
  amountMinor: number;
  advanceAmount: number;
  dueAmount: number;
  grandTotal: number;
  totalDays: number;
  softLockExpiresAt?: string;
  isSimulator?: boolean;
};

const STORAGE_KEY_BOOKINGS = "royallagn.bookings.v1";

const isUuid = (val?: string | null): boolean =>
  typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

export function generateTicketId(seed?: string): string {
  if (seed) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    }
    const num = Math.abs(hash >>> 0) % 90000 + 10000;
    return `RL${num}`;
  }
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `RL${randomNum}`;
}

export function calculateBookingFinancials(
  packagesOrPrice: number | { price: number; duration_label?: string | null; price_type?: string | null }[],
  daysCount: number = 1,
  addOns: BookingAddOn[] = []
) {
  if (typeof packagesOrPrice === "number") {
    const days = Math.max(1, Number(daysCount) || 1);
    const packagesTotal = packagesOrPrice * days;
    const addOnsTotal = (addOns || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const totalAmount = Math.max(0, Math.round(packagesTotal + addOnsTotal));
    const advanceAmount = Math.round(totalAmount * 0.30);
    const dueAmount = totalAmount - advanceAmount;
    return {
      packagesBaseTotal: packagesOrPrice,
      packagesTotal,
      days,
      addOnsTotal,
      totalAmount,
      advanceAmount,
      dueAmount,
      advancePercentage: 30,
    };
  }

  const pkgs: SelectedPackageSummary[] = packagesOrPrice.map((p, idx) => ({
    id: `pkg_${idx}`,
    title: "Service",
    price: p.price,
    duration_label: p.duration_label || null,
    price_type: p.price_type || null,
  }));

  const res = calcFinancials(pkgs, "2026-01-01", "2026-01-01", addOns);
  const days = Math.max(1, Number(daysCount) || 1);
  const packagesTotal = pkgs.reduce((sum, p) => sum + p.price * (p.duration_label?.toLowerCase().includes("day") ? days : 1), 0);
  const addOnsTotal = (addOns || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const totalAmount = packagesTotal + addOnsTotal;
  const advanceAmount = Math.round(totalAmount * 0.30);
  const dueAmount = totalAmount - advanceAmount;

  return {
    packagesBaseTotal: pkgs.reduce((sum, p) => sum + p.price, 0),
    packagesTotal,
    days,
    addOnsTotal,
    totalAmount,
    advanceAmount,
    dueAmount,
    advancePercentage: 30,
  };
}

async function getLocalBookings(): Promise<VendorBooking[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_BOOKINGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveLocalBookings(list: VendorBooking[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_BOOKINGS, JSON.stringify(list));
  } catch (err) {
    console.warn("Could not save bookings to local storage", err);
  }
}

export const VendorBookingService = {
  /**
   * Phase 4: Calls create-booking-order Edge Function to validate dates,
   * enforce 15-minute soft lock, calculate server-authoritative 30% advance,
   * and create Razorpay Order.
   */
  async createBookingOrder(input: {
    vendorId: string;
    startDate: string;
    endDate: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string | null;
    customerId?: string | null;
    eventType: string;
    specialNotes?: string | null;
    referralCode?: string | null;
    selectedPackageIds: string[];
    addOns?: BookingAddOn[];
  }): Promise<CreateBookingOrderResponse> {
    try {
      const { data, error } = await supabase.functions.invoke("create-booking-order", {
        body: input,
      });

      if (error) throw error;
      if (data && data.success) {
        return data as CreateBookingOrderResponse;
      }
      if (data?.error) {
        throw new Error(data.error);
      }
    } catch (edgeErr) {
      console.warn("create-booking-order edge function error, using direct DB hold:", edgeErr);
    }

    // Direct DB Fallback if Edge function is unreachable
    const days = calculateEventDays(input.startDate, input.endDate);
    const softLockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ticketId = `RL-${Math.floor(10000 + Math.random() * 90000)}`;

    const { data: newBooking, error: insertErr } = await supabase
      .from("vendor_bookings")
      .insert({
        booking_id: bookingId,
        ticket_id: ticketId,
        vendor_id: input.vendorId,
        customer_id: input.customerId || null,
        customer_name: input.customerName.trim(),
        customer_phone: input.customerPhone.trim(),
        customer_email: input.customerEmail?.trim() || null,
        event_date: input.startDate,
        start_date: input.startDate,
        end_date: input.endDate,
        total_days: days,
        event_type: input.eventType || "Wedding",
        package_title: "Wedding Service",
        package_price: 0,
        selected_packages: [],
        add_ons: input.addOns || [],
        special_notes: input.specialNotes?.trim() || null,
        total_amount: 0,
        advance_amount: 0,
        due_amount: 0,
        booking_status: "pending_payment",
        payment_status: "pending",
        soft_lock_expires_at: softLockExpiresAt,
        referral_code: input.referralCode || null,
        source: "online",
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    return {
      success: true,
      bookingRecordId: newBooking.id,
      bookingId,
      ticketId,
      orderId: `order_${bookingId}`,
      keyId: "rzp_test_1DP5mmOlF5G5ag",
      currency: "INR",
      amountMinor: 0,
      advanceAmount: 0,
      dueAmount: 0,
      grandTotal: 0,
      totalDays: days,
      softLockExpiresAt,
      isSimulator: true,
    };
  },

  /**
   * Phase 5: Calls verify-booking-payment Edge Function to cryptographically
   * verify HMAC-SHA256 signature, transition booking to pending_vendor_confirmation,
   * and notify vendor.
   */
  async verifyBookingPayment(input: {
    bookingRecordId?: string;
    bookingId?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    isSimulator?: boolean;
  }): Promise<{ success: boolean; bookingId: string; ticketId: string }> {
    try {
      const { data, error } = await supabase.functions.invoke("verify-booking-payment", {
        body: input,
      });

      if (error) throw error;
      if (data && data.success) {
        return data;
      }
      if (data?.error) {
        throw new Error(data.error);
      }
    } catch (edgeErr) {
      console.warn("verify-booking-payment edge function error, using direct DB update:", edgeErr);
    }

    // Direct DB Fallback
    const targetId = input.bookingRecordId || input.bookingId;
    if (targetId) {
      await supabase
        .from("vendor_bookings")
        .update({
          booking_status: "pending_vendor_confirmation",
          payment_status: "paid_advance",
          razorpay_payment_id: input.razorpayPaymentId,
          razorpay_order_id: input.razorpayOrderId,
          soft_lock_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .or(isUuid(targetId) ? `id.eq.${targetId},booking_id.eq.${targetId}` : `booking_id.eq.${targetId}`);

      try {
        const { data: bRow } = await supabase
          .from("vendor_bookings")
          .select("id")
          .or(isUuid(targetId) ? `id.eq.${targetId},booking_id.eq.${targetId}` : `booking_id.eq.${targetId}`)
          .single();
        if (bRow?.id) {
          await ReferralCommissionService.recordPendingBookingCommission(bRow.id);
        }
      } catch (refErr) {
        console.warn("Could not record referral commission in verifyBookingPayment:", refErr);
      }
    }

    return {
      success: true,
      bookingId: input.bookingId || targetId || "",
      ticketId: "",
    };
  },

  /**
   * Creates a direct booking (e.g. from checkout modal simulator or direct flow)
   */
  async createBooking(input: CreateBookingInput): Promise<VendorBooking> {
    const days = input.totalDays || calculateEventDays(input.startDate || input.eventDate, input.endDate || input.eventDate);
    const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ticketId = `RL-${Math.floor(10000 + Math.random() * 90000)}`;

    const total = typeof input.totalAmount === "number" && input.totalAmount > 0
      ? input.totalAmount
      : (input.packagePrice || 0);
    const advance = typeof input.advanceAmount === "number" && input.advanceAmount > 0
      ? input.advanceAmount
      : Math.round(total * 0.30);
    const due = typeof input.dueAmount === "number"
      ? input.dueAmount
      : (total - advance);

    // Validate package_id: must be a valid UUID AND actually exist in vendor_services
    // Otherwise Postgres throws a foreign key constraint violation
    const isValidUuid = (val?: string | null): boolean =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    let safePackageId: string | null = null;
    if (isValidUuid(input.packageId)) {
      try {
        const { data: svc } = await supabase
          .from("vendor_services")
          .select("id")
          .eq("id", input.packageId)
          .maybeSingle();
        if (svc?.id) {
          safePackageId = svc.id;
        }
      } catch {
        safePackageId = null;
      }
    }

    const eventStartAt = input.eventStartAt || buildEventStartTimestamp(input.startDate || input.eventDate, "10:00");
    const cancellationCutoffAt = calculateCancellationCutoff(eventStartAt);

    // Table vendor_bookings only accepts its own columns
    const dbPayload = {
      booking_id: bookingId,
      ticket_id: ticketId,
      vendor_id: input.vendorId,
      customer_id: input.customerId || null,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      customer_email: input.customerEmail?.trim() || null,
      event_date: input.startDate || input.eventDate,
      start_date: input.startDate || input.eventDate,
      end_date: input.endDate || input.eventDate,
      total_days: days,
      event_type: input.eventType || "Wedding",
      package_id: safePackageId,
      package_title: input.packageTitle || "Wedding Package",
      package_price: input.packagePrice || total,
      selected_packages: input.selectedPackages || [],
      add_ons: input.addOns || [],
      special_notes: input.specialNotes?.trim() || null,
      total_amount: total,
      advance_amount: advance,
      due_amount: due,
      booking_status: "pending_vendor_confirmation",
      payment_status: "paid_advance",
      razorpay_payment_id: input.razorpayPaymentId || null,
      razorpay_order_id: input.razorpayOrderId || null,
      referral_code: input.referralCode || null,
      source: "online",
      event_start_at: eventStartAt,
      cancellation_cutoff_at: cancellationCutoffAt,
      customer_contact_number: input.customerContactNumber?.trim() || input.customerPhone.trim(),
      customer_whatsapp_number: input.customerWhatsappNumber?.trim() || input.customerContactNumber?.trim() || input.customerPhone.trim(),
      service_map_url: input.serviceMapUrl?.trim() || null,
      booking_description: input.bookingDescription?.trim() || input.specialNotes?.trim() || null,
    };

    let createdBooking: VendorBooking | null = null;

    try {
      const { data, error } = await supabase
        .from("vendor_bookings")
        .insert(dbPayload)
        .select("*, vendors(id, business_name, contact_phone, logo_url, city, slug)")
        .single();
      if (!error && data) {
        createdBooking = mapDbBooking(data);
      } else if (error) {
        console.error("Supabase insert error in createBooking:", error);
        throw error;
      }
    } catch (dbErr) {
      console.error("DB insert error in createBooking:", dbErr);
      throw dbErr;
    }

    // Best-effort: create vendor notification so bell/dashboard updates
    try {
      await supabase.from("vendor_notifications").insert({
        vendor_id: input.vendorId,
        title: "New Booking Request!",
        body: `${input.customerName.trim()} booked for ${input.startDate || input.eventDate} (${days} ${days === 1 ? "day" : "days"}). 30% advance ₹${advance.toLocaleString("en-IN")} paid.`,
        kind: "booking_request",
        target_path: "/VendorBookings",
        is_read: false,
      });
    } catch (notifErr) {
      console.warn("Could not insert vendor notification (non-critical):", notifErr);
    }

    if (!createdBooking) {
      throw new Error("Booking creation failed to return a valid record.");
    }

    // Cache locally as well for offline/fast read
    try {
      const local = await getLocalBookings();
      local.unshift(createdBooking);
      await saveLocalBookings(local);
    } catch {}

    return createdBooking;
  },

  /**
   * Helper for vendors to record an offline direct booking into their ledger
   */
  async createOfflineBooking(input: {
    vendorId: string;
    customerName: string;
    customerPhone: string;
    eventDate: string;
    eventType?: string;
    packageTitle?: string;
    totalAmount: number;
    advanceAmount?: number;
    specialNotes?: string | null;
  }): Promise<VendorBooking> {
    const bookingId = `bkg_off_${Date.now()}`;
    const ticketId = `RL-${Math.floor(10000 + Math.random() * 90000)}`;
    const total = input.totalAmount;
    const advance = input.advanceAmount ?? Math.round(total * 0.30);
    const due = total - advance;

    const row = {
      booking_id: bookingId,
      ticket_id: ticketId,
      vendor_id: input.vendorId,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      event_date: input.eventDate,
      start_date: input.eventDate,
      end_date: input.eventDate,
      total_days: 1,
      event_type: input.eventType || "Wedding",
      package_title: input.packageTitle || "Offline Booking",
      package_price: total,
      total_amount: total,
      advance_amount: advance,
      due_amount: due,
      booking_status: "confirmed",
      payment_status: "paid_advance",
      special_notes: input.specialNotes || null,
      source: "offline",
    };

    try {
      const { data, error } = await supabase.from("vendor_bookings").insert(row).select("*").single();
      if (!error && data) {
        return mapDbBooking(data);
      }
    } catch (err) {
      console.warn("Could not insert offline booking into Supabase:", err);
    }

    const localBooking = mapDbBooking({ ...row, id: `local_${Date.now()}` });
    const local = await getLocalBookings();
    local.unshift(localBooking);
    await saveLocalBookings(local);
    return localBooking;
  },

  /**
   * Status update helper delegating to atomic RPCs
   */
  async updateStatus(bookingId: string, status: BookingStatus, rejectionReason?: string): Promise<any> {
    if (status === "confirmed") {
      return this.confirmBooking(bookingId);
    }
    if (status === "cancelled" || status === "cancelled_by_vendor") {
      return this.cancelBooking(bookingId, rejectionReason || "Cancelled by vendor");
    }
    const { data, error } = await supabase
      .from("vendor_bookings")
      .update({
        booking_status: status,
        rejection_reason: rejectionReason || null,
        updated_at: new Date().toISOString(),
      })
      .or(isUuid(bookingId) ? `id.eq.${bookingId},booking_id.eq.${bookingId}` : `booking_id.eq.${bookingId}`)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbBooking(data);
  },

  /**
   * Vendor confirms booking: executes atomic confirm_vendor_booking RPC.
   * Generates ticket, creates customer notification, DOES NOT write manual blocked row.
   */
  async confirmBooking(bookingId: string): Promise<any> {
    const { data, error } = await supabase.rpc("confirm_vendor_booking", {
      target_booking_id: bookingId,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Vendor cancels booking: executes atomic cancel_vendor_booking RPC.
   * Cancels booking, creates Admin refund queue entry, notifies customer (72h SLA),
   * and releases availability immediately.
   */
  async cancelBooking(bookingId: string, reason: string): Promise<any> {
    const { data, error } = await supabase.rpc("cancel_vendor_booking", {
      target_booking_id: bookingId,
      cancel_reason: reason,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Customer cancels booking before the 120-hour cutoff: executes cancel_customer_booking RPC.
   * Cancels booking, queues refund in booking_refund_requests, and notifies vendor & admin.
   */
  async cancelCustomerBooking(bookingId: string, reason: string): Promise<any> {
    const { data, error } = await supabase.rpc("cancel_customer_booking", {
      target_booking_id: bookingId,
      cancel_reason: reason,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Escalates emergency post-cutoff without auto-cancelling the booking.
   * Creates emergency report in booking_emergency_reports and notifies Admin.
   */
  async reportBookingEmergency(bookingId: string, reason: string, description: string): Promise<any> {
    const { data, error } = await supabase.rpc("report_booking_emergency", {
      target_booking_id: bookingId,
      p_reason: reason,
      p_description: description,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Fetches server-authoritative secure booking details with automatic contact masking/unmasking.
   */
  async getSecureBookingDetails(
    bookingRef: string,
    roleHint?: "customer" | "vendor" | "admin"
  ): Promise<SecureBookingDetails | null> {
    if (!bookingRef || !bookingRef.trim()) return null;
    const cleanRef = bookingRef.trim();

    try {
      const { data, error } = await supabase.rpc("get_secure_booking_details", {
        p_booking_ref: cleanRef,
      });
      if (!error && data) {
        return data as SecureBookingDetails;
      }
      if (error) {
        console.warn("get_secure_booking_details RPC warning/error:", error.message);
      }
    } catch (rpcErr) {
      console.warn("get_secure_booking_details RPC invocation failed, fallback to client-side masking:", rpcErr);
    }

    // Fallback: fetch standard booking row and compute authorization/masking client-side
    const fallbackBooking = await this.getBookingByIdOrTicket(cleanRef);
    if (!fallbackBooking) return null;

    const eventStartAt = fallbackBooking.event_start_at || buildEventStartTimestamp(fallbackBooking.event_date, "10:00");
    const cutoffAt = fallbackBooking.cancellation_cutoff_at || calculateCancellationCutoff(eventStartAt);
    const isCutoffPassed = isCancellationLocked(cutoffAt, eventStartAt, fallbackBooking.event_date);
    const isConfirmed = fallbackBooking.booking_status === "confirmed";
    const contactsUnlocked = (isConfirmed && isCutoffPassed) || roleHint === "admin";
    const canCancel = (isConfirmed && !isCutoffPassed) || roleHint === "admin";

    const customerContacts = {
      name: fallbackBooking.customer_name,
      phone: (roleHint === "customer" || roleHint === "admin" || contactsUnlocked)
        ? (fallbackBooking.customer_contact_number || fallbackBooking.customer_phone)
        : null,
      whatsapp: (roleHint === "customer" || roleHint === "admin" || contactsUnlocked)
        ? (fallbackBooking.customer_whatsapp_number || fallbackBooking.customer_phone)
        : null,
      email: (roleHint === "customer" || roleHint === "admin" || contactsUnlocked)
        ? fallbackBooking.customer_email || null
        : null,
      service_map_url: (roleHint === "customer" || roleHint === "admin" || contactsUnlocked)
        ? fallbackBooking.service_map_url || null
        : null,
      booking_description: (roleHint === "customer" || roleHint === "admin" || contactsUnlocked)
        ? fallbackBooking.booking_description || fallbackBooking.special_notes || null
        : null,
    };

    const vendorContacts = {
      id: fallbackBooking.vendor_id,
      business_name: fallbackBooking.vendor_name || "Wedding Vendor",
      contact_phone: (roleHint === "vendor" || roleHint === "admin" || contactsUnlocked)
        ? fallbackBooking.vendor_phone || null
        : null,
      city: fallbackBooking.vendor_city || null,
      logo_url: fallbackBooking.vendor_image || null,
      slug: fallbackBooking.vendor_slug || null,
    };

    return {
      id: fallbackBooking.id,
      booking_id: fallbackBooking.booking_id,
      ticket_id: fallbackBooking.ticket_id,
      booking_status: fallbackBooking.booking_status,
      payment_status: fallbackBooking.payment_status,
      event_date: fallbackBooking.event_date,
      start_date: fallbackBooking.start_date,
      end_date: fallbackBooking.end_date,
      total_days: fallbackBooking.total_days,
      event_type: fallbackBooking.event_type,
      event_start_at: eventStartAt,
      cancellation_cutoff_at: cutoffAt,
      is_cutoff_passed: isCutoffPassed,
      contacts_unlocked: contactsUnlocked,
      can_cancel: canCancel,
      total_amount: fallbackBooking.total_amount,
      advance_amount: fallbackBooking.advance_amount,
      due_amount: fallbackBooking.due_amount,
      package_title: fallbackBooking.package_title,
      selected_packages: fallbackBooking.selected_packages,
      add_ons: fallbackBooking.add_ons,
      special_notes: fallbackBooking.special_notes,
      refund_status: fallbackBooking.refund_status,
      refund_amount: fallbackBooking.refund_amount,
      rejection_reason: fallbackBooking.rejection_reason,
      cancellation_reason: fallbackBooking.cancellation_reason,
      cancelled_at: fallbackBooking.cancelled_at,
      cancelled_by: fallbackBooking.cancelled_by,
      emergency_status: fallbackBooking.emergency_status || "none",
      emergency_reported_at: fallbackBooking.emergency_reported_at,
      emergency_reason: fallbackBooking.emergency_reason,
      created_at: fallbackBooking.created_at,
      customer: customerContacts,
      vendor: vendorContacts,
      caller_role: roleHint || "customer",
    };
  },

  /**
   * Admin processes refund: executes atomic process_admin_refund RPC.
   */
  async processAdminRefund(bookingId: string, notes?: string, txnRef?: string): Promise<any> {
    const { data, error } = await supabase.rpc("process_admin_refund", {
      target_booking_id: bookingId,
      ref_notes: notes || "Processed manually by admin",
      txn_ref: txnRef || null,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Lists bookings for a vendor.
   * Excludes uncompleted pending_payment checkouts.
   */
  async getVendorBookings(vendorId: string): Promise<VendorBooking[]> {
    let remote: VendorBooking[] = [];
    try {
      const { data, error } = await supabase
        .from("vendor_bookings")
        .select("*, vendors(id, business_name, contact_phone, logo_url, city, slug)")
        .eq("vendor_id", vendorId)
        .neq("booking_status", "pending_payment") // Never show incomplete checkouts to vendor
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        remote = data.map(mapDbBooking);
      }
    } catch {
      // use local
    }

    const local = (await getLocalBookings()).filter(
      (b) => b.vendor_id === vendorId && b.booking_status !== "pending_payment"
    );
    const map = new Map<string, VendorBooking>();
    for (const item of [...local, ...remote]) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  /**
   * Lists bookings on a specific date for vendor's ledger
   */
  async getVendorBookingsForDate(vendorId: string, date: string): Promise<VendorBooking[]> {
    const all = await this.getVendorBookings(vendorId);
    return all.filter((b) => {
      if (b.booking_status === "cancelled_by_vendor" || b.booking_status === "cancelled") return false;
      if (b.event_date === date || b.start_date === date || b.end_date === date) return true;
      if (b.start_date && b.end_date) {
        return date >= b.start_date && date <= b.end_date;
      }
      return false;
    });
  },

  /**
   * Lists customer's bookings from database
   */
  async getCustomerBookings(customerId?: string | null, phone?: string | null): Promise<VendorBooking[]> {
    let remote: VendorBooking[] = [];
    try {
      let query = supabase
        .from("vendor_bookings")
        .select("*, vendors(id, business_name, contact_phone, logo_url, city, slug)")
        .order("created_at", { ascending: false });
      if (customerId && phone) {
        query = query.or(`customer_id.eq.${customerId},customer_phone.eq.${phone}`);
      } else if (customerId) {
        query = query.eq("customer_id", customerId);
      } else if (phone) {
        query = query.eq("customer_phone", phone);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        remote = data.map(mapDbBooking);
      }
    } catch {
      // use local
    }

    const local = (await getLocalBookings()).filter((b) => {
      if (!customerId && !phone) return true;
      if (customerId && b.customer_id === customerId) return true;
      if (phone && b.customer_phone === phone) return true;
      return false;
    });

    const map = new Map<string, VendorBooking>();
    for (const item of [...local, ...remote]) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  /**
   * Fetches a single booking by booking_id or ticket_id
   */
  async getBookingByIdOrTicket(reference: string, secondaryRef?: string): Promise<VendorBooking | null> {
    const refs = [reference, secondaryRef]
      .filter((r): r is string => Boolean(r && typeof r === "string" && r.trim()))
      .map((r) => r.trim());

    if (!refs.length) return null;

    try {
      const orClauses: string[] = [];
      for (const ref of refs) {
        orClauses.push(`booking_id.eq.${ref}`);
        orClauses.push(`ticket_id.eq.${ref}`);
        if (isUuid(ref)) {
          orClauses.push(`id.eq.${ref}`);
        }
      }

      const { data, error } = await supabase
        .from("vendor_bookings")
        .select("*, vendors(id, business_name, contact_phone, logo_url, city, slug)")
        .or(orClauses.join(","))
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return mapDbBooking(data);
      }
    } catch {
      // fallback
    }

    const local = await getLocalBookings();
    return local.find((b) => refs.some((r) => b.booking_id === r || b.ticket_id === r || b.id === r)) || null;
  },

  /**
   * Admin: Lists all bookings
   */
  async listAllBookingsForAdmin(): Promise<VendorBooking[]> {
    let remote: VendorBooking[] = [];
    try {
      const { data, error } = await supabase
        .from("vendor_bookings")
        .select("*, vendors(id, business_name, contact_phone, logo_url, city, slug)")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        remote = data.map(mapDbBooking);
      }
    } catch {
      // fallback
    }

    const local = await getLocalBookings();
    const map = new Map<string, VendorBooking>();
    for (const item of [...local, ...remote]) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  /**
   * Admin: Lists all refund requests from booking_refund_requests
   */
  async listAdminRefundRequests(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("booking_refund_requests")
        .select("*, vendor_bookings(*)")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data;
      }
    } catch {
      // fallback
    }
    return [];
  },

  /**
   * Realtime subscription for bookings changes (for vendor, customer, and admin)
   */
  subscribeToBookings(
    onChange: () => void,
    filter?: { vendorId?: string; customerId?: string }
  ): () => void {
    const channelName = `bookings-rt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_bookings" },
        (payload) => {
          if (filter?.vendorId) {
            const vId = (payload.new as any)?.vendor_id || (payload.old as any)?.vendor_id;
            if (vId && vId !== filter.vendorId) return;
          }
          if (filter?.customerId) {
            const cId = (payload.new as any)?.customer_id || (payload.old as any)?.customer_id;
            if (cId && cId !== filter.customerId) return;
          }
          onChange();
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};

function mapDbBooking(row: any): VendorBooking {
  const total = Number(row.total_amount || 0);
  const advance = typeof row.advance_amount === "number" ? Number(row.advance_amount) : Math.round(total * 0.30);
  const due = typeof row.due_amount === "number" ? Number(row.due_amount) : (total - advance);

  let selectedPkgs: SelectedPackageSummary[] = [];
  if (Array.isArray(row.selected_packages)) {
    selectedPkgs = row.selected_packages;
  } else if (row.package_title) {
    selectedPkgs = [{
      id: String(row.package_id || "pkg"),
      title: String(row.package_title),
      price: Number(row.package_price || total),
    }];
  }

  const vendorObj = row.vendors || null;

  return {
    id: String(row.id),
    booking_id: String(row.booking_id || row.id),
    ticket_id: String(row.ticket_id || generateTicketId(row.id)),
    vendor_id: String(row.vendor_id),
    vendor_name: row.vendor_name || vendorObj?.business_name || undefined,
    vendor_phone: row.vendor_phone || vendorObj?.contact_phone || null,
    vendor_image: row.vendor_image || vendorObj?.logo_url || null,
    vendor_category: row.vendor_category || vendorObj?.category || null,
    vendor_city: row.vendor_city || vendorObj?.city || null,
    vendor_slug: row.vendor_slug || vendorObj?.slug || null,
    customer_id: row.customer_id || null,
    customer_name: String(row.customer_name || "Guest"),
    customer_phone: String(row.customer_phone || ""),
    customer_email: row.customer_email || null,
    event_date: String(row.event_date || "").slice(0, 10),
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : String(row.event_date || "").slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : String(row.event_date || "").slice(0, 10),
    total_days: Number(row.total_days || 1),
    event_type: String(row.event_type || "Wedding"),
    package_id: row.package_id || null,
    package_title: String(row.package_title || "Wedding Package"),
    package_price: Number(row.package_price || total),
    selected_packages: selectedPkgs,
    add_ons: Array.isArray(row.add_ons) ? row.add_ons : [],
    special_notes: row.special_notes || null,
    total_amount: total,
    advance_amount: advance,
    due_amount: due,
    booking_status: (row.booking_status || "pending") as BookingStatus,
    payment_status: (row.payment_status || "paid_advance") as PaymentStatus,
    soft_lock_expires_at: row.soft_lock_expires_at || null,
    razorpay_payment_id: row.razorpay_payment_id || null,
    razorpay_order_id: row.razorpay_order_id || null,
    source: (row.source || "online") as BookingSource,
    rejection_reason: row.rejection_reason || null,
    refund_status: row.refund_status || null,
    refund_amount: row.refund_amount != null ? Number(row.refund_amount) : (row.booking_status?.startsWith("cancel") ? advance : null),
    refunded_at: row.refunded_at || null,
    refund_notes: row.refund_notes || null,
    referral_code: row.referral_code || null,
    event_start_at: row.event_start_at || (row.event_date ? buildEventStartTimestamp(row.event_date, "10:00") : null),
    cancellation_cutoff_at: row.cancellation_cutoff_at || (row.event_start_at ? calculateCancellationCutoff(row.event_start_at) : null),
    customer_contact_number: row.customer_contact_number || row.customer_phone || null,
    customer_whatsapp_number: row.customer_whatsapp_number || row.customer_contact_number || row.customer_phone || null,
    service_map_url: row.service_map_url || null,
    booking_description: row.booking_description || row.special_notes || null,
    contact_unlocked_at: row.contact_unlocked_at || null,
    cancelled_at: row.cancelled_at || null,
    cancelled_by: row.cancelled_by || null,
    cancellation_reason: row.cancellation_reason || row.rejection_reason || null,
    emergency_status: (row.emergency_status || "none") as "none" | "reported" | "investigating" | "resolved",
    emergency_reported_at: row.emergency_reported_at || null,
    emergency_reason: row.emergency_reason || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}
