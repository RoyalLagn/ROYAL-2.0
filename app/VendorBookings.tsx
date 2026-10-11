import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Filter,
  MessageCircle,
  Package,
  Phone,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, typeLeading } from "@/constants/typography";
import {
  VendorBookingService,
  type BookingStatus,
  type VendorBooking,
} from "@/services/vendorBookings";
import { setVendorAvailabilityException } from "@/services/vendorAvailability";
import { ReferralCommissionService } from "@/services/referralCommission";
import { CustomerInboxService } from "@/services/inboxNotifications";

const PINK = brandPalette.light.primary;
const GREEN = "#16A34A";
const GOLD = "#D97706";
const RED = "#DC2626";

type TabKey = "pending" | "confirmed" | "cancelled";

const money = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const getDaysUntil = (dateStr: string) => {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const eventTime = new Date(year, month - 1, day).getTime();
    const nowTime = new Date().setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((eventTime - nowTime) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "Event completed";
    if (diffDays === 0) return "Event is TODAY";
    if (diffDays === 1) return "Event tomorrow";
    return `Event in ${diffDays} days`;
  } catch {
    return "";
  }
};

export default function VendorBookings() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 760;
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const isDark = colorScheme === "dark";
  const { data: workspaceData, refresh: refreshWorkspace } = useVendorWorkspace();

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (params.tab === "confirmed" || params.tab === "cancelled" || params.tab === "pending") {
      return params.tab;
    }
    return "pending";
  });

  useEffect(() => {
    if (params.tab === "confirmed" || params.tab === "cancelled" || params.tab === "pending") {
      setActiveTab(params.tab);
    }
  }, [params.tab]);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Reject modal state
  const [rejectingBooking, setRejectingBooking] = useState<VendorBooking | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!workspaceData.vendor?.id) return;
    setLoading(true);
    try {
      const list = await VendorBookingService.getVendorBookings(workspaceData.vendor.id);
      setBookings(list);
    } catch (err) {
      console.warn("Could not load vendor bookings", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceData.vendor?.id]);

  useEffect(() => {
    void loadData();
    if (!workspaceData.vendor?.id) return;
    const unsubscribe = VendorBookingService.subscribeToBookings(() => {
      void loadData();
    }, { vendorId: workspaceData.vendor.id });
    return unsubscribe;
  }, [loadData, workspaceData.vendor?.id]);

  const counts = useMemo(() => ({
    pending: bookings.filter((b) => b.booking_status === "pending_vendor_confirmation" || b.booking_status === "pending").length,
    confirmed: bookings.filter((b) => b.booking_status === "confirmed").length,
    cancelled: bookings.filter((b) => b.booking_status === "cancelled_by_vendor" || b.booking_status === "cancelled" || b.booking_status === "cancelled_by_customer").length,
  }), [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((item) => {
      if (activeTab === "pending") {
        if (item.booking_status !== "pending_vendor_confirmation" && item.booking_status !== "pending") return false;
      } else if (activeTab === "confirmed") {
        if (item.booking_status !== "confirmed") return false;
      } else if (activeTab === "cancelled") {
        if (item.booking_status !== "cancelled_by_vendor" && item.booking_status !== "cancelled" && item.booking_status !== "cancelled_by_customer") return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        item.customer_name.toLowerCase().includes(q) ||
        item.customer_phone.includes(q) ||
        item.package_title.toLowerCase().includes(q) ||
        item.ticket_id.toLowerCase().includes(q)
      );
    });
  }, [activeTab, bookings, searchQuery]);

  const handleAccept = async (item: VendorBooking) => {
    if (!workspaceData.vendor?.id) return;
    setBusyActionId(item.id);
    try {
      // 1. Atomically confirm booking via RPC (issues ticket, notifies customer, reserves date in ledger)
      // CORRECTION 1: DO NOT write manual blocked row into vendor_availability
      await VendorBookingService.confirmBooking(item.id);

      // 2. Process referral commission on Total Booking Value
      await ReferralCommissionService.processBookingConfirmation(item);

      await loadData();
      void refreshWorkspace();
      Alert.alert(
        "Booking Confirmed!",
        `Confirmed for ${item.customer_name}. Official E-Ticket #${item.ticket_id} has been issued and date ${formatDate(item.event_date)} is reserved on your calendar.`
      );
    } catch (err) {
      Alert.alert("Action failed", err instanceof Error ? err.message : "Unable to accept booking.");
    } finally {
      setBusyActionId(null);
    }
  };

  const submitRejection = async () => {
    if (!rejectingBooking) return;
    setRejectSubmitting(true);
    try {
      // Atomically cancel booking via RPC: sets cancelled_by_vendor, creates booking_refund_requests row,
      // sets refund_status = 'pending', dispatches 72h refund SLA notification, and releases availability.
      // CORRECTION 1 & 3: DO NOT touch vendor_availability manually
      await VendorBookingService.cancelBooking(
        rejectingBooking.id,
        rejectReason.trim() || "Declined by vendor"
      );

      const clientName = rejectingBooking.customer_name;
      const advAmt = money(rejectingBooking.advance_amount);
      const customerRefundNotice = "Your booking has been canceled by the vendor. Sorry for the inconvenience, your paid amount will be credited back to your payment method in next 72 hours.";

      setRejectingBooking(null);
      setRejectReason("");
      await loadData();
      void refreshWorkspace();
      Alert.alert(
        "Booking Cancelled",
        `Booking for ${clientName} has been cancelled. The customer has been notified: "${customerRefundNotice}"\n\nRefund of ${advAmt} queued for Admin processing.`
      );
    } catch (err) {
      Alert.alert("Action failed", err instanceof Error ? err.message : "Unable to decline booking.");
    } finally {
      setRejectSubmitting(false);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={workspaceData.notifications.filter((n) => !n.is_read).length} />

      <FlatList
        data={filteredBookings}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, desktop && styles.desktopContent]}
        ListHeaderComponent={
          <>
            <View style={styles.topRow}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: colors.pink }]}>DIRECT BOOKING PLATFORM</Text>
                <Text style={[styles.title, { color: colors.text }]}>Booking Confirmations</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  Review pending 30% advance bookings and manage confirmed client tickets.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Refresh bookings"
                onPress={() => void loadData()}
                style={[styles.refreshIconBtn, { backgroundColor: colors.surfaceSoft }]}
              >
                <RefreshCw size={17} color={colors.pink} />
              </Pressable>
            </View>

            {/* Search Input */}
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Search size={18} color={colors.pink} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by client name, mobile or ticket #..."
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <X size={17} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            {/* The 3 Mandatory Tabs */}
            <View style={[styles.tabsWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Tab 1: Pending Confirmation */}
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="Pending Confirmation"
                onPress={() => setActiveTab("pending")}
                style={[styles.tabItem, activeTab === "pending" && styles.tabItemActive]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.tabLabel, activeTab === "pending" && styles.tabLabelActive]}
                >
                  {desktop ? "Pending Confirmation" : "Pending"}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    activeTab === "pending"
                      ? styles.countBadgeActive
                      : isDark
                      ? styles.countBadgePendingDark
                      : styles.countBadgePendingLight,
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      activeTab === "pending"
                        ? styles.countBadgeTextActive
                        : isDark
                        ? styles.countBadgePendingTextDark
                        : styles.countBadgePendingTextLight,
                    ]}
                  >
                    {counts.pending}
                  </Text>
                </View>
              </Pressable>

              {/* Tab 2: Confirmed bookings */}
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="Confirmed bookings"
                onPress={() => setActiveTab("confirmed")}
                style={[styles.tabItem, activeTab === "confirmed" && styles.tabItemActive]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.tabLabel, activeTab === "confirmed" && styles.tabLabelActive]}
                >
                  {desktop ? "Confirmed Bookings" : "Confirmed"}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    activeTab === "confirmed"
                      ? styles.countBadgeActive
                      : isDark
                      ? styles.countBadgeConfirmedDark
                      : styles.countBadgeConfirmedLight,
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      activeTab === "confirmed"
                        ? styles.countBadgeTextActive
                        : isDark
                        ? styles.countBadgeConfirmedTextDark
                        : styles.countBadgeConfirmedTextLight,
                    ]}
                  >
                    {counts.confirmed}
                  </Text>
                </View>
              </Pressable>

              {/* Tab 3: Cancelled bookings */}
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel="Cancelled bookings"
                onPress={() => setActiveTab("cancelled")}
                style={[styles.tabItem, activeTab === "cancelled" && styles.tabItemActive]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.tabLabel, activeTab === "cancelled" && styles.tabLabelActive]}
                >
                  {desktop ? "Cancelled Bookings" : "Cancelled"}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    activeTab === "cancelled"
                      ? styles.countBadgeActive
                      : isDark
                      ? styles.countBadgeCancelledDark
                      : styles.countBadgeCancelledLight,
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      activeTab === "cancelled"
                        ? styles.countBadgeTextActive
                        : isDark
                        ? styles.countBadgeCancelledTextDark
                        : styles.countBadgeCancelledTextLight,
                    ]}
                  >
                    {counts.cancelled}
                  </Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.tabHeadingRow}>
              <Text style={[styles.tabSectionTitle, { color: colors.text }]}>
                {activeTab === "pending"
                  ? "Bookings Pending For Confirmation"
                  : activeTab === "confirmed"
                  ? "Confirmed Bookings"
                  : "Cancelled Bookings"}
              </Text>
              <View style={[styles.tabSectionCountBadge, { backgroundColor: colors.surfaceSoft }]}>
                <Text style={[styles.tabSectionCount, { color: colors.pink }]}>
                  {filteredBookings.length} {filteredBookings.length === 1 ? "record" : "records"}
                </Text>
              </View>
            </View>
          </>
        }
        renderItem={({ item }) => {
          const isBusy = busyActionId === item.id;
          const countdown = getDaysUntil(item.event_date);

          return (
            <View
              style={[
                styles.bookingCard,
                { backgroundColor: colors.surface, borderColor: activeTab === "confirmed" ? GREEN : activeTab === "pending" ? GOLD : colors.border },
              ]}
            >
              {/* Card Top Strip */}
              <View style={styles.cardHeader}>
                <View style={styles.flex}>
                  <View style={styles.tagRow}>
                    <View style={styles.ticketPill}>
                      <Text selectable style={styles.ticketPillText}>#{item.ticket_id}</Text>
                    </View>
                    {item.source === "offline" ? (
                      <View style={styles.offlinePill}>
                        <Text style={styles.offlinePillText}>MANUAL / OFFLINE</Text>
                      </View>
                    ) : null}
                    {countdown ? (
                      <View style={[styles.countdownPill, { backgroundColor: colors.surfaceSoft }]}>
                        <Clock size={11} color={colors.pink} />
                        <Text style={[styles.countdownText, { color: colors.pink }]}>{countdown}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.clientName, { color: colors.text }]}>{item.customer_name}</Text>
                  <Text style={[styles.eventOccasion, { color: colors.muted }]}>
                    {item.event_type} · {formatDate(item.event_date)}
                  </Text>
                </View>

                {/* Call & WhatsApp buttons */}
                {item.customer_phone ? (
                  <View style={styles.clientContactButtons}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${item.customer_name}`}
                      onPress={() => void Linking.openURL(`tel:${item.customer_phone}`)}
                      style={[styles.contactCircle, { backgroundColor: colors.surfaceSoft }]}
                    >
                      <Phone size={16} color={colors.pink} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`WhatsApp ${item.customer_name}`}
                      onPress={() => {
                        const clean = item.customer_phone.replace(/\D/g, "");
                        const phone = clean.startsWith("91") ? clean : `91${clean}`;
                        void Linking.openURL(`https://api.whatsapp.com/send?phone=${phone}&text=Hi%20${encodeURIComponent(item.customer_name)},%20regarding%20your%20RoyalLagn%20booking%20#${item.ticket_id}`);
                      }}
                      style={[styles.contactCircle, { backgroundColor: "#DCFCE7" }]}
                    >
                      <MessageCircle size={16} color="#15803D" />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {/* Package & Addons breakdown */}
              <View style={[styles.packageDetailsStrip, { backgroundColor: colors.surfaceSoft }]}>
                <View style={styles.flex}>
                  <Text style={[styles.pkgTitle, { color: colors.text }]}>{item.package_title}</Text>
                  {item.add_ons && item.add_ons.length > 0 ? (
                    <Text style={[styles.addonsText, { color: colors.muted }]}>
                      + {item.add_ons.length} {item.add_ons.length === 1 ? "Add-on" : "Add-ons"} ({item.add_ons.map((a) => a.title).join(", ")})
                    </Text>
                  ) : null}
                  {item.special_notes ? (
                    <Text style={[styles.notesText, { color: colors.muted }]}>Note: {item.special_notes}</Text>
                  ) : null}
                </View>
              </View>

              {/* Financial Split Grid */}
              <View style={styles.financeGrid}>
                <View style={styles.finTile}>
                  <Text style={[styles.finLabel, { color: colors.muted }]}>TOTAL</Text>
                  <Text style={[styles.finAmount, { color: colors.text }]}>{money(item.total_amount)}</Text>
                </View>
                <View style={[styles.finTile, styles.finTileAdvance]}>
                  <Text style={styles.finLabelAdv}>30% ADVANCE</Text>
                  <Text style={styles.finAmountAdv}>{money(item.advance_amount)}</Text>
                </View>
                <View style={[styles.finTile, styles.finTileDue]}>
                  <Text style={styles.finLabelDue}>70% DUE AT SITE</Text>
                  <Text style={styles.finAmountDue}>{money(item.due_amount)}</Text>
                </View>
              </View>

              {/* Card Footer Actions according to Tab */}
              {activeTab === "pending" ? (
                <View style={styles.cardActionsRow}>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => setRejectingBooking(item)}
                    style={[styles.declineBtn, isBusy && styles.btnDisabled]}
                  >
                    <XCircle size={16} color={RED} />
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => void handleAccept(item)}
                    style={[styles.acceptBtn, isBusy && styles.btnDisabled]}
                  >
                    {isBusy ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} color="#FFF" />
                        <Text style={styles.acceptBtnText}>Accept & Confirm</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : activeTab === "confirmed" ? (
                <View style={styles.cardActionsRow}>
                  <Pressable
                    onPress={() => router.push({ pathname: "/ticket", params: { booking_id: item.booking_id, ticket_id: item.ticket_id } })}
                    style={styles.viewTicketBtn}
                  >
                    <ReceiptText size={16} color="#FFF" />
                    <Text style={styles.viewTicketBtnText}>View Luxury E-Ticket</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRejectingBooking(item)}
                    style={styles.cancelConfirmedBtn}
                  >
                    <Text style={styles.cancelConfirmedText}>Cancel Booking</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.cancelledContainer}>
                  <View style={styles.cancelledStrip}>
                    <AlertCircle size={14} color={RED} />
                    <Text style={styles.cancelledReasonText}>
                      Reason: {item.rejection_reason || "Declined by vendor"}
                    </Text>
                  </View>
                  <View style={styles.refundInfoRow}>
                    <View style={[styles.refundBadge, { backgroundColor: item.refund_status === "refunded" ? "#DCFCE7" : "#FEF3C7" }]}>
                      <Text style={[styles.refundBadgeText, { color: item.refund_status === "refunded" ? "#166534" : "#92400E" }]}>
                        {item.refund_status === "refunded" ? "● Refund Completed" : "● Refund Pending (Credited within 72 hrs)"}
                      </Text>
                    </View>
                    <Text style={[styles.refundAmountText, { color: colors.text }]}>
                      Advance Refundable: {money(item.advance_amount)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator color={PINK} size="large" />
              <Text style={[styles.emptyText, { color: colors.muted }]}>Loading booking requests…</Text>
            </View>
          ) : (
            <View
              style={[
                styles.emptyBox,
                {
                  backgroundColor: isDark ? colors.surface : "#FFF9FB",
                  borderColor: isDark ? colors.border : "#FFE0EC",
                },
              ]}
            >
              <View
                style={[
                  styles.emptyIconCircle,
                  {
                    backgroundColor:
                      activeTab === "pending"
                        ? isDark
                          ? "rgba(22, 163, 74, 0.15)"
                          : "#DCFCE7"
                        : activeTab === "confirmed"
                        ? isDark
                          ? "rgba(231, 60, 120, 0.15)"
                          : "#FFE4EE"
                        : isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "#F1F5F9",
                  },
                ]}
              >
                {activeTab === "pending" ? (
                  <ShieldCheck size={32} color={isDark ? "#4ADE80" : GREEN} />
                ) : activeTab === "confirmed" ? (
                  <CheckCircle2 size={32} color={colors.pink} />
                ) : (
                  <FileText size={32} color={colors.muted} />
                )}
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {activeTab === "pending"
                  ? "All Caught Up!"
                  : activeTab === "confirmed"
                  ? "No Confirmed Bookings Yet"
                  : "No Cancelled Bookings"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {activeTab === "pending"
                  ? "There are currently no booking requests waiting for your confirmation."
                  : activeTab === "confirmed"
                  ? "Confirmed customer bookings will appear here with instant E-Tickets."
                  : "Cancelled or declined bookings will be archived here."}
              </Text>
            </View>
          )
        }
      />

      {/* Reject Modal */}
      <Modal
        visible={Boolean(rejectingBooking)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingBooking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Decline Booking Request</Text>
              <Pressable onPress={() => setRejectingBooking(null)}>
                <X size={20} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.modalCopy, { color: colors.muted }]}>
              Please enter the reason for cancelling {rejectingBooking?.customer_name}'s booking.
            </Text>
            <View style={{ backgroundColor: "#FEF3C7", padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: "#D97706" }}>
              <Text style={{ fontSize: 12, color: "#92400E", fontWeight: "600", lineHeight: 16 }}>
                Customer Notice: The 30% advance ({money(rejectingBooking?.advance_amount)}) will be refunded to the customer within 72 hours.
              </Text>
            </View>

            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Date already booked for another event / Pricing conflict..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[styles.modalInput, { backgroundColor: colors.surfaceSoft, borderColor: colors.border, color: colors.text }]}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRejectingBooking(null)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={rejectSubmitting}
                onPress={submitRejection}
                style={styles.modalConfirmBtn}
              >
                {rejectSubmitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm Decline</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 110, gap: 14 },
  desktopContent: { maxWidth: 840, alignSelf: "center", width: "100%", paddingHorizontal: 24 },
  flex: { flex: 1, minWidth: 0 },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  title: { fontSize: typeScale.sectionTitle, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  subtitle: { fontSize: typeScale.caption, marginTop: 4, lineHeight: typeLeading.caption },
  refreshIconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 46 },
  searchInput: { flex: 1, fontSize: typeScale.metadata, fontWeight: "600" },

  tabsWrap: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    alignItems: "center",
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: PINK,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  countBadgePendingLight: {
    backgroundColor: "#FEF3C7",
  },
  countBadgePendingDark: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
  },
  countBadgePendingTextLight: {
    color: "#B45309",
  },
  countBadgePendingTextDark: {
    color: "#FDE68A",
  },
  countBadgeConfirmedLight: {
    backgroundColor: "#DCFCE7",
  },
  countBadgeConfirmedDark: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  countBadgeConfirmedTextLight: {
    color: "#15803D",
  },
  countBadgeConfirmedTextDark: {
    color: "#6EE7B7",
  },
  countBadgeCancelledLight: {
    backgroundColor: "#F1F5F9",
  },
  countBadgeCancelledDark: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  countBadgeCancelledTextLight: {
    color: "#64748B",
  },
  countBadgeCancelledTextDark: {
    color: "#9CA3AF",
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  countBadgeTextActive: {
    color: "#FFFFFF",
  },

  tabHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingHorizontal: 2,
  },
  tabSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  tabSectionCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tabSectionCount: {
    fontSize: 11,
    fontWeight: "700",
  },

  bookingCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  ticketPill: { backgroundColor: "#F3E8FF", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  ticketPillText: { color: "#7E22CE", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  offlinePill: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  offlinePillText: { color: "#B45309", fontSize: 9, fontWeight: "800" },
  countdownPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  countdownText: { fontSize: 10, fontWeight: "700" },
  clientName: { fontSize: typeScale.sectionTitle, fontWeight: "700" },
  eventOccasion: { fontSize: 12, marginTop: 2 },

  clientContactButtons: { flexDirection: "row", gap: 6 },
  contactCircle: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  packageDetailsStrip: { padding: 10, borderRadius: 12 },
  pkgTitle: { fontSize: 13, fontWeight: "700" },
  addonsText: { fontSize: 11, marginTop: 2 },
  notesText: { fontSize: 11, fontStyle: "italic", marginTop: 2 },

  financeGrid: { flexDirection: "row", gap: 8 },
  finTile: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center" },
  finLabel: { fontSize: 9, fontWeight: "700" },
  finAmount: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  finTileAdvance: { backgroundColor: "#DCFCE7" },
  finLabelAdv: { color: "#15803D", fontSize: 9, fontWeight: "800" },
  finAmountAdv: { color: "#15803D", fontSize: 14, fontWeight: "900", marginTop: 2 },
  finTileDue: { backgroundColor: "#FFF7ED" },
  finLabelDue: { color: "#9A3412", fontSize: 9, fontWeight: "800" },
  finAmountDue: { color: "#C2410C", fontSize: 14, fontWeight: "900", marginTop: 2 },

  cardActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  declineBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5" },
  declineBtnText: { color: RED, fontSize: typeScale.caption, fontWeight: "700" },
  acceptBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: PINK },
  acceptBtnText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "800" },
  btnDisabled: { opacity: 0.6 },

  viewTicketBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: PINK },
  viewTicketBtnText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "800" },

  cancelledStrip: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 10, backgroundColor: "#FEE2E2" },
  cancelledReasonText: { color: RED, fontSize: 11, fontWeight: "600" },

  emptyBox: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 6,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  emptySubtitle: { fontSize: typeScale.caption, textAlign: "center", maxWidth: 340, lineHeight: 19 },
  emptyText: { fontSize: typeScale.caption },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { width: "100%", maxWidth: 460, borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  modalCopy: { fontSize: typeScale.caption, lineHeight: 18 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: "top", fontSize: typeScale.metadata },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  modalCancelText: { fontSize: typeScale.caption, fontWeight: "700" },
  modalConfirmBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 12, backgroundColor: RED },
  modalConfirmText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  cancelledContainer: { gap: 8, marginTop: 4 },
  refundInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 },
  refundBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  refundBadgeText: { fontSize: 11, fontWeight: "700" },
  refundAmountText: { fontSize: 11, fontWeight: "700" },
  cancelConfirmedBtn: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5", justifyContent: "center", alignItems: "center" },
  cancelConfirmedText: { color: RED, fontSize: typeScale.caption, fontWeight: "700" },
});
