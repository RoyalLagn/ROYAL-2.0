import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import {
  ArrowDownUp,
  CalendarDays,
  CheckCircle2,
  CircleCheck,
  CircleX,
  CreditCard,
  FileCheck,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Ticket,
  Wallet,
  X,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { SubscriptionAdminService } from "@/subscriptions/services/SubscriptionAdminService";
import { formatSubscriptionPrice, subscriptionStatusLabel } from "@/subscriptions/utils";
import { typeScale } from "@/constants/typography";
import { adminPalette } from "@/theme";
import {
  VendorBookingService,
  type VendorBooking,
} from "@/services/vendorBookings";

const pink = adminPalette.brand;
const PAYMENTS_PER_PAGE = 30;

const money = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

export default function PaymentsAdmin() {
  const { isPhone, isTablet, contentPadding } = useResponsiveLayout();

  // Top Section Switcher: "subscriptions" vs "booking_refunds"
  const [mainTab, setMainTab] = useState<"subscriptions" | "booking_refunds">("subscriptions");

  // ----------------- Subscriptions State -----------------
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "amount_high" | "amount_low">("recent");
  const [page, setPage] = useState(1);

  // ----------------- Bookings & Refunds State -----------------
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<"all" | "pending_refund" | "refunded" | "confirmed">("all");
  const [bookingSearch, setBookingSearch] = useState("");
  const [refundModalBooking, setRefundModalBooking] = useState<VendorBooking | null>(null);
  const [refundNotes, setRefundNotes] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayments(await SubscriptionAdminService.listPayments());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      const all = await VendorBookingService.listAllBookingsForAdmin();
      setBookings(all);
    } catch (err) {
      console.warn("Could not load bookings for admin", err);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSubscriptions(), loadBookings()]);
  }, [loadSubscriptions, loadBookings]);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll])
  );

  useEffect(() => SubscriptionAdminService.subscribe(() => void loadSubscriptions()), [loadSubscriptions]);

  // Subscription filters
  const categories = useMemo(
    () => Array.from(new Set(payments.map((p) => p.vendors?.categories?.name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [payments]
  );

  const filteredSubscriptions = useMemo(() => {
    return payments
      .filter((payment) => {
        const matchesStatus = filter === "all" || payment.payment_status === filter;
        const matchesCategory = categoryFilter === "all" || payment.vendors?.categories?.name === categoryFilter;
        const createdDay = String(payment.created_at || "").slice(0, 10);
        const matchesFrom = !fromDate || createdDay >= fromDate;
        const matchesTo = !toDate || createdDay <= toDate;
        const haystack = `${payment.vendors?.business_name || ""} ${payment.razorpay_order_id || ""} ${payment.razorpay_payment_id || ""}`.toLowerCase();
        return matchesStatus && matchesCategory && matchesFrom && matchesTo && haystack.includes(search.trim().toLowerCase());
      })
      .sort((first, second) => {
        if (sort === "amount_high") return Number(second.amount || 0) - Number(first.amount || 0);
        if (sort === "amount_low") return Number(first.amount || 0) - Number(second.amount || 0);
        const difference = new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
        return sort === "oldest" ? -difference : difference;
      });
  }, [categoryFilter, filter, fromDate, payments, search, sort, toDate]);

  // Bookings & Refunds filters
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const isCancelledStatus = ["cancelled", "cancelled_by_vendor", "cancelled_by_customer"].includes(b.booking_status);
      if (bookingFilter === "pending_refund") {
        if (!isCancelledStatus || b.refund_status === "refunded") return false;
      } else if (bookingFilter === "refunded") {
        if (b.refund_status !== "refunded") return false;
      } else if (bookingFilter === "confirmed") {
        if (b.booking_status !== "confirmed") return false;
      }

      if (!bookingSearch.trim()) return true;
      const q = bookingSearch.trim().toLowerCase();
      return (
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.includes(q) ||
        (b.vendor_name || "").toLowerCase().includes(q) ||
        b.ticket_id.toLowerCase().includes(q) ||
        (b.razorpay_payment_id || "").toLowerCase().includes(q)
      );
    });
  }, [bookings, bookingFilter, bookingSearch]);

  // Bookings Stats
  const bookingStats = useMemo(() => {
    const totalAdvance = bookings.reduce((sum, b) => sum + (Number(b.advance_amount) || 0), 0);
    const pendingRefunds = bookings.filter((b) => ["cancelled", "cancelled_by_vendor", "cancelled_by_customer"].includes(b.booking_status) && b.refund_status !== "refunded");
    const pendingRefundAmount = pendingRefunds.reduce((sum, b) => sum + (Number(b.advance_amount) || 0), 0);
    const completedRefunds = bookings.filter((b) => b.refund_status === "refunded");
    const completedRefundAmount = completedRefunds.reduce((sum, b) => sum + (Number(b.advance_amount) || 0), 0);
    const confirmedCount = bookings.filter((b) => b.booking_status === "confirmed").length;

    return {
      totalAdvance,
      pendingCount: pendingRefunds.length,
      pendingRefundAmount,
      completedCount: completedRefunds.length,
      completedRefundAmount,
      confirmedCount,
    };
  }, [bookings]);

  const handleProcessRefundSubmit = async () => {
    if (!refundModalBooking) return;
    setProcessingRefund(true);
    try {
      await VendorBookingService.processAdminRefund(
        refundModalBooking.id,
        refundNotes.trim() || "Processed via Razorpay gateway by admin"
      );
      setRefundModalBooking(null);
      setRefundNotes("");
      await loadBookings();
      Alert.alert(
        "Refund Processed",
        `Refund of ${money(refundModalBooking.advance_amount)} marked as refunded for Ticket #${refundModalBooking.ticket_id}.`
      );
    } catch (err) {
      Alert.alert("Failed", err instanceof Error ? err.message : "Unable to process refund.");
    } finally {
      setProcessingRefund(false);
    }
  };

  const pages = Math.max(1, Math.ceil(filteredSubscriptions.length / PAYMENTS_PER_PAGE));
  const currentPage = Math.min(page, pages);
  const visible = filteredSubscriptions.slice((currentPage - 1) * PAYMENTS_PER_PAGE, currentPage * PAYMENTS_PER_PAGE);
  const paymentCardBasis = isPhone ? "100%" : isTablet ? "48%" : "32%";

  const subTotal = (statuses: string[]) =>
    payments.filter((payment) => statuses.includes(payment.payment_status)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const subStats = [
    { label: "Verified revenue", value: subTotal(["verified"]), count: payments.filter((p) => p.payment_status === "verified").length, icon: CircleCheck, tint: adminPalette.success },
    { label: "Failed", value: subTotal(["failed"]), count: payments.filter((p) => p.payment_status === "failed").length, icon: CircleX, tint: adminPalette.error },
    { label: "Refunded", value: subTotal(["refunded", "partially_refunded"]), count: payments.filter((p) => ["refunded", "partially_refunded"].includes(p.payment_status)).length, icon: RotateCcw, tint: adminPalette.warning },
  ];

  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: contentPadding, paddingBottom: isPhone ? 110 : 32 }]} showsVerticalScrollIndicator={false}>
        <AdminPageHeader
          title="Payments & Refunds"
          subtitle="Manage vendor subscriptions and customer booking advances & 72h refunds"
          action={
            <Pressable accessibilityLabel="Refresh payments" onPress={() => void refreshAll()} style={styles.headerButton}>
              <RefreshCw size={19} color={pink} />
            </Pressable>
          }
        />

        {/* Top Master Switcher */}
        <View style={styles.masterSwitcherWrap}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mainTab === "subscriptions" }}
            onPress={() => setMainTab("subscriptions")}
            style={[styles.masterTab, mainTab === "subscriptions" && styles.masterTabActive]}
          >
            <CreditCard size={17} color={mainTab === "subscriptions" ? "#FFF" : adminPalette.textMuted} />
            <Text style={[styles.masterTabText, mainTab === "subscriptions" && styles.masterTabTextActive]}>
              Vendor Subscriptions
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mainTab === "booking_refunds" }}
            onPress={() => setMainTab("booking_refunds")}
            style={[styles.masterTab, mainTab === "booking_refunds" && styles.masterTabActive]}
          >
            <RotateCcw size={17} color={mainTab === "booking_refunds" ? "#FFF" : adminPalette.textMuted} />
            <Text style={[styles.masterTabText, mainTab === "booking_refunds" && styles.masterTabTextActive]}>
              Booking Advances & Refunds
            </Text>
            {bookingStats.pendingCount > 0 ? (
              <View style={styles.badgePending}>
                <Text style={styles.badgePendingText}>{bookingStats.pendingCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {mainTab === "subscriptions" ? (
          /* ==================== SUBSCRIPTIONS SECTION ==================== */
          <>
            <View style={styles.stats}>
              {subStats.map(({ label, value, count, icon: Icon, tint }) => (
                <View key={label} style={styles.stat}>
                  <View style={[styles.statIcon, { backgroundColor: `${tint}15` }]}>
                    <Icon size={20} color={tint} />
                  </View>
                  <Text style={styles.statValue}>{formatSubscriptionPrice(value)}</Text>
                  <Text style={styles.statLabel}>
                    {label} · {count}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.filterSection}>
              <View style={styles.filterHeading}>
                <View style={styles.filterHeadingTitle}>
                  <SlidersHorizontal size={18} color={pink} />
                  <Text style={styles.filterTitle}>Filter & sort</Text>
                </View>
                {filter !== "all" || categoryFilter !== "all" || Boolean(fromDate) || Boolean(toDate) || Boolean(search) || sort !== "recent" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear payment filters"
                    onPress={() => {
                      setSearch("");
                      setFilter("all");
                      setCategoryFilter("all");
                      setFromDate("");
                      setToDate("");
                      setSort("recent");
                      setPage(1);
                    }}
                    hitSlop={8}
                    style={styles.clearButton}
                  >
                    <X size={15} color={pink} />
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.searchBox}>
                <Search size={17} color="#887A81" />
                <TextInput
                  value={search}
                  onChangeText={(val) => {
                    setSearch(val);
                    setPage(1);
                  }}
                  placeholder="Vendor, order ID or payment ID"
                  placeholderTextColor={adminPalette.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <CalendarDays size={16} color={adminPalette.textMuted} />
                  <TextInput
                    accessibilityLabel="Payments from date"
                    value={fromDate}
                    onChangeText={(val) => {
                      setFromDate(val);
                      setPage(1);
                    }}
                    placeholder="From · YYYY-MM-DD"
                    placeholderTextColor={adminPalette.textMuted}
                    style={styles.dateInput}
                  />
                </View>
                <View style={styles.dateField}>
                  <CalendarDays size={16} color={adminPalette.textMuted} />
                  <TextInput
                    accessibilityLabel="Payments to date"
                    value={toDate}
                    onChangeText={(val) => {
                      setToDate(val);
                      setPage(1);
                    }}
                    placeholder="To · YYYY-MM-DD"
                    placeholderTextColor={adminPalette.textMuted}
                    style={styles.dateInput}
                  />
                </View>
              </View>

              <Text style={styles.filterLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
                {["all", ...categories].map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: categoryFilter === item }}
                    key={item}
                    onPress={() => {
                      setCategoryFilter(item);
                      setPage(1);
                    }}
                    style={[styles.filter, categoryFilter === item && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, categoryFilter === item && styles.filterTextActive]}>
                      {item === "all" ? "All categories" : item}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.sortLine}>
                <View style={styles.sortLabel}>
                  <ArrowDownUp size={15} color={adminPalette.textMuted} />
                  <Text style={styles.filterLabel}>Order</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortStrip}>
                  {[
                    ["recent", "Recent"],
                    ["oldest", "Oldest"],
                    ["amount_high", "Amount: high"],
                    ["amount_low", "Amount: low"],
                  ].map(([val, lbl]) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: sort === val }}
                      key={val}
                      onPress={() => {
                        setSort(val as typeof sort);
                        setPage(1);
                      }}
                      style={[styles.sortOption, sort === val && styles.sortOptionActive]}
                    >
                      <Text style={[styles.sortText, sort === val && styles.sortTextActive]}>{lbl}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <Text accessibilityLiveRegion="polite" style={styles.resultsCount}>
                {filteredSubscriptions.length} payment{filteredSubscriptions.length === 1 ? "" : "s"}
              </Text>
            </View>

            {loading ? <ActivityIndicator color={pink} style={{ marginTop: 35 }} /> : null}
            {error ? (
              <View style={styles.error}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={loadSubscriptions}>
                  <Text style={styles.retry}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {!loading && filteredSubscriptions.length === 0 ? (
              <View style={styles.empty}>
                <ReceiptText size={28} color={pink} />
                <Text style={styles.emptyTitle}>No matching payments</Text>
                <Text style={styles.emptyText}>Transactions will appear after a Vendor starts checkout.</Text>
              </View>
            ) : null}

            <View style={styles.list}>
              {visible.map((payment) => {
                const successful = payment.payment_status === "verified";
                const failed = payment.payment_status === "failed";
                return (
                  <View key={payment.id} style={[styles.payment, { flexBasis: paymentCardBasis, maxWidth: paymentCardBasis }]}>
                    <View style={styles.paymentHeader}>
                      <View
                        style={[
                          styles.paymentIcon,
                          {
                            backgroundColor: successful
                              ? adminPalette.successSubtle
                              : failed
                              ? adminPalette.errorSubtle
                              : adminPalette.warningSubtle,
                          },
                        ]}
                      >
                        {successful ? (
                          <CircleCheck size={19} color={adminPalette.success} />
                        ) : failed ? (
                          <CircleX size={19} color={adminPalette.error} />
                        ) : (
                          <CreditCard size={19} color={adminPalette.warning} />
                        )}
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.vendor} numberOfLines={1}>
                          {payment.vendors?.business_name || "Vendor"}
                        </Text>
                        <Text style={styles.plan} numberOfLines={1}>
                          {payment.subscription_plans?.name || "Subscription plan"} · {subscriptionStatusLabel(payment.payment_status as any)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.paymentDetails}>
                      <Text style={styles.ids} numberOfLines={1}>
                        {payment.razorpay_payment_id || payment.razorpay_order_id || payment.id}
                      </Text>
                      {payment.failure_reason ? (
                        <Text style={styles.failure} numberOfLines={2}>
                          {payment.failure_reason}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.paymentFooter}>
                      <Text style={styles.amount}>{formatSubscriptionPrice(Number(payment.amount), payment.currency)}</Text>
                      <Text style={styles.date}>
                        {new Date(payment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {!loading && !error && filteredSubscriptions.length > PAYMENTS_PER_PAGE ? (
              <PaginationBar page={currentPage} pages={pages} onPage={setPage} total={filteredSubscriptions.length} pageSize={PAYMENTS_PER_PAGE} />
            ) : null}
          </>
        ) : (
          /* ==================== BOOKING ADVANCE & REFUNDS SECTION ==================== */
          <>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <View style={[styles.statIcon, { backgroundColor: "#DCFCE7" }]}>
                  <Wallet size={20} color="#16A34A" />
                </View>
                <Text style={styles.statValue}>{money(bookingStats.totalAdvance)}</Text>
                <Text style={styles.statLabel}>Total 30% Advance Collected</Text>
              </View>

              <View style={styles.stat}>
                <View style={[styles.statIcon, { backgroundColor: "#FEF3C7" }]}>
                  <RotateCcw size={20} color="#D97706" />
                </View>
                <Text style={[styles.statValue, { color: "#D97706" }]}>{money(bookingStats.pendingRefundAmount)}</Text>
                <Text style={styles.statLabel}>
                  Pending 72h Refunds · {bookingStats.pendingCount}
                </Text>
              </View>

              <View style={styles.stat}>
                <View style={[styles.statIcon, { backgroundColor: "#DBEAFE" }]}>
                  <FileCheck size={20} color="#2563EB" />
                </View>
                <Text style={styles.statValue}>{money(bookingStats.completedRefundAmount)}</Text>
                <Text style={styles.statLabel}>
                  Refunds Processed · {bookingStats.completedCount}
                </Text>
              </View>

              <View style={styles.stat}>
                <View style={[styles.statIcon, { backgroundColor: "#F3E8FF" }]}>
                  <Ticket size={20} color="#7C3AED" />
                </View>
                <Text style={styles.statValue}>{bookingStats.confirmedCount}</Text>
                <Text style={styles.statLabel}>Confirmed Client Tickets</Text>
              </View>
            </View>

            {/* Filter Chips & Search */}
            <View style={styles.filterSection}>
              <View style={styles.searchBox}>
                <Search size={17} color="#887A81" />
                <TextInput
                  value={bookingSearch}
                  onChangeText={setBookingSearch}
                  placeholder="Search client, vendor, ticket #RL- or payment ID..."
                  placeholderTextColor={adminPalette.textMuted}
                  style={styles.input}
                />
                {bookingSearch ? (
                  <Pressable onPress={() => setBookingSearch("")}>
                    <X size={16} color={adminPalette.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterStrip, { marginTop: 10 }]}>
                {[
                  ["all", "All Bookings"],
                  ["pending_refund", `Pending Refunds (${bookingStats.pendingCount})`],
                  ["refunded", "Refunds Processed"],
                  ["confirmed", "Confirmed Tickets"],
                ].map(([val, lbl]) => (
                  <Pressable
                    key={val}
                    onPress={() => setBookingFilter(val as any)}
                    style={[styles.filter, bookingFilter === val && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, bookingFilter === val && styles.filterTextActive]}>{lbl}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.resultsCount}>
                Showing {filteredBookings.length} booking record{filteredBookings.length === 1 ? "" : "s"}
              </Text>
            </View>

            {loadingBookings ? <ActivityIndicator color={pink} style={{ marginTop: 35 }} /> : null}

            {!loadingBookings && filteredBookings.length === 0 ? (
              <View style={styles.empty}>
                <Ticket size={28} color={pink} />
                <Text style={styles.emptyTitle}>No matching bookings or refunds found</Text>
                <Text style={styles.emptyText}>
                  {bookingFilter === "pending_refund"
                    ? "Great news! There are no cancelled bookings awaiting refund."
                    : "Customer direct bookings will appear here."}
                </Text>
              </View>
            ) : null}

            <View style={styles.bookingList}>
              {filteredBookings.map((b) => {
                const isCancelled = b.booking_status === "cancelled";
                const isConfirmed = b.booking_status === "confirmed";
                const isRefundPending = isCancelled && b.refund_status !== "refunded";
                const isRefundDone = b.refund_status === "refunded";

                return (
                  <View
                    key={b.id}
                    style={[
                      styles.bookingCard,
                      {
                        borderColor: isRefundPending
                          ? "#F59E0B"
                          : isRefundDone
                          ? "#10B981"
                          : isConfirmed
                          ? "#3B82F6"
                          : adminPalette.border,
                      },
                    ]}
                  >
                    {/* Top Row: Ticket & Status */}
                    <View style={styles.bCardHeader}>
                      <View style={styles.bTicketPill}>
                        <Text selectable style={styles.bTicketPillText}>#{b.ticket_id}</Text>
                      </View>
                      <View style={styles.bBadgeRow}>
                        {isConfirmed ? (
                          <View style={[styles.bStatusBadge, { backgroundColor: "#DCFCE7" }]}>
                            <Text style={[styles.bStatusBadgeText, { color: "#166534" }]}>● Confirmed</Text>
                          </View>
                        ) : isCancelled ? (
                          <View style={[styles.bStatusBadge, { backgroundColor: "#FEE2E2" }]}>
                            <Text style={[styles.bStatusBadgeText, { color: "#991B1B" }]}>● Cancelled by Vendor</Text>
                          </View>
                        ) : (
                          <View style={[styles.bStatusBadge, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[styles.bStatusBadgeText, { color: "#92400E" }]}>● Pending Confirmation</Text>
                          </View>
                        )}

                        {isRefundPending ? (
                          <View style={[styles.bStatusBadge, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[styles.bStatusBadgeText, { color: "#B45309" }]}>⚠️ 72h Refund Pending</Text>
                          </View>
                        ) : isRefundDone ? (
                          <View style={[styles.bStatusBadge, { backgroundColor: "#D1FAE5" }]}>
                            <Text style={[styles.bStatusBadgeText, { color: "#065F46" }]}>✓ Refunded</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Parties info */}
                    <View style={styles.partiesRow}>
                      <View style={styles.flex}>
                        <Text style={styles.bSectionHead}>CLIENT</Text>
                        <Text style={styles.bClientName}>{b.customer_name}</Text>
                        <Text style={styles.bClientContact}>{b.customer_phone}</Text>
                        {b.customer_email ? <Text style={styles.bClientContact}>{b.customer_email}</Text> : null}
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.bSectionHead}>VENDOR</Text>
                        <Text style={styles.bClientName}>{b.vendor_name || "Vendor"}</Text>
                        <Text style={styles.bClientContact}>
                          {b.event_type} · {b.event_date} ({b.total_days} {b.total_days === 1 ? "day" : "days"})
                        </Text>
                      </View>
                    </View>

                    {/* Packages info */}
                    <View style={styles.pkgStrip}>
                      <Text style={styles.pkgTitleText}>{b.package_title}</Text>
                      {b.add_ons && b.add_ons.length > 0 ? (
                        <Text style={styles.pkgAddonText}>
                          + Add-ons: {b.add_ons.map((a) => a.title).join(", ")}
                        </Text>
                      ) : null}
                      {b.special_notes ? (
                        <Text style={styles.pkgNotesText}>Note: {b.special_notes}</Text>
                      ) : null}
                    </View>

                    {/* Financials Split */}
                    <View style={styles.finRow}>
                      <View style={styles.finCell}>
                        <Text style={styles.finCellLabel}>TOTAL VALUE</Text>
                        <Text style={styles.finCellVal}>{money(b.total_amount)}</Text>
                      </View>
                      <View style={[styles.finCell, styles.finCellAdv]}>
                        <Text style={styles.finCellLabelAdv}>30% ADVANCE PAID</Text>
                        <Text style={styles.finCellValAdv}>{money(b.advance_amount)}</Text>
                      </View>
                      <View style={styles.finCell}>
                        <Text style={styles.finCellLabel}>70% DUE AT SITE</Text>
                        <Text style={styles.finCellVal}>{money(b.due_amount)}</Text>
                      </View>
                    </View>

                    {/* Payment reference */}
                    <View style={styles.payRefRow}>
                      <Text style={styles.payRefText}>
                        Gateway Ref: {b.razorpay_payment_id || b.razorpay_order_id || "Direct Advance"}
                      </Text>
                      <Text style={styles.payRefText}>
                        Booked: {new Date(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </Text>
                    </View>

                    {/* If Cancelled: show reason & refund action */}
                    {isCancelled ? (
                      <View style={styles.cancelBox}>
                        <Text style={styles.cancelReasonLabel}>
                          Vendor Rejection Reason: <Text style={styles.cancelReasonVal}>{b.rejection_reason || "Declined by vendor"}</Text>
                        </Text>

                        {isRefundPending ? (
                          <View style={styles.refundActionRow}>
                            <View style={styles.flex}>
                              <Text style={styles.refundPromptText}>
                                Customer was promised refund of {money(b.advance_amount)} within 72 hours.
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => {
                                setRefundNotes(`Refund of ${money(b.advance_amount)} processed via Razorpay gateway`);
                                setRefundModalBooking(b);
                              }}
                              style={styles.processRefundBtn}
                            >
                              <RotateCcw size={15} color="#FFF" />
                              <Text style={styles.processRefundBtnText}>Process Refund ({money(b.advance_amount)})</Text>
                            </Pressable>
                          </View>
                        ) : isRefundDone ? (
                          <View style={styles.refundDoneBox}>
                            <CheckCircle2 size={16} color="#16A34A" />
                            <Text style={styles.refundDoneText}>
                              Refund Completed on {b.refunded_at ? new Date(b.refunded_at).toLocaleDateString("en-IN") : "Record"} · {b.refund_notes || "Processed by admin"}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Admin Refund Processing Modal */}
      <Modal
        visible={Boolean(refundModalBooking)}
        transparent
        animationType="fade"
        onRequestClose={() => setRefundModalBooking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Process Customer Refund</Text>
              <Pressable onPress={() => setRefundModalBooking(null)}>
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            <View style={styles.modalDetailBox}>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Client: </Text>
                {refundModalBooking?.customer_name} ({refundModalBooking?.customer_phone})
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Ticket: </Text>
                #{refundModalBooking?.ticket_id}
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Refund Amount: </Text>
                <Text style={{ fontWeight: "900", color: "#16A34A" }}>{money(refundModalBooking?.advance_amount)}</Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Payment ID: </Text>
                {refundModalBooking?.razorpay_payment_id || "Online advance"}
              </Text>
            </View>

            <Text style={styles.modalInputLabel}>Admin Refund Notes / Gateway Ref:</Text>
            <TextInput
              value={refundNotes}
              onChangeText={setRefundNotes}
              placeholder="e.g. Refunded to original source via Razorpay Dashboard #rfnd_..."
              placeholderTextColor={adminPalette.textMuted}
              multiline
              numberOfLines={3}
              style={styles.modalInput}
            />

            <View style={styles.modalActions}>
              <Pressable
                disabled={processingRefund}
                onPress={() => setRefundModalBooking(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={processingRefund}
                onPress={() => void handleProcessRefundSubmit()}
                style={styles.modalSubmitBtn}
              >
                {processingRefund ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <CheckCircle2 size={16} color="#FFF" />
                    <Text style={styles.modalSubmitText}>Confirm & Mark Refunded</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AdminFooter activeTab="payments" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: adminPalette.canvas },
  headerButton: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  content: { width: "100%", maxWidth: 1600, alignSelf: "center" },
  flex: { flex: 1, minWidth: 0 },

  masterSwitcherWrap: {
    flexDirection: "row",
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 16,
    padding: 6,
    gap: 8,
    marginTop: 14,
  },
  masterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  masterTabActive: {
    backgroundColor: pink,
  },
  masterTabText: {
    fontSize: typeScale.caption,
    fontWeight: "700",
    color: adminPalette.textSecondary,
  },
  masterTabTextActive: {
    color: "#FFF",
    fontWeight: "800",
  },
  badgePending: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgePendingText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
  },

  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  stat: { flexGrow: 1, flexBasis: 180, minWidth: 170, maxWidth: 280, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 15 },
  statIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statValue: { color: adminPalette.text, fontSize: typeScale.sectionTitle, fontWeight: "700", marginTop: 10 },
  statLabel: { color: adminPalette.textSecondary, fontSize: typeScale.caption, marginTop: 2 },

  filterSection: { marginTop: 16, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 14 },
  filterHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  filterHeadingTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterTitle: { color: adminPalette.text, fontSize: typeScale.bodyCompact, fontWeight: "700" },
  clearButton: { minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "center" },
  clearText: { color: pink, fontSize: typeScale.caption, fontWeight: "700" },
  searchBox: { minHeight: 48, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, borderWidth: 1, borderColor: adminPalette.border, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 13 },
  input: { flex: 1, color: adminPalette.text, fontSize: typeScale.metadata, outlineStyle: "none" } as any,
  dateRow: { flexDirection: "row", gap: 9, marginTop: 9 },
  dateField: { minHeight: 46, flex: 1, minWidth: 0, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, borderWidth: 1, borderColor: adminPalette.border, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7 },
  dateInput: { flex: 1, minWidth: 0, color: adminPalette.text, fontSize: typeScale.caption, outlineStyle: "none" } as any,
  filterLabel: { color: adminPalette.textMuted, fontSize: typeScale.caption, fontWeight: "700" },
  filterStrip: { gap: 7, paddingTop: 7, paddingBottom: 3 },
  filter: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 999, backgroundColor: adminPalette.surfaceSubtle },
  filterActive: { backgroundColor: pink },
  filterText: { color: adminPalette.textSecondary, fontSize: typeScale.caption, fontWeight: "700" },
  filterTextActive: { color: "#FFF" },
  sortLine: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 11 },
  sortLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  sortStrip: { gap: 7, flexGrow: 0 },
  sortOption: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 999, justifyContent: "center" },
  sortOptionActive: { borderColor: `${pink}55`, backgroundColor: `${pink}10` },
  sortText: { color: adminPalette.textSecondary, fontSize: typeScale.caption, fontWeight: "700" },
  sortTextActive: { color: pink },
  resultsCount: { color: adminPalette.textMuted, fontSize: typeScale.caption, marginTop: 12 },

  list: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  payment: { borderRadius: 16, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, padding: 14, gap: 12 },
  paymentHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  paymentDetails: { backgroundColor: adminPalette.surfaceSubtle, borderRadius: 12, padding: 10 },
  paymentFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: "auto" },
  paymentIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  vendor: { color: adminPalette.text, fontSize: typeScale.bodyCompact, fontWeight: "700" },
  plan: { color: adminPalette.textSecondary, fontSize: typeScale.caption, marginTop: 3 },
  ids: { color: adminPalette.textMuted, fontSize: typeScale.caption },
  failure: { color: adminPalette.error, fontSize: typeScale.caption, marginTop: 5 },
  amount: { color: adminPalette.text, fontSize: typeScale.body, fontWeight: "700" },
  date: { color: adminPalette.textMuted, fontSize: typeScale.caption, textAlign: "right", flex: 1 },

  empty: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, alignItems: "center", padding: 28, marginTop: 16 },
  emptyTitle: { color: adminPalette.text, fontSize: typeScale.body, fontWeight: "700", marginTop: 8 },
  emptyText: { color: adminPalette.textSecondary, fontSize: typeScale.caption, marginTop: 3, textAlign: "center" },
  error: { backgroundColor: adminPalette.errorSubtle, borderRadius: 16, padding: 14, flexDirection: "row", justifyContent: "space-between" },
  errorText: { color: adminPalette.error, fontSize: typeScale.caption },
  retry: { color: pink, fontSize: typeScale.caption, fontWeight: "700" },

  // Booking Cards Styling
  bookingList: { gap: 14, marginTop: 16 },
  bookingCard: {
    backgroundColor: adminPalette.surface,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  bCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  bTicketPill: { backgroundColor: "#F3E8FF", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  bTicketPillText: { color: "#7E22CE", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  bBadgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  bStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bStatusBadgeText: { fontSize: 11, fontWeight: "800" },

  partiesRow: { flexDirection: "row", gap: 16, borderTopWidth: 1, borderTopColor: adminPalette.border, paddingTop: 10 },
  bSectionHead: { fontSize: 10, fontWeight: "800", color: adminPalette.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  bClientName: { fontSize: 14, fontWeight: "700", color: adminPalette.text },
  bClientContact: { fontSize: 12, color: adminPalette.textSecondary, marginTop: 1 },

  pkgStrip: { backgroundColor: adminPalette.surfaceSubtle, padding: 10, borderRadius: 10 },
  pkgTitleText: { fontSize: 13, fontWeight: "700", color: adminPalette.text },
  pkgAddonText: { fontSize: 11, color: adminPalette.textSecondary, marginTop: 2 },
  pkgNotesText: { fontSize: 11, fontStyle: "italic", color: adminPalette.textMuted, marginTop: 2 },

  finRow: { flexDirection: "row", gap: 8 },
  finCell: { flex: 1, backgroundColor: adminPalette.surfaceSubtle, padding: 8, borderRadius: 10, alignItems: "center" },
  finCellAdv: { backgroundColor: "#DCFCE7" },
  finCellLabel: { fontSize: 9, fontWeight: "700", color: adminPalette.textMuted },
  finCellLabelAdv: { fontSize: 9, fontWeight: "800", color: "#166534" },
  finCellVal: { fontSize: 13, fontWeight: "800", color: adminPalette.text, marginTop: 2 },
  finCellValAdv: { fontSize: 14, fontWeight: "900", color: "#166534", marginTop: 2 },

  payRefRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  payRefText: { fontSize: 11, color: adminPalette.textMuted },

  cancelBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 12, padding: 12, gap: 8 },
  cancelReasonLabel: { fontSize: 12, fontWeight: "700", color: "#991B1B" },
  cancelReasonVal: { fontWeight: "500", color: "#7F1D1D" },
  refundActionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 4 },
  refundPromptText: { fontSize: 12, fontWeight: "600", color: "#B45309" },
  processRefundBtn: { backgroundColor: "#DC2626", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  processRefundBtnText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  refundDoneBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  refundDoneText: { fontSize: 12, fontWeight: "700", color: "#166534" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { width: "100%", maxWidth: 480, backgroundColor: adminPalette.surface, borderRadius: 20, borderWidth: 1, borderColor: adminPalette.border, padding: 20, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: typeScale.bodyCompact, fontWeight: "800", color: adminPalette.text },
  modalDetailBox: { backgroundColor: adminPalette.surfaceSubtle, padding: 12, borderRadius: 12, gap: 4 },
  modalDetailRow: { fontSize: 12, color: adminPalette.text },
  modalDetailLabel: { fontWeight: "700", color: adminPalette.textSecondary },
  modalInputLabel: { fontSize: 12, fontWeight: "700", color: adminPalette.textSecondary, marginTop: 4 },
  modalInput: { backgroundColor: adminPalette.surfaceSubtle, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: "top", fontSize: typeScale.caption, color: adminPalette.text },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  modalCancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: adminPalette.border },
  modalCancelText: { fontSize: typeScale.caption, fontWeight: "700", color: adminPalette.textSecondary },
  modalSubmitBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: "#DC2626" },
  modalSubmitText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "800" },
});
