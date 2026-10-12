import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Gift,
  IndianRupee,
  Package,
  Phone,
  Ticket,
  User,
  XCircle,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { royalAdmin } from "@/components/admin/dashboard/adminDashboardTheme";
import { fonts } from "@/constants/typography";
import {
  VendorBookingService,
  type VendorBooking,
} from "@/services/vendorBookings";

type TabKey = "pending" | "confirmed" | "cancelled";

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

export function AdminBookingsWidget({ royal = true }: { royal?: boolean }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;

  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const list = await VendorBookingService.listAllBookingsForAdmin();
      setBookings(list);
    } catch (err) {
      console.warn("AdminBookingsWidget load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    // Realtime live subscription
    const unsubscribe = VendorBookingService.subscribeToBookings(() => {
      void loadData();
    });
    return unsubscribe;
  }, [loadData]);

  const isPending = (b: VendorBooking) =>
    b.booking_status === "pending_vendor_confirmation" ||
    b.booking_status === "pending" ||
    b.booking_status === "pending_payment";

  const isConfirmed = (b: VendorBooking) =>
    b.booking_status === "confirmed" || b.booking_status === "completed";

  const isCancelled = (b: VendorBooking) =>
    b.booking_status === "cancelled_by_vendor" ||
    b.booking_status === "cancelled_by_customer" ||
    b.booking_status === "cancelled";

  const counts = useMemo(
    () => ({
      pending: bookings.filter(isPending).length,
      confirmed: bookings.filter(isConfirmed).length,
      cancelled: bookings.filter(isCancelled).length,
    }),
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    if (activeTab === "pending") return bookings.filter(isPending);
    if (activeTab === "confirmed") return bookings.filter(isConfirmed);
    return bookings.filter(isCancelled);
  }, [activeTab, bookings]);

  const displayedList = useMemo(() => filteredBookings.slice(0, 4), [filteredBookings]);

  return (
    <View style={styles.card}>
      {/* Header with Title and Bookings Button */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.iconCircle}>
            <Ticket size={20} color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <View style={styles.titleWithBadge}>
              <Text style={styles.title}>Bookings</Text>
              {counts.pending > 0 ? (
                <View style={styles.pendingAlertBadge}>
                  <Text style={styles.pendingAlertBadgeText}>
                    {counts.pending} NEW PENDING
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.subtitle}>
              Which customer has sent booking to which vendor · 30% advance escrow
            </Text>
          </View>
        </View>

        {/* PRIMARY BOOKINGS BUTTON ON DASHBOARD */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Bookings Workspace"
          onPress={() => router.push("/AdminBookings")}
          style={({ pressed }) => [styles.bookingsButton, pressed && styles.pressed]}
        >
          <Text style={styles.bookingsButtonText}>Bookings</Text>
          <ArrowRight size={15} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* THREE TABS */}
      <View style={styles.tabsRow}>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Pending bookings tab"
          accessibilityState={{ selected: activeTab === "pending" }}
          onPress={() => setActiveTab("pending")}
          style={[styles.tab, activeTab === "pending" && styles.tabActiveAmber]}
        >
          <Clock size={15} color={activeTab === "pending" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
          <Text style={[styles.tabLabel, activeTab === "pending" && styles.tabLabelActive]}>
            Pending
          </Text>
          <View style={[styles.tabBadge, activeTab === "pending" ? styles.tabBadgeAmber : styles.tabBadgeMuted]}>
            <Text style={[styles.tabBadgeText, activeTab === "pending" && styles.tabBadgeTextAmber]}>
              {counts.pending}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Confirmed bookings tab"
          accessibilityState={{ selected: activeTab === "confirmed" }}
          onPress={() => setActiveTab("confirmed")}
          style={[styles.tab, activeTab === "confirmed" && styles.tabActiveGreen]}
        >
          <CheckCircle2 size={15} color={activeTab === "confirmed" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
          <Text style={[styles.tabLabel, activeTab === "confirmed" && styles.tabLabelActive]}>
            Confirmed
          </Text>
          <View style={[styles.tabBadge, activeTab === "confirmed" ? styles.tabBadgeGreen : styles.tabBadgeMuted]}>
            <Text style={[styles.tabBadgeText, activeTab === "confirmed" && styles.tabBadgeTextGreen]}>
              {counts.confirmed}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Cancelled bookings tab"
          accessibilityState={{ selected: activeTab === "cancelled" }}
          onPress={() => setActiveTab("cancelled")}
          style={[styles.tab, activeTab === "cancelled" && styles.tabActiveRed]}
        >
          <XCircle size={15} color={activeTab === "cancelled" ? royalAdmin.navyDeep : royalAdmin.navyMuted} />
          <Text style={[styles.tabLabel, activeTab === "cancelled" && styles.tabLabelActive]}>
            Cancelled
          </Text>
          <View style={[styles.tabBadge, activeTab === "cancelled" ? styles.tabBadgeRed : styles.tabBadgeMuted]}>
            <Text style={[styles.tabBadgeText, activeTab === "cancelled" && styles.tabBadgeTextRed]}>
              {counts.cancelled}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* CONTENT LIST */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={royalAdmin.navy} />
          <Text style={styles.loadingText}>Loading bookings...</Text>
        </View>
      ) : displayedList.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ticket size={28} color={royalAdmin.navyMuted} />
          <Text style={styles.emptyText}>No {activeTab} bookings at this time</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {displayedList.map((item, idx) => {
            const pending = isPending(item);
            const confirmed = isConfirmed(item);

            return (
              <View
                key={item.id}
                style={[
                  styles.bookingItem,
                  idx > 0 && styles.itemBorderTop,
                ]}
              >
                {/* WHICH CUSTOMER SENT BOOKING TO WHICH VENDOR */}
                <View style={[styles.relationRow, desktop && styles.relationRowDesktop]}>
                  {/* Customer Block */}
                  <View style={styles.partyBox}>
                    <View style={styles.roleHeader}>
                      <View style={[styles.partyIconWrap, { backgroundColor: royalAdmin.blueSoft }]}>
                        <User size={13} color={royalAdmin.blue} />
                      </View>
                      <Text style={styles.roleTag}>CUSTOMER (SENDER)</Text>
                    </View>
                    <Text style={styles.partyName} numberOfLines={1}>
                      {item.customer_name}
                    </Text>
                    <View style={styles.phoneRow}>
                      <Phone size={12} color={royalAdmin.navyMuted} />
                      <Text style={styles.phoneText}>{item.customer_phone}</Text>
                    </View>
                  </View>

                  {/* Flow Arrow */}
                  <View style={styles.arrowWrap}>
                    <View style={styles.arrowBadge}>
                      <Text style={styles.arrowText}>SENT TO</Text>
                      <ArrowRight size={13} color={royalAdmin.navyDeep} />
                    </View>
                  </View>

                  {/* Vendor Block */}
                  <View style={styles.partyBox}>
                    <View style={styles.roleHeader}>
                      <View style={[styles.partyIconWrap, { backgroundColor: royalAdmin.amberSoft }]}>
                        <Building2 size={13} color={royalAdmin.amber} />
                      </View>
                      <Text style={styles.roleTag}>VENDOR (RECIPIENT)</Text>
                    </View>
                    <Text style={styles.partyName} numberOfLines={1}>
                      {item.vendor_name || "Vendor"}
                    </Text>
                    <Text style={styles.vendorMetaText} numberOfLines={1}>
                      {item.vendor_category || "Wedding Vendor"} {item.vendor_city ? `· ${item.vendor_city}` : ""}
                    </Text>
                  </View>
                </View>

                {/* Bottom Details Line */}
                <View style={styles.itemBottomRow}>
                  <View style={styles.metaPills}>
                    <View style={styles.ticketPill}>
                      <Text style={styles.ticketPillText}>#{item.ticket_id}</Text>
                    </View>
                    <View style={styles.datePill}>
                      <CalendarDays size={12} color={royalAdmin.navyMuted} />
                      <Text style={styles.datePillText}>
                        {formatDate(item.start_date || item.event_date)}
                      </Text>
                    </View>
                    <View style={styles.packagePill}>
                      <Package size={12} color={royalAdmin.navyMuted} />
                      <Text style={styles.packagePillText} numberOfLines={1}>
                        {item.package_title}
                      </Text>
                    </View>
                    {item.referral_code ? (
                      <View style={styles.referralPill}>
                        <Gift size={11} color="#B45309" />
                        <Text style={styles.referralPillText}>{item.referral_code}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.priceColumn}>
                    <Text style={styles.priceAdvance}>
                      30% Adv: <Text style={{ color: "#16A34A", fontWeight: "700" }}>{money(item.advance_amount)}</Text>
                    </Text>
                    <Text style={styles.priceTotal}>
                      Total: {money(item.total_amount)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Footer link to full view */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open all bookings in full table"
        onPress={() => router.push({ pathname: "/AdminBookings", params: { tab: activeTab } })}
        style={styles.footerLink}
      >
        <Text style={styles.footerLinkText}>
          View All {filteredBookings.length} {activeTab.toUpperCase()} Bookings in Workspace
        </Text>
        <ChevronRight size={15} color={royalAdmin.blue} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: royalAdmin.border,
    overflow: "hidden",
    shadowColor: royalAdmin.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: royalAdmin.border,
    backgroundColor: "#FBFDFF",
    flexWrap: "wrap",
    gap: 12,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 260,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: royalAdmin.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.serif.bold,
    fontSize: 20,
    lineHeight: 26,
  },
  pendingAlertBadge: {
    backgroundColor: royalAdmin.amberSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: royalAdmin.goldBorder,
  },
  pendingAlertBadgeText: {
    color: royalAdmin.amber,
    fontFamily: fonts.sans.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    marginTop: 2,
  },
  bookingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: royalAdmin.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bookingsButtonText: {
    color: "#FFFFFF",
    fontFamily: fonts.sans.bold,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#F8FAFD",
    borderBottomWidth: 1,
    borderBottomColor: royalAdmin.border,
    gap: 10,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  tabActiveAmber: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: royalAdmin.goldBorder,
  },
  tabActiveGreen: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  tabActiveRed: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  tabLabel: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
  },
  tabLabelActive: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
  },
  tabBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
  },
  tabBadgeMuted: {
    backgroundColor: "rgba(0, 32, 91, 0.06)",
  },
  tabBadgeAmber: {
    backgroundColor: royalAdmin.amberSoft,
  },
  tabBadgeGreen: {
    backgroundColor: royalAdmin.greenSoft,
  },
  tabBadgeRed: {
    backgroundColor: royalAdmin.roseSoft,
  },
  tabBadgeText: {
    fontFamily: fonts.sans.bold,
    fontSize: 11,
    color: royalAdmin.navyMuted,
  },
  tabBadgeTextAmber: {
    color: royalAdmin.amber,
  },
  tabBadgeTextGreen: {
    color: royalAdmin.green,
  },
  tabBadgeTextRed: {
    color: royalAdmin.rose,
  },
  listContainer: {
    paddingHorizontal: 18,
  },
  bookingItem: {
    paddingVertical: 14,
  },
  itemBorderTop: {
    borderTopWidth: 1,
    borderTopColor: "#EEF3F8",
  },
  relationRow: {
    backgroundColor: "#F9FBFE",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3EAF2",
    padding: 12,
    gap: 10,
  },
  relationRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partyBox: {
    flex: 1,
    gap: 3,
  },
  roleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  partyIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  roleTag: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.bold,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  partyName: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 14,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  phoneText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 12,
  },
  vendorMetaText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 12,
  },
  arrowWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  arrowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EBF3FC",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  arrowText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  itemBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 4,
    flexWrap: "wrap",
    gap: 8,
  },
  metaPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flex: 1,
  },
  ticketPill: {
    backgroundColor: "rgba(0, 32, 91, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ticketPillText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.bold,
    fontSize: 11,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  datePillText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 12,
  },
  packagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 200,
  },
  packagePillText: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.medium,
    fontSize: 12,
  },
  referralPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF9EE",
    borderColor: "#FDE68A",
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  referralPillText: {
    color: "#92400E",
    fontFamily: fonts.sans.bold,
    fontSize: 11,
  },
  priceColumn: {
    alignItems: "flex-end",
  },
  priceAdvance: {
    color: royalAdmin.navyDeep,
    fontFamily: fonts.sans.regular,
    fontSize: 12,
  },
  priceTotal: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.regular,
    fontSize: 11,
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: royalAdmin.border,
    backgroundColor: "#F8FAFD",
  },
  footerLinkText: {
    color: royalAdmin.blue,
    fontFamily: fonts.sans.bold,
    fontSize: 13,
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 8,
  },
  loadingText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 8,
  },
  emptyText: {
    color: royalAdmin.navyMuted,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
  },
  flex: {
    flex: 1,
  },
});
