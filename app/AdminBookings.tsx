import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Filter,
  Gift,
  IndianRupee,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Ticket,
  User,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { royalAdmin } from "@/components/admin/dashboard/adminDashboardTheme";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import { BookingDetailsModal } from "@/components/booking/BookingDetailsModal";
import {
  VendorBookingService,
  type BookingStatus,
  type VendorBooking,
} from "@/services/vendorBookings";
import { getCommissionForBookingAmount } from "@/services/referralCommission";

type TabKey = "admin_pending" | "vendor_pending" | "confirmed" | "cancelled" | "refunds";

const money = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  try {
    const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export default function AdminBookings() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 960;

  const initialTab: TabKey =
    params.tab === "admin_pending"
      ? "admin_pending"
      : params.tab === "vendor_pending"
      ? "vendor_pending"
      : params.tab === "confirmed"
      ? "confirmed"
      : params.tab === "cancelled"
      ? "cancelled"
      : params.tab === "refunds"
      ? "refunds"
      : "admin_pending";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Forwarding & Admin Cancel state
  const [adminForwardingId, setAdminForwardingId] = useState<string | null>(null);
  const [adminCancelBooking, setAdminCancelBooking] = useState<VendorBooking | null>(null);
  const [adminCancelReason, setAdminCancelReason] = useState("");
  const [adminCancelling, setAdminCancelling] = useState(false);

  // Refund modal state
  const [refundBooking, setRefundBooking] = useState<VendorBooking | null>(null);
  const [refundNotes, setRefundNotes] = useState("");
  const [refundTxnRef, setRefundTxnRef] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);

  // Booking details modal state
  const [selectedDetailsBookingRef, setSelectedDetailsBookingRef] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await VendorBookingService.listAllBookingsForAdmin();
      setBookings(list);
    } catch (err) {
      console.warn("Failed to load admin bookings:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    // Realtime subscription: updates whenever a customer books or vendor responds
    const unsubscribe = VendorBookingService.subscribeToBookings(() => {
      void loadData(true);
    });
    return unsubscribe;
  }, [loadData]);

  // Tab categorization
  const isAdminPending = (b: VendorBooking) =>
    b.booking_status === "ADMIN_PENDING" ||
    b.booking_status === "admin_pending" ||
    b.booking_status === "pending_payment" ||
    b.booking_status === "pending";

  const isVendorPending = (b: VendorBooking) =>
    (b.booking_status === "VENDOR_PENDING" ||
     b.booking_status === "vendor_pending" ||
     b.booking_status === "pending_vendor_confirmation") &&
    !isAdminPending(b);

  const isConfirmed = (b: VendorBooking) =>
    b.booking_status === "ACCEPTED" ||
    b.booking_status === "confirmed" ||
    b.booking_status === "completed";

  const isCancelled = (b: VendorBooking) =>
    b.booking_status === "CUSTOMER_CANCELLED" ||
    b.booking_status === "ADMIN_CANCELLED" ||
    b.booking_status === "VENDOR_REJECTED" ||
    b.booking_status === "cancelled_by_vendor" ||
    b.booking_status === "cancelled_by_customer" ||
    b.booking_status === "cancelled";

  const isRefundQueue = (b: VendorBooking) =>
    isCancelled(b) && (b.refund_status !== "refunded" || (b.booking_fee_amount || b.advance_amount || 0) > 0);

  const counts = useMemo(
    () => ({
      admin_pending: bookings.filter(isAdminPending).length,
      vendor_pending: bookings.filter(isVendorPending).length,
      confirmed: bookings.filter(isConfirmed).length,
      cancelled: bookings.filter(isCancelled).length,
      refunds: bookings.filter(isRefundQueue).length,
      total: bookings.length,
    }),
    [bookings]
  );

  const financials = useMemo(() => {
    let totalGross = 0;
    let totalFeesCollected = 0;
    let totalReferral = 0;
    let totalRoyallagn = 0;

    for (const b of bookings) {
      if (!isCancelled(b)) {
        totalGross += Number(b.total_amount || 0);
        const fee = Number(b.booking_fee_amount ?? b.advance_amount ?? 0);
        totalFeesCollected += fee;

        if (b.referral_commission_amount != null) {
          totalReferral += Number(b.referral_commission_amount);
        }
        if (b.royallagn_commission_amount != null) {
          totalRoyallagn += Number(b.royallagn_commission_amount);
        } else {
          totalRoyallagn += fee - (Number(b.referral_commission_amount || 0));
        }
      }
    }
    return { totalGross, totalFeesCollected, totalReferral, totalRoyallagn };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((item) => {
      if (activeTab === "admin_pending" && !isAdminPending(item)) return false;
      if (activeTab === "vendor_pending" && !isVendorPending(item)) return false;
      if (activeTab === "confirmed" && !isConfirmed(item)) return false;
      if (activeTab === "cancelled" && !isCancelled(item)) return false;
      if (activeTab === "refunds" && !isRefundQueue(item)) return false;

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        item.customer_name.toLowerCase().includes(q) ||
        item.customer_phone.includes(q) ||
        (item.customer_email && item.customer_email.toLowerCase().includes(q)) ||
        (item.vendor_name && item.vendor_name.toLowerCase().includes(q)) ||
        (item.vendor_city && item.vendor_city.toLowerCase().includes(q)) ||
        item.package_title.toLowerCase().includes(q) ||
        item.ticket_id.toLowerCase().includes(q) ||
        item.booking_id.toLowerCase().includes(q)
      );
    });
  }, [activeTab, bookings, searchQuery]);

  const handleAdminForward = async (item: VendorBooking) => {
    setAdminForwardingId(item.id);
    try {
      await VendorBookingService.adminForwardToVendor(item.id);
      Alert.alert(
        "Forwarded to Vendor",
        `Booking #${item.ticket_id} has been verified and forwarded to ${item.vendor_name || "the vendor"}. The vendor has been notified to accept.`
      );
      await loadData(true);
    } catch (err) {
      Alert.alert("Action Failed", err instanceof Error ? err.message : "Unable to forward to vendor.");
    } finally {
      setAdminForwardingId(null);
    }
  };

  const handleAdminCancel = async () => {
    if (!adminCancelBooking) return;
    setAdminCancelling(true);
    try {
      await VendorBookingService.adminCancelBooking(
        adminCancelBooking.id,
        adminCancelReason.trim() || "Service cancelled by Admin"
      );
      const feeAmt = money(adminCancelBooking.booking_fee_amount ?? adminCancelBooking.advance_amount);
      Alert.alert(
        "Booking Cancelled",
        `Booking #${adminCancelBooking.ticket_id} has been cancelled. 100% refund of ${feeAmt} has been queued for the customer.`
      );
      setAdminCancelBooking(null);
      setAdminCancelReason("");
      await loadData(true);
    } catch (err) {
      Alert.alert("Action Failed", err instanceof Error ? err.message : "Unable to cancel booking.");
    } finally {
      setAdminCancelling(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!refundBooking) return;
    setProcessingRefund(true);
    try {
      await VendorBookingService.processAdminRefund(
        refundBooking.id,
        refundNotes.trim() || "Manual refund processed via Admin Panel",
        refundTxnRef.trim() || undefined
      );

      Alert.alert(
        "Refund Processed",
        `Refund of ${money(refundBooking.advance_amount)} for ticket #${refundBooking.ticket_id} has been logged as completed.`
      );
      setRefundBooking(null);
      setRefundNotes("");
      setRefundTxnRef("");
      await loadData(true);
    } catch (err) {
      Alert.alert("Action Failed", err instanceof Error ? err.message : "Unable to process refund.");
    } finally {
      setProcessingRefund(false);
    }
  };

  const renderBookingCard = ({ item }: { item: VendorBooking }) => {
    const adminPending = isAdminPending(item);
    const vendorPending = isVendorPending(item);
    const confirmed = isConfirmed(item);
    const cancelled = isCancelled(item);

    const statusBadgeText = adminPending
      ? "Admin Verification Pending"
      : vendorPending
      ? item.booking_status === "pending_payment"
        ? "Payment Incomplete"
        : "Awaiting Vendor Acceptance"
      : confirmed
      ? "Confirmed · Connection Active"
      : item.booking_status === "CUSTOMER_CANCELLED"
      ? "Cancelled by Customer"
      : item.booking_status === "ADMIN_CANCELLED"
      ? "Cancelled by Admin"
      : item.booking_status === "VENDOR_REJECTED"
      ? "Declined by Vendor"
      : "Cancelled";

    const statusBg = adminPending
      ? royalAdmin.amberSoft
      : vendorPending
      ? royalAdmin.blueSoft
      : confirmed
      ? royalAdmin.greenSoft
      : royalAdmin.roseSoft;

    const statusColor = adminPending
      ? royalAdmin.amber
      : vendorPending
      ? royalAdmin.blue
      : confirmed
      ? royalAdmin.green
      : royalAdmin.rose;

    return (
      <View style={styles.card}>
        {/* Top Meta Bar */}
        <View style={styles.cardHeader}>
          <View style={styles.ticketBadge}>
            <Ticket size={14} color={royalAdmin.navyDeep} />
            <Text style={styles.ticketIdText}>Ticket #{item.ticket_id}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            {adminPending || vendorPending ? (
              <Clock size={12} color={statusColor} />
            ) : confirmed ? (
              <CheckCircle2 size={12} color={statusColor} />
            ) : (
              <XCircle size={12} color={statusColor} />
            )}
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {statusBadgeText}
            </Text>
          </View>
        </View>

        {/* CUSTOMER -> VENDOR RELATIONSHIP MAPPING */}
        <View style={[styles.relationBox, desktop && styles.relationBoxDesktop]}>
          {/* Customer Side */}
          <View style={styles.partyColumn}>
            <View style={styles.partyHeader}>
              <View style={[styles.partyIconCircle, { backgroundColor: royalAdmin.blueSoft }]}>
                <User size={15} color={royalAdmin.blue} />
              </View>
              <View>
                <Text style={styles.partyRoleLabel}>CUSTOMER (SENDER)</Text>
                <Text style={styles.partyNameText} numberOfLines={1}>
                  {item.customer_name}
                </Text>
              </View>
            </View>

            <View style={styles.partyContactRow}>
              <Phone size={13} color={royalAdmin.navyMuted} />
              <Text style={styles.partyContactText}>{item.customer_phone || "No phone"}</Text>
            </View>
            {item.customer_email ? (
              <View style={styles.partyContactRow}>
                <Mail size={13} color={royalAdmin.navyMuted} />
                <Text style={styles.partyContactText} numberOfLines={1}>
                  {item.customer_email}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Directional Connector */}
          <View style={styles.connectorContainer}>
            <View style={styles.connectorLine} />
            <View style={styles.connectorBadge}>
              <Text style={styles.connectorText}>SENT TO</Text>
              <ArrowRight size={13} color={royalAdmin.navyDeep} />
            </View>
            <View style={styles.connectorLine} />
          </View>

          {/* Vendor Side */}
          <View style={styles.partyColumn}>
            <View style={styles.partyHeader}>
              <View style={[styles.partyIconCircle, { backgroundColor: royalAdmin.amberSoft }]}>
                <Building2 size={15} color={royalAdmin.amber} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.partyRoleLabel}>VENDOR (RECIPIENT)</Text>
                <Text style={styles.partyNameText} numberOfLines={1}>
                  {item.vendor_name || "Assigned Vendor"}
                </Text>
              </View>
            </View>

            <View style={styles.partyContactRow}>
              <Tag size={13} color={royalAdmin.navyMuted} />
              <Text style={styles.partyContactText} numberOfLines={1}>
                {item.vendor_category || "Wedding Professional"}
              </Text>
            </View>
            {item.vendor_city ? (
              <View style={styles.partyContactRow}>
                <MapPin size={13} color={royalAdmin.navyMuted} />
                <Text style={styles.partyContactText}>{item.vendor_city}</Text>
              </View>
            ) : null}
            {item.vendor_phone ? (
              <View style={styles.partyContactRow}>
                <Phone size={13} color={royalAdmin.navyMuted} />
                <Text style={styles.partyContactText}>{item.vendor_phone}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* BOOKING DETAILS */}
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <CalendarDays size={14} color={royalAdmin.navyMuted} />
            <Text style={styles.detailLabel}>Event Dates:</Text>
            <Text style={styles.detailValue}>
              {formatDate(item.start_date || item.event_date)}
              {item.end_date && item.end_date !== item.start_date
                ? ` to ${formatDate(item.end_date)}`
                : ""}
              {item.total_days > 1 ? ` (${item.total_days} days)` : ""}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Package size={14} color={royalAdmin.navyMuted} />
            <Text style={styles.detailLabel}>Package:</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {item.package_title}
            </Text>
          </View>
        </View>

        {/* FINANCIAL SUMMARY */}
        <View style={styles.financialsBox}>
          <View style={styles.financialCol}>
            <Text style={styles.finLabel}>Total Booking</Text>
            <Text style={styles.finTotal}>{money(item.total_amount)}</Text>
          </View>
          <View style={styles.finDivider} />
          <View style={styles.financialCol}>
            <View style={styles.advanceLabelRow}>
              <Text style={styles.finLabel}>
                {item.booking_fee_amount != null ? "Booking Fee" : "Advance Paid"}
              </Text>
              {(item.booking_fee_amount != null || item.payment_status === "paid_advance" || item.payment_status === "paid_booking_fee" || item.payment_status === "free_zero_fee") ? (
                <View style={styles.paidBadge}>
                  <Text style={styles.paidBadgeText}>
                    {item.booking_fee_amount === 0 ? "FREE" : "PAID"}
                  </Text>
                </View>
              ) : (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>PENDING</Text>
                </View>
              )}
            </View>
            <Text style={styles.finAdvance}>
              {money(item.booking_fee_amount ?? item.advance_amount)}
            </Text>
          </View>
          <View style={styles.finDivider} />
          <View style={styles.financialCol}>
            <Text style={styles.finLabel}>Direct to Vendor</Text>
            <Text style={styles.finDue}>
              {money(item.booking_fee_amount != null ? (item.total_amount - (item.booking_fee_amount || 0)) : item.due_amount)}
            </Text>
          </View>
        </View>

        {/* PLATFORM & REFERRAL COMMISSION BREAKDOWN */}
        {((item.booking_fee_amount != null && item.booking_fee_amount > 0) || item.referral_code) ? (() => {
          const fee = item.booking_fee_amount ?? item.advance_amount ?? 0;
          const refCut = item.referral_commission_amount ?? (item.referral_code ? Math.round(fee * 0.4) : 0);
          const royalCut = item.royallagn_commission_amount ?? (fee - refCut);
          const isConf = isConfirmed(item);
          const isCanc = isCancelled(item);
          const commStatus = isConf
            ? { label: "Commission Earned", color: royalAdmin.green, bg: royalAdmin.greenSoft }
            : isCanc
            ? { label: "Commission Voided (Refund 100%)", color: royalAdmin.rose, bg: royalAdmin.roseSoft }
            : { label: "Pending Confirmation", color: royalAdmin.amber, bg: royalAdmin.amberSoft };

          return (
            <View style={styles.referralBanner}>
              <View style={styles.referralHeader}>
                <View style={styles.referralCodeWrap}>
                  <Gift size={15} color="#B45309" />
                  <Text style={styles.referralCodeLabel}>
                    {item.referral_code ? `Referral Code: ${item.referral_code}` : "Direct Platform Connection"}
                  </Text>
                </View>
                <View style={[styles.referralStatusBadge, { backgroundColor: commStatus.bg }]}>
                  <Text style={[styles.referralStatusText, { color: commStatus.color }]}>
                    {commStatus.label}
                  </Text>
                </View>
              </View>

              <View style={styles.referralDetailsRow}>
                <View style={styles.referralMetric}>
                  <Text style={styles.referralMetricLabel}>Booking Fee</Text>
                  <Text style={[styles.referralMetricValue, { color: royalAdmin.navyDeep }]}>
                    {money(fee)}
                  </Text>
                </View>
                <View style={styles.referralMetricDivider} />
                <View style={styles.referralMetric}>
                  <Text style={styles.referralMetricLabel}>Referral Reward</Text>
                  <Text style={[styles.referralMetricValue, { color: "#15803D" }]}>
                    {money(refCut)}
                  </Text>
                </View>
                <View style={styles.referralMetricDivider} />
                <View style={styles.referralMetric}>
                  <Text style={styles.referralMetricLabel}>RoyalLagn Cut</Text>
                  <Text style={[styles.referralMetricValue, { color: "#B45309" }]}>
                    {money(royalCut)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })() : null}

        {/* CANCELLATION & REFUND QUEUE SECTION */}
        {cancelled ? (
          <View style={styles.cancellationBox}>
            <View style={styles.cancellationHeader}>
              <ShieldAlert size={16} color={royalAdmin.rose} />
              <Text style={styles.cancellationTitle}>
                {item.booking_status === "CUSTOMER_CANCELLED"
                  ? "Customer Cancelled · 100% Refund SLA (72h)"
                  : item.booking_status === "ADMIN_CANCELLED"
                  ? "Admin Cancelled · 100% Refund SLA (72h)"
                  : "Vendor Declined · 100% Refund SLA (72h)"}
              </Text>
            </View>
            {(item.rejection_reason || item.admin_cancellation_reason || item.cancellation_reason) ? (
              <Text style={styles.rejectionReasonText}>
                Reason: &quot;{item.rejection_reason || item.admin_cancellation_reason || item.cancellation_reason}&quot;
              </Text>
            ) : null}

            <View style={styles.refundRow}>
              <Text style={styles.refundStatusText}>
                Refund Status:{" "}
                <Text style={{ fontWeight: "700", color: item.refund_status === "refunded" ? royalAdmin.green : royalAdmin.amber }}>
                  {item.refund_status?.toUpperCase() || "PENDING"}
                </Text>{" "}
                (100% Fee: {money(item.booking_fee_amount ?? item.advance_amount)})
              </Text>

              {item.refund_status !== "refunded" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Process 100% refund"
                  onPress={() => {
                    setRefundBooking(item);
                    setRefundNotes(`100% refund for Ticket #${item.ticket_id} (${item.customer_name})`);
                  }}
                  style={styles.processRefundBtn}
                >
                  <Receipt size={13} color="#FFFFFF" />
                  <Text style={styles.processRefundBtnText}>Process 100% Refund</Text>
                </Pressable>
              ) : (
                <View style={styles.refundCompletedBadge}>
                  <CheckCircle2 size={13} color={royalAdmin.green} />
                  <Text style={styles.refundCompletedText}>Refunded</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {/* Emergency Alert Banner if reported */}
        {item.emergency_reason ? (
          <View style={styles.emergencyAdminBanner}>
            <AlertCircle size={15} color="#DC2626" />
            <View style={styles.flex}>
              <Text style={styles.emergencyAdminTitle}>
                Emergency Reported ({item.emergency_status || "Pending"})
              </Text>
              <Text style={styles.emergencyAdminReason} numberOfLines={2}>
                &quot;{item.emergency_reason}&quot;
              </Text>
            </View>
          </View>
        ) : null}

        {/* Action Row */}
        <View style={styles.cardActionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View booking and contact details"
            onPress={() => setSelectedDetailsBookingRef(item.booking_id)}
            style={styles.viewDetailsBtn}
          >
            <FileText size={14} color="#FFFFFF" />
            <Text style={styles.viewDetailsBtnText}>Details & Contacts</Text>
          </Pressable>

          {/* ADMIN_PENDING Actions */}
          {adminPending && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send to Vendor"
                disabled={adminForwardingId === item.id}
                onPress={() => void handleAdminForward(item)}
                style={styles.forwardToVendorBtn}
              >
                {adminForwardingId === item.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ArrowUpRight size={14} color="#FFFFFF" />
                    <Text style={styles.forwardToVendorBtnText}>Send to Vendor</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel & 100% Refund"
                onPress={() => {
                  setAdminCancelBooking(item);
                  setAdminCancelReason("Service could not be verified by Admin");
                }}
                style={styles.adminCancelBtn}
              >
                <XCircle size={14} color="#DC2626" />
                <Text style={styles.adminCancelBtnText}>Cancel & Refund</Text>
              </Pressable>
            </>
          )}

          {/* VENDOR_PENDING Actions */}
          {vendorPending && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Admin Cancel & Refund"
              onPress={() => {
                setAdminCancelBooking(item);
                setAdminCancelReason("Vendor unresponsive / Admin cancellation requested");
              }}
              style={styles.adminCancelBtn}
            >
              <XCircle size={14} color="#DC2626" />
              <Text style={styles.adminCancelBtnText}>Cancel & Refund</Text>
            </Pressable>
          )}

          {/* CONFIRMED Actions */}
          {confirmed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View E-Ticket"
              onPress={() => router.push({ pathname: "/ticket", params: { booking_id: item.booking_id, ticket_id: item.ticket_id } })}
              style={styles.adminTicketBtn}
            >
              <Ticket size={14} color={royalAdmin.navyDeep} />
              <Text style={styles.adminTicketBtnText}>E-Ticket</Text>
            </Pressable>
          )}

          {/* CANCELLED Actions: Process Refund button if not refunded */}
          {cancelled && item.refund_status !== "refunded" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Process 100% Refund"
              onPress={() => {
                setRefundBooking(item);
                setRefundNotes(`100% refund for Ticket #${item.ticket_id} (${item.customer_name})`);
              }}
              style={styles.processRefundDirectBtn}
            >
              <Receipt size={14} color="#FFFFFF" />
              <Text style={styles.processRefundDirectBtnText}>Process 100% Refund</Text>
            </Pressable>
          )}
        </View>

        {/* Footer Meta */}
        <View style={styles.cardFooter}>
          <Text style={styles.metaText}>
            Booking Ref: {item.booking_id} · Created: {formatDate(item.created_at)}
          </Text>
          <Text style={styles.metaText}>
            Source: {item.source === "offline" ? "Vendor Direct" : "RoyalLagn Online"}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ResponsiveContainer style={styles.container}>
        <AdminPageHeader
          title="Bookings"
          subtitle="Real-time monitoring of customer-to-vendor booking connection requests, admin verification, and platform commissions"
          action={
            <Pressable
              accessibilityLabel="Refresh bookings"
              disabled={refreshing}
              onPress={() => void loadData(true)}
              style={styles.refreshBtn}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={royalAdmin.navy} />
              ) : (
                <RefreshCw size={18} color={royalAdmin.navy} />
              )}
            </Pressable>
          }
        />

        {/* FINANCIAL KPI OVERVIEW (PLATFORM COMMISSION SUMMARY) */}
        <View style={[styles.kpiRow, desktop && styles.kpiRowDesktop]}>
          <View style={[styles.kpiCard, desktop && styles.kpiCardDesktop, { backgroundColor: royalAdmin.blueSoft }]}>
            <View style={styles.kpiIconWrap}>
              <Ticket size={18} color={royalAdmin.blue} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>Gross Booking Volume</Text>
              <Text style={styles.kpiValue}>{money(financials.totalGross)}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, desktop && styles.kpiCardDesktop, { backgroundColor: royalAdmin.amberSoft }]}>
            <View style={styles.kpiIconWrap}>
              <Wallet size={18} color={royalAdmin.amber} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>Booking Fees Collected</Text>
              <Text style={styles.kpiValue}>{money(financials.totalFeesCollected)}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, desktop && styles.kpiCardDesktop, { backgroundColor: royalAdmin.greenSoft }]}>
            <View style={styles.kpiIconWrap}>
              <Gift size={18} color={royalAdmin.green} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>Referral Rewards</Text>
              <Text style={styles.kpiValue}>{money(financials.totalReferral)}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, desktop && styles.kpiCardDesktop, { backgroundColor: "#FDF2F8" }]}>
            <View style={styles.kpiIconWrap}>
              <IndianRupee size={18} color="#BE185D" />
            </View>
            <View>
              <Text style={styles.kpiLabel}>RoyalLagn Cut</Text>
              <Text style={[styles.kpiValue, { color: "#BE185D" }]}>{money(financials.totalRoyallagn)}</Text>
            </View>
          </View>
        </View>

        {/* 5 PRIMARY WORKFLOW TABS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroller}
          contentContainerStyle={styles.tabsContainer}
        >
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Admin Verification tab"
            accessibilityState={{ selected: activeTab === "admin_pending" }}
            onPress={() => setActiveTab("admin_pending")}
            style={[styles.tabButton, activeTab === "admin_pending" && styles.tabButtonActive]}
          >
            <Clock size={16} color={activeTab === "admin_pending" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
            <Text style={[styles.tabText, activeTab === "admin_pending" && styles.tabTextActive]}>
              Admin Verification
            </Text>
            <View style={[styles.tabBadge, activeTab === "admin_pending" ? styles.tabBadgeActiveAmber : styles.tabBadgeInactive]}>
              <Text style={[styles.tabBadgeText, activeTab === "admin_pending" && styles.tabBadgeTextActiveAmber]}>
                {counts.admin_pending}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Vendor Pending tab"
            accessibilityState={{ selected: activeTab === "vendor_pending" }}
            onPress={() => setActiveTab("vendor_pending")}
            style={[styles.tabButton, activeTab === "vendor_pending" && styles.tabButtonActive]}
          >
            <Building2 size={16} color={activeTab === "vendor_pending" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
            <Text style={[styles.tabText, activeTab === "vendor_pending" && styles.tabTextActive]}>
              Vendor Pending
            </Text>
            <View style={[styles.tabBadge, activeTab === "vendor_pending" ? styles.tabBadgeActiveAmber : styles.tabBadgeInactive]}>
              <Text style={[styles.tabBadgeText, activeTab === "vendor_pending" && styles.tabBadgeTextActiveAmber]}>
                {counts.vendor_pending}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Confirmed bookings tab"
            accessibilityState={{ selected: activeTab === "confirmed" }}
            onPress={() => setActiveTab("confirmed")}
            style={[styles.tabButton, activeTab === "confirmed" && styles.tabButtonActive]}
          >
            <CheckCircle2 size={16} color={activeTab === "confirmed" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
            <Text style={[styles.tabText, activeTab === "confirmed" && styles.tabTextActive]}>
              Confirmed
            </Text>
            <View style={[styles.tabBadge, activeTab === "confirmed" ? styles.tabBadgeActiveGreen : styles.tabBadgeInactive]}>
              <Text style={[styles.tabBadgeText, activeTab === "confirmed" && styles.tabBadgeTextActiveGreen]}>
                {counts.confirmed}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Cancelled bookings tab"
            accessibilityState={{ selected: activeTab === "cancelled" }}
            onPress={() => setActiveTab("cancelled")}
            style={[styles.tabButton, activeTab === "cancelled" && styles.tabButtonActive]}
          >
            <XCircle size={16} color={activeTab === "cancelled" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
            <Text style={[styles.tabText, activeTab === "cancelled" && styles.tabTextActive]}>
              Cancelled & Rejected
            </Text>
            <View style={[styles.tabBadge, activeTab === "cancelled" ? styles.tabBadgeActiveRed : styles.tabBadgeInactive]}>
              <Text style={[styles.tabBadgeText, activeTab === "cancelled" && styles.tabBadgeTextActiveRed]}>
                {counts.cancelled}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Refunds Queue tab"
            accessibilityState={{ selected: activeTab === "refunds" }}
            onPress={() => setActiveTab("refunds")}
            style={[styles.tabButton, activeTab === "refunds" && styles.tabButtonActive]}
          >
            <Receipt size={16} color={activeTab === "refunds" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
            <Text style={[styles.tabText, activeTab === "refunds" && styles.tabTextActive]}>
              Refunds Queue
            </Text>
            <View style={[styles.tabBadge, activeTab === "refunds" ? styles.tabBadgeActiveRed : styles.tabBadgeInactive]}>
              <Text style={[styles.tabBadgeText, activeTab === "refunds" && styles.tabBadgeTextActiveRed]}>
                {counts.refunds}
              </Text>
            </View>
          </Pressable>
        </ScrollView>

        {/* SEARCH BAR */}
        <View style={styles.searchBar}>
          <Search size={18} color={royalAdmin.navyMuted} />
          <TextInput
            placeholder="Search by customer name, phone, vendor, or ticket #..."
            placeholderTextColor={royalAdmin.navyMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery ? (
            <Pressable accessibilityLabel="Clear search" onPress={() => setSearchQuery("")}>
              <X size={16} color={royalAdmin.navyMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* LIST OF BOOKINGS */}
        {loading && !refreshing ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={royalAdmin.navy} />
            <Text style={styles.loadingText}>Loading bookings...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredBookings}
            keyExtractor={(item) => item.id}
            renderItem={renderBookingCard}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: width >= 768 ? 28 : 100 }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void loadData(true)}
                tintColor={royalAdmin.navy}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ticket size={42} color={royalAdmin.navyMuted} />
                <Text style={styles.emptyTitle}>
                  No {activeTab} bookings found
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? "Try adjusting your search terms"
                    : `There are currently no bookings in the ${activeTab} stage.`}
                </Text>
              </View>
            }
          />
        )}
      </ResponsiveContainer>

      {/* PROCESS REFUND MODAL */}
      <Modal
        visible={!!refundBooking}
        transparent
        animationType="fade"
        onRequestClose={() => setRefundBooking(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Process Client Refund</Text>
                <Text style={styles.modalSubtitle}>
                  Ticket #{refundBooking?.ticket_id} · {money(refundBooking?.advance_amount)}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close refund modal"
                onPress={() => setRefundBooking(null)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={royalAdmin.navyDeep} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalNotice}>
                Customer: <Text style={{ fontWeight: "700" }}>{refundBooking?.customer_name}</Text>
                {"\n"}Phone: {refundBooking?.customer_phone}
                {"\n"}Vendor: {refundBooking?.vendor_name}
              </Text>

              <Text style={styles.inputLabel}>Transaction / UTR Reference (Optional)</Text>
              <TextInput
                placeholder="e.g. UPI / NEFT Ref #123456789"
                placeholderTextColor={royalAdmin.navyMuted}
                value={refundTxnRef}
                onChangeText={setRefundTxnRef}
                style={styles.modalInput}
              />

              <Text style={styles.inputLabel}>Admin Settlement Notes</Text>
              <TextInput
                placeholder="Notes for ledger audit trail..."
                placeholderTextColor={royalAdmin.navyMuted}
                value={refundNotes}
                onChangeText={setRefundNotes}
                multiline
                numberOfLines={3}
                style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
              />

              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  onPress={() => setRefundBooking(null)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Confirm Refund"
                  disabled={processingRefund}
                  onPress={() => void handleProcessRefund()}
                  style={styles.modalConfirmBtn}
                >
                  {processingRefund ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Confirm Refund Paid</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADMIN CANCEL & REFUND MODAL */}
      <Modal
        visible={!!adminCancelBooking}
        transparent
        animationType="fade"
        onRequestClose={() => setAdminCancelBooking(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Cancel Booking & Refund</Text>
                <Text style={styles.modalSubtitle}>
                  Ticket #{adminCancelBooking?.ticket_id} · 100% Refund ({money(adminCancelBooking?.booking_fee_amount ?? adminCancelBooking?.advance_amount)})
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close cancel modal"
                onPress={() => setAdminCancelBooking(null)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={royalAdmin.navyDeep} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalNotice}>
                Customer: <Text style={{ fontWeight: "700" }}>{adminCancelBooking?.customer_name}</Text>
                {"\n"}Phone: {adminCancelBooking?.customer_phone}
                {"\n"}Vendor: {adminCancelBooking?.vendor_name}
                {"\n\n"}Cancelling this booking queues a 100% refund of the booking fee and notifies both parties.
              </Text>

              <Text style={styles.inputLabel}>Admin Cancellation Reason</Text>
              <TextInput
                placeholder="Reason for admin cancellation..."
                placeholderTextColor={royalAdmin.navyMuted}
                value={adminCancelReason}
                onChangeText={setAdminCancelReason}
                multiline
                numberOfLines={3}
                style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
              />

              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  onPress={() => setAdminCancelBooking(null)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelText}>Dismiss</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Confirm Cancellation"
                  disabled={adminCancelling}
                  onPress={() => void handleAdminCancel()}
                  style={[styles.modalConfirmBtn, { backgroundColor: royalAdmin.rose }]}
                >
                  {adminCancelling ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Cancel & Queue 100% Refund</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <BookingDetailsModal
        visible={Boolean(selectedDetailsBookingRef)}
        bookingRef={selectedDetailsBookingRef || ""}
        role="admin"
        onClose={() => setSelectedDetailsBookingRef(null)}
        onBookingUpdated={() => void loadData(true)}
      />

      <AdminFooter activeTab="dashboard" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },
  container: {
    flex: 1,
    maxWidth: 1600,
    alignSelf: "center",
    width: "100%",
  },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: royalAdmin.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiRow: {
    flexDirection: "column",
    gap: 12,
    marginTop: 14,
  },
  kpiRowDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  kpiCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: royalAdmin.border,
  },
  kpiCardDesktop: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
  },
  kpiIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 12,
  },
  kpiValue: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 20,
    marginTop: 2,
  },
  tabsScroller: {
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: royalAdmin.border,
    flexGrow: 0,
  },
  tabsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    minHeight: 44,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: royalAdmin.border,
    shadowColor: royalAdmin.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  tabText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 14,
  },
  tabTextActive: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
  },
  tabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeInactive: {
    backgroundColor: "rgba(0, 32, 91, 0.06)",
  },
  tabBadgeActiveAmber: {
    backgroundColor: royalAdmin.amberSoft,
  },
  tabBadgeActiveGreen: {
    backgroundColor: royalAdmin.greenSoft,
  },
  tabBadgeActiveRed: {
    backgroundColor: royalAdmin.roseSoft,
  },
  tabBadgeText: {
    fontFamily: fonts.sans.bold,
    fontSize: 12,
    color: royalAdmin.navyMuted,
  },
  tabBadgeTextActiveAmber: {
    color: royalAdmin.amber,
  },
  tabBadgeTextActiveGreen: {
    color: royalAdmin.green,
  },
  tabBadgeTextActiveRed: {
    color: royalAdmin.rose,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: royalAdmin.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  searchInput: {
    flex: 1,
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    padding: 0,
  },
  list: { flex: 1, minHeight: 0 },
  listContent: {
    paddingTop: 14,
    gap: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: royalAdmin.border,
    padding: 18,
    shadowColor: royalAdmin.navy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F8",
    paddingBottom: 12,
    marginBottom: 14,
  },
  ticketBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 32, 91, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ticketIdText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  relationBox: {
    backgroundColor: "#F8FAFD",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3EBF4",
    padding: 14,
    gap: 12,
  },
  relationBoxDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partyColumn: {
    flex: 1,
    gap: 5,
  },
  partyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  partyIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  partyRoleLabel: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  partyNameText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 15,
  },
  partyContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 42,
  },
  partyContactText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 12,
  },
  connectorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 6,
  },
  connectorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D3DFEC",
  },
  connectorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDF4FC",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connectorText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailLabel: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
  },
  detailValue: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  financialsBox: {
    flexDirection: "row",
    backgroundColor: "#FFFDF9",
    borderWidth: 1,
    borderColor: "#F4EBD9",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  financialCol: {
    flex: 1,
    alignItems: "center",
  },
  finDivider: {
    width: 1,
    backgroundColor: "#EFE5CE",
  },
  finLabel: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    marginBottom: 4,
  },
  finTotal: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 15,
  },
  advanceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  paidBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  paidBadgeText: {
    color: "#166534",
    fontFamily: fonts.sans.bold,
    fontSize: 9,
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  pendingBadgeText: {
    color: "#B45309",
    fontFamily: fonts.sans.bold,
    fontSize: 9,
  },
  finAdvance: {
    color: "#15803D",
    fontFamily: fonts.sans.bold,
    fontSize: 15,
  },
  finDue: {
    color: "#B45309",
    fontFamily: fonts.sans.bold,
    fontSize: 15,
  },
  referralBanner: {
    backgroundColor: "#FEF9EE",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
    marginTop: 14,
    gap: 10,
  },
  referralHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  referralCodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  referralCodeLabel: {
    color: "#92400E",
    fontFamily: fonts.sans.medium,
    fontSize: 12,
  },
  referralCodePill: {
    backgroundColor: "#FDE68A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  referralCodeText: {
    color: "#78350F",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  referralStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  referralStatusText: {
    fontFamily: fonts.sans.bold,
    fontSize: 11,
  },
  referralDetailsRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  referralMetric: {
    flex: 1,
    alignItems: "center",
  },
  referralMetricLabel: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    marginBottom: 2,
  },
  referralMetricValue: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  referralMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#F1E5D1",
  },
  cancellationBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    padding: 12,
    marginTop: 14,
    gap: 6,
  },
  cancellationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancellationTitle: {
    color: royalAdmin.rose,
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  rejectionReasonText: {
    color: "#7F1D1D",
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    fontStyle: "italic",
  },
  refundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  refundStatusText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.medium,
    fontSize: 12,
  },
  processRefundBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: royalAdmin.rose,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  processRefundBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  refundCompletedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  refundCompletedText: {
    color: "#166534",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    marginTop: 14,
  },
  metaText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 11,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 16,
  },
  emptySubtitle: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    width: "100%",
    maxWidth: 480,
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F8",
    paddingBottom: 14,
  },
  modalTitle: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.serif.bold,
    fontSize: 18,
  },
  modalSubtitle: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    paddingTop: 14,
    gap: 10,
  },
  modalNotice: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: "#F8FAFD",
    padding: 12,
    borderRadius: 10,
  },
  inputLabel: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 12,
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: royalAdmin.border,
    borderRadius: 10,
    padding: 10,
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    backgroundColor: "#FFFFFF",
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: royalAdmin.border,
  },
  modalCancelText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: royalAdmin.blue,
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  emergencyAdminBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  emergencyAdminTitle: {
    fontFamily: fonts.sans.bold,
    fontSize: 12,
    color: "#B91C1C",
  },
  emergencyAdminReason: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: "#7F1D1D",
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EDF2F8",
  },
  viewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: royalAdmin.navy,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  viewDetailsBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  forwardToVendorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#15803D",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  forwardToVendorBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  adminCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  adminCancelBtnText: {
    color: "#DC2626",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  adminTicketBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 32, 91, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  adminTicketBtnText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  processRefundDirectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: royalAdmin.rose,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  processRefundDirectBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.sans.bold,
    fontSize: 12,
  },
  flex: {
    flex: 1,
  },
});
