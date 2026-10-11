import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  LogIn,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  XCircle,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, typeLeading } from "@/constants/typography";
import {
  VendorBookingService,
  type VendorBooking,
} from "@/services/vendorBookings";

const PINK = brandPalette.light.primary;
const GREEN = "#16A34A";
const GOLD = "#D97706";
const RED = "#DC2626";

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

type HistoryTab = "pending" | "confirmed" | "cancelled";

export default function CustomerBookingsScreen() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const { session, profile, isPublicAuthenticated, loading: authLoading } = usePublicAuth();
  const user = session?.user;

  const [activeTab, setActiveTab] = useState<HistoryTab>("pending");
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  const toggleCardExpand = (cardKey: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }));
  };

  const palette = useMemo(() => ({
    background: dark ? "#070B14" : "#FFFFFF",
    surface: dark ? "#0E141F" : "#FFF9FB",
    surfaceSoft: dark ? "#1E2738" : "#FFF0F5",
    surfaceHighlight: dark ? "#2B1A24" : "#FEEFF4",
    text: dark ? "#F7F2F4" : "#171118",
    muted: dark ? "#AAA0A5" : "#6B6368",
    border: dark ? "#232C3D" : "#F1E1E7",
    cardBorder: dark ? "#3A2230" : "#F5D0DD",
  }), [dark]);

  const loadBookings = async () => {
    setLoadingBookings(true);
    try {
      const customerId = user?.id || profile?.id || null;
      const phone = profile?.phone || user?.phone || null;
      const list = await VendorBookingService.getCustomerBookings(customerId, phone);
      setBookings(list);
    } catch (err) {
      console.warn("Could not load customer bookings", err);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    void loadBookings();
    const customerId = user?.id || profile?.id || undefined;
    const unsubscribe = VendorBookingService.subscribeToBookings(() => {
      void loadBookings();
    }, customerId ? { customerId } : undefined);
    return unsubscribe;
  }, [user, profile]);

  const refreshAll = async () => {
    await loadBookings();
  };

  // Status counts for history badges
  const pendingCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.booking_status === "pending" ||
          b.booking_status === "pending_vendor_confirmation" ||
          b.booking_status === "pending_payment"
      ).length,
    [bookings]
  );

  const confirmedCount = useMemo(
    () =>
      bookings.filter(
        (b) => b.booking_status === "confirmed" || b.booking_status === "completed"
      ).length,
    [bookings]
  );

  const cancelledCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.booking_status === "cancelled" ||
          b.booking_status === "cancelled_by_vendor" ||
          b.booking_status === "cancelled_by_customer"
      ).length,
    [bookings]
  );

  // Filtered booking records according to active tab
  const filteredBookings = useMemo(() => {
    if (activeTab === "pending") {
      return bookings.filter(
        (b) =>
          b.booking_status === "pending" ||
          b.booking_status === "pending_vendor_confirmation" ||
          b.booking_status === "pending_payment"
      );
    }
    if (activeTab === "confirmed") {
      return bookings.filter(
        (b) => b.booking_status === "confirmed" || b.booking_status === "completed"
      );
    }
    if (activeTab === "cancelled") {
      return bookings.filter(
        (b) =>
          b.booking_status === "cancelled" ||
          b.booking_status === "cancelled_by_vendor" ||
          b.booking_status === "cancelled_by_customer"
      );
    }
    return [];
  }, [bookings, activeTab]);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: palette.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, desktop && styles.desktopContent]}
        stickyHeaderIndices={[1]}
      >
        {/* Child 0: Page Header & Quick Metrics */}
        <View style={styles.topSection}>
          {/* Page Header */}
          <View style={styles.header}>
            <View style={styles.flex}>
              <View style={styles.eyebrowRow}>
                <Ticket size={16} color={PINK} />
                <Text style={[styles.eyebrowText, { color: PINK }]}>CUSTOMER DASHBOARD</Text>
              </View>
              <Text style={[styles.title, { color: palette.text }]}>My Bookings & History</Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                Track your wedding bookings, 30% advance status, and access official luxury E-Tickets.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh bookings"
              onPress={refreshAll}
              style={[styles.refreshBtn, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <RefreshCw size={17} color={PINK} />
            </Pressable>
          </View>

          {/* Quick Metrics Ribbon (Desktop/Tablet) */}
          <View style={[styles.statsRibbon, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }]}>
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: palette.text }]}>{bookings.length}</Text>
              <Text style={[styles.statLabel, { color: palette.muted }]}>Total Bookings</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: GREEN }]}>{confirmedCount}</Text>
              <Text style={[styles.statLabel, { color: palette.muted }]}>Confirmed</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: GOLD }]}>{pendingCount}</Text>
              <Text style={[styles.statLabel, { color: palette.muted }]}>Pending</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: RED }]}>{cancelledCount}</Text>
              <Text style={[styles.statLabel, { color: palette.muted }]}>Cancelled</Text>
            </View>
          </View>

          {/* Guest reminder if not logged in */}
          {!isPublicAuthenticated && !authLoading && bookings.length > 0 ? (
            <View style={[styles.guestNotice, { backgroundColor: palette.surfaceHighlight, borderColor: PINK }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.guestNoticeTitle, { color: PINK }]}>Viewing Local Guest Bookings</Text>
                <Text style={[styles.guestNoticeDesc, { color: palette.muted }]}>
                  Log in with your mobile number to permanently sync bookings across your devices.
                </Text>
              </View>
              <Pressable
                onPress={() => router.push("/Login")}
                style={[styles.loginMiniBtn, { backgroundColor: PINK }]}
              >
                <LogIn size={13} color="#FFF" style={{ marginRight: 4 }} />
                <Text style={styles.loginMiniBtnText}>Sign In</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Child 1: Sticky Highlighted Filter Toggle Bar (3 Tabs in 1 Line) */}
        <View
          style={[
            styles.stickyTabsWrapper,
            { backgroundColor: palette.background },
            Platform.select({
              web: {
                position: "sticky",
                top: 0,
                zIndex: 50,
              } as any,
            }),
          ]}
        >
          <View style={[styles.tabsTrackContainer, { backgroundColor: palette.surface, borderColor: dark ? "#374151" : "#FBCFE8" }]}>
            <View style={styles.tabsRowContent}>
              {/* 1. Pending Confirmation */}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "pending" }}
                onPress={() => setActiveTab("pending")}
                style={({ pressed }) => [
                  styles.tabChip,
                  activeTab === "pending" ? styles.tabChipActivePending : styles.tabChipInactive,
                  pressed && activeTab !== "pending" && styles.tabChipPressed,
                ]}
              >
                <Clock
                  size={14}
                  color={activeTab === "pending" ? "#FFF" : GOLD}
                  strokeWidth={activeTab === "pending" ? 2.5 : 2.0}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabChipText,
                    activeTab === "pending" ? styles.tabChipTextActive : { color: palette.text },
                  ]}
                >
                  Pending ({pendingCount})
                </Text>
              </Pressable>

              {/* 2. Confirmed Bookings */}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "confirmed" }}
                onPress={() => setActiveTab("confirmed")}
                style={({ pressed }) => [
                  styles.tabChip,
                  activeTab === "confirmed" ? styles.tabChipActiveConfirmed : styles.tabChipInactive,
                  pressed && activeTab !== "confirmed" && styles.tabChipPressed,
                ]}
              >
                <CheckCircle2
                  size={14}
                  color={activeTab === "confirmed" ? "#FFF" : GREEN}
                  strokeWidth={activeTab === "confirmed" ? 2.5 : 2.0}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabChipText,
                    activeTab === "confirmed" ? styles.tabChipTextActive : { color: palette.text },
                  ]}
                >
                  Confirmed ({confirmedCount})
                </Text>
              </Pressable>

              {/* 3. Cancelled Bookings */}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "cancelled" }}
                onPress={() => setActiveTab("cancelled")}
                style={({ pressed }) => [
                  styles.tabChip,
                  activeTab === "cancelled" ? styles.tabChipActiveCancelled : styles.tabChipInactive,
                  pressed && activeTab !== "cancelled" && styles.tabChipPressed,
                ]}
              >
                <XCircle
                  size={14}
                  color={activeTab === "cancelled" ? "#FFF" : RED}
                  strokeWidth={activeTab === "cancelled" ? 2.5 : 2.0}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabChipText,
                    activeTab === "cancelled" ? styles.tabChipTextActive : { color: palette.text },
                  ]}
                >
                  Cancelled ({cancelledCount})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Child 2: List Content */}
        <View style={styles.itemsContainer}>
          {loadingBookings ? (
            <View style={[styles.emptyBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <ActivityIndicator color={PINK} size="large" />
              <Text style={[styles.emptySubtitle, { color: palette.muted, marginTop: 12 }]}>
                Loading your booking records…
              </Text>
            </View>
          ) : filteredBookings.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={[styles.emptyIconBubble, { backgroundColor: palette.surfaceHighlight }]}>
                {activeTab === "pending" ? (
                  <Clock size={36} color={GOLD} />
                ) : activeTab === "confirmed" ? (
                  <CheckCircle2 size={36} color={GREEN} />
                ) : (
                  <XCircle size={36} color={RED} />
                )}
              </View>

              <Text style={[styles.emptyTitle, { color: palette.text }]}>
                {activeTab === "pending"
                  ? "No Pending Bookings"
                  : activeTab === "confirmed"
                  ? "No Confirmed Bookings Yet"
                  : "No Cancelled Bookings"}
              </Text>

              <Text style={[styles.emptySubtitle, { color: palette.muted }]}>
                {`You currently have no ${activeTab} bookings in your account history.`}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Explore vendors"
                onPress={() => router.push("/(tabs)/Categories")}
                style={styles.exploreBtn}
              >
                <Sparkles size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.exploreBtnText}>Explore Wedding Vendors</Text>
              </Pressable>
            </View>
          ) : (
            filteredBookings.map((booking) => {
              const isConfirmed = booking.booking_status === "confirmed" || booking.booking_status === "completed";
              const isPending =
                booking.booking_status === "pending" ||
                booking.booking_status === "pending_vendor_confirmation" ||
                booking.booking_status === "pending_payment";
              const isCancelled =
                booking.booking_status === "cancelled" ||
                booking.booking_status === "cancelled_by_vendor" ||
                booking.booking_status === "cancelled_by_customer";

              const eventDateDisplay =
                booking.total_days && booking.total_days > 1
                  ? `${formatDate(booking.start_date || booking.event_date)} – ${formatDate(booking.end_date)} (${booking.total_days} Days)`
                  : formatDate(booking.event_date);

              const cardKey = String(booking.id || booking.booking_id || booking.ticket_id);
              const isExpanded = Boolean(expandedCardIds[cardKey]);

              return (
                <View
                  key={cardKey}
                  style={[
                    styles.bookingCard,
                    {
                      backgroundColor: palette.surface,
                      borderColor: isConfirmed ? GREEN : isCancelled ? RED : palette.cardBorder,
                    },
                  ]}
                >
                  {/* Card Header: Ticket Pill & Status Badge + Dropdown Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isExpanded ? "Minimize card" : "Maximize card"}
                    onPress={() => toggleCardExpand(cardKey)}
                    style={styles.cardTop}
                  >
                    <View style={styles.cardTopLeft}>
                      <View style={styles.ticketPill}>
                        <Text selectable style={styles.ticketPillText}>#{booking.ticket_id}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          isConfirmed
                            ? { backgroundColor: "#DCFCE7" }
                            : isPending
                            ? { backgroundColor: "#FEF3C7" }
                            : { backgroundColor: "#FEE2E2" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            isConfirmed ? { color: "#15803D" } : isPending ? { color: "#B45309" } : { color: "#B91C1C" },
                          ]}
                        >
                          {isConfirmed ? "CONFIRMED" : isPending ? "WAITING FOR CONFIRMATION" : "CANCELLED"}
                        </Text>
                      </View>
                    </View>

                    {/* Dropdown Button to Maximize / Minimize */}
                    <View style={[styles.dropdownBtn, isExpanded && styles.dropdownBtnActive]}>
                      {isExpanded ? (
                        <ChevronUp size={16} color={PINK} strokeWidth={2.4} />
                      ) : (
                        <ChevronDown size={16} color={PINK} strokeWidth={2.4} />
                      )}
                    </View>
                  </Pressable>

                  {/* Vendor & Package Details */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isExpanded ? "Minimize card" : "Maximize card"}
                    onPress={() => toggleCardExpand(cardKey)}
                    style={styles.vendorHeaderRow}
                  >
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <Text style={[styles.vendorName, { color: palette.text }]}>
                        {booking.vendor_name || "Wedding Vendor"}
                      </Text>
                      <Text numberOfLines={isExpanded ? undefined : 1} style={[styles.packageName, { color: palette.muted }]}>
                        {booking.package_title}
                      </Text>
                    </View>

                    {/* When minimized: Compact Price Badge on the right */}
                    {!isExpanded ? (
                      <View style={[styles.compactPriceBadge, { backgroundColor: palette.surfaceSoft }]}>
                        <Text style={[styles.compactPriceLabel, { color: palette.muted }]}>TOTAL</Text>
                        <Text style={[styles.compactPriceValue, { color: palette.text }]}>{money(booking.total_amount)}</Text>
                      </View>
                    ) : null}
                  </Pressable>

                  {/* When minimized: Summary row (Date & Paid on left, View Ticket button on right) */}
                  {!isExpanded ? (
                    <View style={styles.compactBottomRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? "Minimize card" : "Maximize card"}
                        onPress={() => toggleCardExpand(cardKey)}
                        style={styles.compactMetaLeft}
                      >
                        <View style={styles.detailItem}>
                          <CalendarDays size={12} color={PINK} />
                          <Text style={[styles.compactMetaText, { color: palette.muted }]}>{eventDateDisplay}</Text>
                        </View>
                        <Text style={[styles.dot, { color: palette.muted }]}>•</Text>
                        <Text style={[styles.compactMetaText, { color: GREEN, fontWeight: "700" }]}>
                          Paid: {money(booking.advance_amount)}
                        </Text>
                      </Pressable>

                      {isConfirmed || activeTab === "confirmed" ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View ticket for booking ${booking.ticket_id}`}
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            router.push({
                              pathname: "/ticket",
                              params: { booking_id: booking.booking_id, ticket_id: booking.ticket_id },
                            });
                          }}
                          style={({ pressed }) => [
                            styles.minimizedTicketBtn,
                            pressed && styles.minimizedTicketBtnPressed,
                          ]}
                        >
                          <Ticket size={12} color="#FFF" />
                          <Text style={styles.minimizedTicketBtnText}>View Ticket</Text>
                          <ChevronRight size={12} color="#FFF" strokeWidth={2.4} />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {/* MAXIMIZED / EXPANDED CONTENT */}
                  {isExpanded ? (
                    <View style={styles.expandedContent}>
                      {/* Date & Event Type */}
                      <View style={styles.detailsRow}>
                        <View style={styles.detailItem}>
                          <CalendarDays size={14} color={PINK} />
                          <Text style={[styles.detailText, { color: palette.muted }]}>{eventDateDisplay}</Text>
                        </View>
                        {booking.event_type ? (
                          <>
                            <Text style={[styles.dot, { color: palette.muted }]}>•</Text>
                            <Text style={[styles.detailText, { color: palette.muted }]}>{booking.event_type}</Text>
                          </>
                        ) : null}
                      </View>

                      {/* Financial Breakdown (100% Total, 30% Advance Paid, 70% Balance Due) */}
                      <View style={[styles.financeStrip, { backgroundColor: palette.surfaceSoft }]}>
                        <View style={styles.financeCell}>
                          <Text style={[styles.finLabel, { color: palette.muted }]}>TOTAL VALUE</Text>
                          <Text style={[styles.finVal, { color: palette.text }]}>{money(booking.total_amount)}</Text>
                        </View>
                        <View style={styles.financeCell}>
                          <Text style={[styles.finLabel, { color: GREEN }]}>30% ADVANCE PAID</Text>
                          <Text style={[styles.finVal, { color: GREEN }]}>{money(booking.advance_amount)}</Text>
                        </View>
                        <View style={styles.financeCell}>
                          <Text style={[styles.finLabel, { color: GOLD }]}>70% DUE AT EVENT</Text>
                          <Text style={[styles.finVal, { color: GOLD }]}>{money(booking.due_amount)}</Text>
                        </View>
                      </View>

                      {/* Status Explanation Banners */}
                      {isCancelled ? (
                        <View style={styles.cancelledBanner}>
                          <Text style={styles.cancelledBannerTitle}>🔴 Cancelled by Vendor — 72h Refund Initiated</Text>
                          <Text style={styles.cancelledBannerText}>
                            {booking.refund_status === "refunded"
                              ? `✓ Refund of ${money(booking.advance_amount)} has been credited back to your account.`
                              : `Your paid advance of ${money(booking.advance_amount)} will be credited back to your payment method within 72 hours.`}
                          </Text>
                        </View>
                      ) : isPending ? (
                        <View style={styles.pendingBanner}>
                          <Text style={styles.pendingBannerTitle}>⏳ Waiting for Vendor Acceptance</Text>
                          <Text style={styles.pendingBannerText}>
                            Your 30% advance of {money(booking.advance_amount)} is safely held. Your official luxury E-Ticket will activate as soon as the vendor confirms!
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.confirmedBanner}>
                          <Text style={styles.confirmedBannerTitle}>✓ Luxury E-Ticket Active & Verified</Text>
                          <Text style={styles.confirmedBannerText}>
                            Present your digital E-Ticket or reference #{booking.ticket_id} to the vendor on your event date.
                          </Text>
                        </View>
                      )}

                      {/* Card Footer CTA */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View ticket for booking ${booking.ticket_id}`}
                        onPress={() =>
                          router.push({
                            pathname: "/ticket",
                            params: { booking_id: booking.booking_id, ticket_id: booking.ticket_id },
                          })
                        }
                        style={styles.cardFooter}
                      >
                        <Text style={[styles.viewTicketText, { color: PINK }]}>
                          {isCancelled
                            ? "View Cancellation & Refund Details"
                            : isPending
                            ? "View Booking Status"
                            : "View Official Luxury E-Ticket"}
                        </Text>
                        <ChevronRight size={16} color={PINK} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 80, gap: 14 },
  desktopContent: { maxWidth: 840, alignSelf: "center", width: "100%" },
  flex: { flex: 1, minWidth: 0 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  statsRibbon: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 10,
    alignItems: "center",
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statNum: {
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statDivider: {
    width: 1,
    height: 24,
  },

  topSection: {
    gap: 10,
  },
  stickyTabsWrapper: {
    paddingTop: 6,
    paddingBottom: 8,
    zIndex: 50,
  },
  tabsTrackContainer: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 6,
    shadowColor: "#E11D48",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  tabsRowContent: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  tabChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4.5,
    paddingHorizontal: 4,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
  },
  tabChipInactive: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  tabChipPressed: {
    backgroundColor: "rgba(233, 30, 99, 0.08)",
  },
  tabChipActivePending: {
    backgroundColor: "#D97706",
    borderColor: "#D97706",
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 5,
  },
  tabChipActiveConfirmed: {
    backgroundColor: "#059669",
    borderColor: "#059669",
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 5,
  },
  tabChipActiveCancelled: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 5,
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  tabChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  itemsContainer: {
    gap: 14,
    marginTop: 4,
  },

  guestNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 6,
  },
  guestNoticeTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  guestNoticeDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  loginMiniBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  loginMiniBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  bookingCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 8,
    ...Platform.select({
      web: { boxShadow: "0 4px 14px rgba(0,0,0,0.04)" },
      default: { elevation: 2 },
    }),
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    flexWrap: "wrap",
  },
  dropdownBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(233, 30, 99, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(233, 30, 99, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  dropdownBtnActive: {
    backgroundColor: "rgba(233, 30, 99, 0.16)",
    borderColor: PINK,
  },
  ticketPill: {
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
  },
  ticketPillText: {
    color: "#7E22CE",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  vendorRow: {
    gap: 2,
    marginTop: 2,
  },
  vendorHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  vendorName: {
    fontSize: 16.5,
    fontWeight: "800",
  },
  packageName: {
    fontSize: 13,
    fontWeight: "600",
  },
  compactPriceBadge: {
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  compactPriceLabel: {
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  compactPriceValue: {
    fontSize: 13.5,
    fontWeight: "800",
    marginTop: 1,
  },
  compactBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
    paddingTop: 4,
    flexWrap: "wrap",
  },
  compactMetaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  compactMetaText: {
    fontSize: 11.5,
  },
  minimizedTicketBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
    backgroundColor: PINK,
    paddingHorizontal: 9.5,
    paddingVertical: 5,
    borderRadius: 9,
    marginLeft: "auto",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(225, 29, 72, 0.28)" },
      default: {
        elevation: 2,
        shadowColor: PINK,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
    }),
  },
  minimizedTicketBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  minimizedTicketBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  expandedContent: {
    gap: 10,
    marginTop: 6,
  },

  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailText: {
    fontSize: 13,
  },
  dot: {
    fontSize: 13,
  },

  financeStrip: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 14,
    justifyContent: "space-between",
  },
  financeCell: {
    alignItems: "center",
  },
  finLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  finVal: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  viewTicketText: {
    fontSize: 13,
    fontWeight: "800",
  },

  confirmedBanner: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  confirmedBannerTitle: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "800",
  },
  confirmedBannerText: {
    color: "#14532D",
    fontSize: 11,
    lineHeight: 16,
  },

  cancelledBanner: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  cancelledBannerTitle: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "800",
  },
  cancelledBannerText: {
    color: "#7F1D1D",
    fontSize: 11,
    lineHeight: 16,
  },

  pendingBanner: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  pendingBannerTitle: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "800",
  },
  pendingBannerText: {
    color: "#78350F",
    fontSize: 11,
    lineHeight: 16,
  },

  enquiryCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },

  emptyBox: {
    padding: 40,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 16,
  },
  emptyIconBubble: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 340,
    lineHeight: 19,
  },
  exploreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  exploreBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
