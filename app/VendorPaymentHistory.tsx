import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleAlert,
  Clock,
  CreditCard,
  Crown,
  FileSpreadsheet,
  IndianRupee,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import Pressable from "@/components/InteropSafePressable";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale, typeLeading, fonts } from "@/constants/typography";
import {
  VendorTransactionsService,
  type FinanceSummary,
  type TransactionDirection,
  type TransactionStatus,
  type TransactionType,
  type UnifiedTransaction,
} from "@/services/vendorTransactions";
import AddOfflineBookingModal from "@/components/vendor/AddOfflineBookingModal";

type ChannelFilter = "online" | "offline" | "total";
type PortionFilter = "advance_30" | "booking_70" | "all";

const formatMoney = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

export default function VendorPaymentHistory() {
  const router = useRouter();
  const workspace = useVendorWorkspace();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const tablet = width >= 640;
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const isDark = colorScheme === "dark";

  const vendorId = workspace.data.vendor?.id;

  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card Selection & Portion Toggle Tabs
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("online");
  const [portionFilter, setPortionFilter] = useState<PortionFilter>("advance_30");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);

  // Modal
  const [showAddOffline, setShowAddOffline] = useState(false);

  const loadData = useCallback(async (isPullRefresh = false) => {
    if (!vendorId) return;
    if (isPullRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await VendorTransactionsService.listVendorTransactions(vendorId);
      setTransactions(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load transactions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  // Realtime subscription across vendor_bookings, subscription_payments, featured_vendor_payments
  useEffect(() => {
    if (!vendorId) return;
    const unsubscribe = VendorTransactionsService.subscribeToVendorTransactions(vendorId, () => {
      void loadData(true);
    });
    return unsubscribe;
  }, [loadData, vendorId]);

  // Overall Financial Summary
  const summary: FinanceSummary = useMemo(() => {
    return VendorTransactionsService.getFinancialSummary(transactions);
  }, [transactions]);

  // Channel-filtered transactions (Online, Offline, or Total)
  const channelTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const isOnline = t.type === "royallagn_advance" || t.type === "admin_advance";
      const isOffline = t.type === "offline_booking";
      if (channelFilter === "online") return isOnline;
      if (channelFilter === "offline") return isOffline;
      return true; // total (all transactions)
    });
  }, [transactions, channelFilter]);

  // Active totals for the 2 tabs under currently selected card
  const activeAdvanceTotal = useMemo(() => {
    if (channelFilter === "online") return summary.onlineAdvance;
    if (channelFilter === "offline") return summary.offlineAdvance;
    return summary.totalAdvanceAmount;
  }, [channelFilter, summary]);

  const activeBookingTotal = useMemo(() => {
    if (channelFilter === "online") return summary.onlineBookingAmount;
    if (channelFilter === "offline") return summary.offlineBookingAmount;
    return summary.totalBookingAmount;
  }, [channelFilter, summary]);

  // Filtered transactions by portion (advance_30 vs booking_70 vs all) and search query
  const filteredTransactions = useMemo(() => {
    return channelTransactions.filter((t) => {
      // 1. Portion Filter
      const isBooking = (t.totalBookingAmount && t.totalBookingAmount > 0) || t.dueAmount !== undefined;
      if (portionFilter === "advance_30") {
        if (t.type !== "royallagn_advance" && t.type !== "admin_advance" && t.type !== "offline_booking") return false;
      } else if (portionFilter === "booking_70") {
        if (!isBooking) return false;
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesSubtitle = t.subtitle.toLowerCase().includes(query);
        const matchesRef = t.referenceNumber.toLowerCase().includes(query);
        const matchesCounterparty = t.counterparty.toLowerCase().includes(query);
        const matchesMethod = t.paymentMethod.toLowerCase().includes(query);
        const matchesNotes = (t.notes || "").toLowerCase().includes(query);
        if (!matchesTitle && !matchesSubtitle && !matchesRef && !matchesCounterparty && !matchesMethod && !matchesNotes) {
          return false;
        }
      }

      return true;
    });
  }, [channelTransactions, portionFilter, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedTxnId((curr) => (curr === id ? null : id));
  };

  const getTxnIcon = (type: TransactionType) => {
    switch (type) {
      case "royallagn_advance":
      case "admin_advance":
        return <ShieldCheck size={20} color="#059669" />;
      case "offline_booking":
        return <CalendarCheck size={20} color="#0D9488" />;
      case "subscription":
        return <CreditCard size={20} color="#BE123C" />;
      case "featured_placement":
        return <Sparkles size={20} color="#7C3AED" />;
      default:
        return <ReceiptText size={20} color="#BE123C" />;
    }
  };

  const getTxnBadgeInfo = (type: TransactionType) => {
    switch (type) {
      case "royallagn_advance":
      case "admin_advance":
        return { label: "RoyalLagn Advance", bg: isDark ? "#064E3B" : "#ECFDF5", text: "#059669", border: "#A7F3D0" };
      case "offline_booking":
        return { label: "Offline CRM", bg: isDark ? "#134E4A" : "#F0FDFA", text: "#0D9488", border: "#99F6E4" };
      case "subscription":
        return { label: "Subscription", bg: isDark ? "#4C0519" : "#FFF1F2", text: "#BE123C", border: "#FECDD3" };
      case "featured_placement":
        return { label: "Featured Promotion", bg: isDark ? "#3B0764" : "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" };
      default:
        return { label: "Transaction", bg: isDark ? "#1F2937" : "#F3F4F6", text: colors.text, border: colors.border };
    }
  };

  const getStatusBadgeStyle = (status: TransactionStatus) => {
    switch (status) {
      case "completed":
        return { bg: isDark ? "#064E3B" : "#ECFDF5", text: "#059669", border: "#A7F3D0", label: "Completed" };
      case "pending":
        return { bg: isDark ? "#78350F" : "#FEF3C7", text: "#D97706", border: "#FDE68A", label: "Pending Escrow" };
      case "failed":
      case "refunded":
        return { bg: isDark ? "#7F1D1D" : "#FEE2E2", text: "#DC2626", border: "#FECACA", label: "Refunded" };
    }
  };

  // Luxury executive styling tokens
  const uiTheme = useMemo(() => ({
    cardBg: isDark ? "#161D2B" : "#FFFFFF",
    cardBorder: isDark ? "#283449" : "#F1E5E9",
    surfaceSoft: isDark ? "#1F2A3D" : "#FBF7F9",
    textPrimary: isDark ? "#F9FAFB" : "#111827",
    textSecondary: isDark ? "#9CA3AF" : "#574E53",
    brandPink: "#BE123C", // RoyalLagn rich crimson
    brandRose: "#E11D48",
    gold: "#D97706",
    emerald: "#059669",
    teal: "#0D9488",
  }), [isDark]);

  return (
    <View style={[styles.page, { backgroundColor: isDark ? "#0B0F17" : "#FAF8F9" }]}>
      <VendorHeader unread={workspace.data.notifications.filter((item) => !item.is_read).length} />

      <ScrollView
        contentContainerStyle={[styles.content, desktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} tintColor={uiTheme.brandPink} />
        }
      >
        {/* Top Breadcrumb & Executive Navigation Bar */}
        <View style={styles.topNavRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/vendor-dashboard")}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={18} color={uiTheme.textPrimary} />
            <Text style={[styles.backText, { color: uiTheme.textPrimary }]}>Dashboard</Text>
          </Pressable>

          <View style={styles.topRightActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/VendorCalendar")}
              style={({ pressed }) => [
                styles.calendarLinkBtn,
                { backgroundColor: uiTheme.cardBg, borderColor: uiTheme.cardBorder },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Calendar size={14} color={uiTheme.brandPink} />
              <Text style={[styles.calendarLinkText, { color: uiTheme.textPrimary }]}>Calendar</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAddOffline(true)}
              style={({ pressed }) => [
                styles.primaryActionBtn,
                { backgroundColor: uiTheme.brandPink },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryActionText}>Record Offline Booking</Text>
            </Pressable>
          </View>
        </View>

        {/* Executive Header Area */}
        <View style={styles.headerArea}>
          <View style={styles.eyebrowRow}>
            <Crown size={14} color={uiTheme.brandPink} />
            <Text style={[styles.eyebrow, { color: uiTheme.brandPink }]}>ROYALLAGN FINANCE & CRM</Text>
          </View>
          <Text style={[styles.title, { color: uiTheme.textPrimary }]}>Transactions</Text>
          <Text style={[styles.subtitle, { color: uiTheme.textSecondary }]}>
            Verified financial ledger: Subscriptions, Featured promotions, RoyalLagn advance disbursements, and Offline bookings CRM.
          </Text>
        </View>

        {/* Executive Financial Summary: Online earning, Offline earning, Total earning */}
        <View style={styles.kpiGrid}>
          {/* Card 1: Online Earning */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setChannelFilter("online")}
            style={({ pressed }) => [
              styles.kpiCard,
              {
                backgroundColor: uiTheme.cardBg,
                borderColor: channelFilter === "online" ? uiTheme.emerald : uiTheme.cardBorder,
                borderWidth: channelFilter === "online" ? 2 : 1,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.kpiHeader}>
              <View style={[styles.kpiIconWrap, { backgroundColor: isDark ? "#064E3B" : "#DCFCE7" }]}>
                <ShieldCheck size={20} color={isDark ? "#34D399" : "#059669"} />
              </View>
              <View
                style={[
                  styles.kpiBadgePill,
                  {
                    backgroundColor: channelFilter === "online" ? uiTheme.emerald : (isDark ? "#064E3B" : "#ECFDF5"),
                    borderColor: channelFilter === "online" ? uiTheme.emerald : (isDark ? "#047857" : "#A7F3D0"),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.kpiBadgeText,
                    { color: channelFilter === "online" ? "#FFFFFF" : (isDark ? "#34D399" : "#059669") },
                  ]}
                >
                  ONLINE EARNING {channelFilter === "online" ? "✓" : ""}
                </Text>
              </View>
            </View>
            <View style={styles.kpiMainContent}>
              <Text style={[styles.kpiValue, { color: uiTheme.textPrimary }]}>
                {formatMoney(summary.onlineTotal)}
              </Text>
              <Text style={[styles.kpiLabel, { color: uiTheme.textSecondary }]}>
                Verified online bookings value
              </Text>
            </View>

            {/* Split breakdown: Advanced amount 30% & Booking amount 70% */}
            <View style={[styles.kpiBreakdownPod, { backgroundColor: uiTheme.surfaceSoft, borderColor: uiTheme.cardBorder }]}>
              <Pressable
                onPress={() => {
                  setChannelFilter("online");
                  setPortionFilter("advance_30");
                }}
                style={[
                  styles.kpiBreakdownCol,
                  channelFilter === "online" && portionFilter === "advance_30" && {
                    backgroundColor: isDark ? "#064E3B40" : "#ECFDF5",
                    borderRadius: 8,
                    padding: 4,
                  },
                ]}
              >
                <Text style={[styles.kpiBreakdownTitle, { color: uiTheme.textSecondary }]}>
                  Advanced amount 30%
                </Text>
                <Text style={[styles.kpiBreakdownAmount, { color: uiTheme.emerald }]}>
                  {formatMoney(summary.onlineAdvance)}
                </Text>
              </Pressable>
              <View style={[styles.kpiDivider, { backgroundColor: uiTheme.cardBorder }]} />
              <Pressable
                onPress={() => {
                  setChannelFilter("online");
                  setPortionFilter("booking_70");
                }}
                style={[
                  styles.kpiBreakdownCol,
                  channelFilter === "online" && portionFilter === "booking_70" && {
                    backgroundColor: isDark ? "#451A0340" : "#FFFBEB",
                    borderRadius: 8,
                    padding: 4,
                  },
                ]}
              >
                <Text style={[styles.kpiBreakdownTitle, { color: uiTheme.textSecondary }]}>
                  Booking amount 70%
                </Text>
                <Text style={[styles.kpiBreakdownAmount, { color: uiTheme.gold }]}>
                  {formatMoney(summary.onlineBookingAmount)}
                </Text>
              </Pressable>
            </View>
          </Pressable>

          {/* Card 2: Offline Earning */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setChannelFilter("offline")}
            style={({ pressed }) => [
              styles.kpiCard,
              {
                backgroundColor: uiTheme.cardBg,
                borderColor: channelFilter === "offline" ? uiTheme.teal : uiTheme.cardBorder,
                borderWidth: channelFilter === "offline" ? 2 : 1,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.kpiHeader}>
              <View style={[styles.kpiIconWrap, { backgroundColor: isDark ? "#134E4A" : "#CCFBF1" }]}>
                <CalendarCheck size={20} color={isDark ? "#2DD4BF" : "#0D9488"} />
              </View>
              <View
                style={[
                  styles.kpiBadgePill,
                  {
                    backgroundColor: channelFilter === "offline" ? uiTheme.teal : (isDark ? "#134E4A" : "#F0FDFA"),
                    borderColor: channelFilter === "offline" ? uiTheme.teal : (isDark ? "#0F766E" : "#99F6E4"),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.kpiBadgeText,
                    { color: channelFilter === "offline" ? "#FFFFFF" : (isDark ? "#2DD4BF" : "#0D9488") },
                  ]}
                >
                  OFFLINE EARNING {channelFilter === "offline" ? "✓" : ""}
                </Text>
              </View>
            </View>
            <View style={styles.kpiMainContent}>
              <Text style={[styles.kpiValue, { color: uiTheme.textPrimary }]}>
                {formatMoney(summary.offlineTotal)}
              </Text>
              <Text style={[styles.kpiLabel, { color: uiTheme.textSecondary }]}>
                Direct offline & walk-in bookings
              </Text>
            </View>

            {/* Split breakdown: Advanced amount 30% & Booking amount 70% */}
            <View style={[styles.kpiBreakdownPod, { backgroundColor: uiTheme.surfaceSoft, borderColor: uiTheme.cardBorder }]}>
              <Pressable
                onPress={() => {
                  setChannelFilter("offline");
                  setPortionFilter("advance_30");
                }}
                style={[
                  styles.kpiBreakdownCol,
                  channelFilter === "offline" && portionFilter === "advance_30" && {
                    backgroundColor: isDark ? "#134E4A40" : "#F0FDFA",
                    borderRadius: 8,
                    padding: 4,
                  },
                ]}
              >
                <Text style={[styles.kpiBreakdownTitle, { color: uiTheme.textSecondary }]}>
                  Advanced amount 30%
                </Text>
                <Text style={[styles.kpiBreakdownAmount, { color: uiTheme.teal }]}>
                  {formatMoney(summary.offlineAdvance)}
                </Text>
              </Pressable>
              <View style={[styles.kpiDivider, { backgroundColor: uiTheme.cardBorder }]} />
              <Pressable
                onPress={() => {
                  setChannelFilter("offline");
                  setPortionFilter("booking_70");
                }}
                style={[
                  styles.kpiBreakdownCol,
                  channelFilter === "offline" && portionFilter === "booking_70" && {
                    backgroundColor: isDark ? "#451A0340" : "#FFFBEB",
                    borderRadius: 8,
                    padding: 4,
                  },
                ]}
              >
                <Text style={[styles.kpiBreakdownTitle, { color: uiTheme.textSecondary }]}>
                  Booking amount 70%
                </Text>
                <Text style={[styles.kpiBreakdownAmount, { color: uiTheme.gold }]}>
                  {formatMoney(summary.offlineBookingAmount)}
                </Text>
              </Pressable>
            </View>
          </Pressable>

          {/* Card 3: Total Earning */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setChannelFilter("total")}
            style={({ pressed }) => [
              styles.kpiCard,
              {
                backgroundColor: uiTheme.cardBg,
                borderColor: channelFilter === "total" ? uiTheme.brandPink : uiTheme.cardBorder,
                borderWidth: channelFilter === "total" ? 2 : 1,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.kpiHeader}>
              <View style={[styles.kpiIconWrap, { backgroundColor: isDark ? "#4C0519" : "#FFE4E6" }]}>
                <Wallet size={20} color={isDark ? "#FB7185" : "#BE123C"} />
              </View>
              <View
                style={[
                  styles.kpiBadgePill,
                  {
                    backgroundColor: channelFilter === "total" ? uiTheme.brandPink : (isDark ? "#4C0519" : "#FFF1F2"),
                    borderColor: channelFilter === "total" ? uiTheme.brandPink : (isDark ? "#9F1239" : "#FECDD3"),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.kpiBadgeText,
                    { color: channelFilter === "total" ? "#FFFFFF" : (isDark ? "#FB7185" : "#BE123C") },
                  ]}
                >
                  TOTAL EARNING {channelFilter === "total" ? "✓" : ""}
                </Text>
              </View>
            </View>
            <View style={styles.kpiMainContent}>
              <Text style={[styles.kpiValue, { color: uiTheme.brandPink }]}>
                {formatMoney(summary.totalEarnings)}
              </Text>
              <Text style={[styles.kpiLabel, { color: uiTheme.textSecondary }]}>
                Combined gross earnings
              </Text>
            </View>

            {/* Split breakdown: Online & Offline contributions */}
            <View style={[styles.kpiBreakdownPod, { backgroundColor: uiTheme.surfaceSoft, borderColor: uiTheme.cardBorder }]}>
              <Pressable
                onPress={() => setChannelFilter("online")}
                style={[styles.kpiBreakdownCol, { padding: 4 }]}
              >
                <Text style={[styles.kpiBreakdownTitle, { color: uiTheme.textSecondary }]}>
                  Online Earning
                </Text>
                <Text style={[styles.kpiBreakdownAmount, { color: uiTheme.emerald }]}>
                  {formatMoney(summary.onlineTotal)}
                </Text>
              </Pressable>
              <View style={[styles.kpiDivider, { backgroundColor: uiTheme.cardBorder }]} />
              <Pressable
                onPress={() => setChannelFilter("offline")}
                style={[styles.kpiBreakdownCol, { padding: 4 }]}
              >
                <Text style={[styles.kpiBreakdownTitle, { color: uiTheme.textSecondary }]}>
                  Offline Earning
                </Text>
                <Text style={[styles.kpiBreakdownAmount, { color: uiTheme.teal }]}>
                  {formatMoney(summary.offlineTotal)}
                </Text>
              </Pressable>
            </View>

            {/* Footer summary */}
            <View style={styles.kpiFooterNote}>
              <Text style={[styles.kpiFooterText, { color: uiTheme.textSecondary }]}>
                Adv (30%): <Text style={{ color: uiTheme.textPrimary, fontWeight: "700" }}>{formatMoney(summary.totalAdvanceAmount)}</Text> · Booking (70%): <Text style={{ color: uiTheme.textPrimary, fontWeight: "700" }}>{formatMoney(summary.totalBookingAmount)}</Text>
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Category Header & Toggle Tabs for Advanced 30% vs Bookings 70% */}
        <View style={styles.toggleBarSection}>
          <View style={styles.toggleBarRow}>
            {/* The 2 Toggle Tabs */}
            <View style={[styles.toggleContainer, { backgroundColor: uiTheme.cardBg, borderColor: uiTheme.cardBorder }]}>
              {/* Tab 1: Advanced 30% */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setPortionFilter("advance_30")}
                style={[
                  styles.toggleTab,
                  portionFilter === "advance_30" && [
                    styles.toggleTabActive,
                    {
                      backgroundColor: isDark ? "#064E3B" : "#ECFDF5",
                      borderColor: isDark ? "#059669" : "#10B981",
                    },
                  ],
                ]}
              >
                <ShieldCheck
                  size={16}
                  color={portionFilter === "advance_30" ? (isDark ? "#34D399" : "#059669") : uiTheme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleTabText,
                    {
                      color: portionFilter === "advance_30"
                        ? (isDark ? "#34D399" : "#059669")
                        : uiTheme.textSecondary,
                      fontWeight: portionFilter === "advance_30" ? "800" : "600",
                    },
                  ]}
                >
                  Advanced 30%
                </Text>
                <View
                  style={[
                    styles.toggleBadge,
                    {
                      backgroundColor: portionFilter === "advance_30"
                        ? (isDark ? "#047857" : "#059669")
                        : (isDark ? "#1F2A3D" : "#F3F4F6"),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleBadgeText,
                      { color: portionFilter === "advance_30" ? "#FFFFFF" : uiTheme.textSecondary },
                    ]}
                  >
                    {formatMoney(activeAdvanceTotal)}
                  </Text>
                </View>
              </Pressable>

              {/* Tab 2: Bookings 70% */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setPortionFilter("booking_70")}
                style={[
                  styles.toggleTab,
                  portionFilter === "booking_70" && [
                    styles.toggleTabActive,
                    {
                      backgroundColor: isDark ? "#451A03" : "#FFFBEB",
                      borderColor: isDark ? "#D97706" : "#F59E0B",
                    },
                  ],
                ]}
              >
                <Clock
                  size={16}
                  color={portionFilter === "booking_70" ? (isDark ? "#FBBF24" : "#D97706") : uiTheme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleTabText,
                    {
                      color: portionFilter === "booking_70"
                        ? (isDark ? "#FBBF24" : "#D97706")
                        : uiTheme.textSecondary,
                      fontWeight: portionFilter === "booking_70" ? "800" : "600",
                    },
                  ]}
                >
                  Bookings 70%
                </Text>
                <View
                  style={[
                    styles.toggleBadge,
                    {
                      backgroundColor: portionFilter === "booking_70"
                        ? (isDark ? "#B45309" : "#D97706")
                        : (isDark ? "#1F2A3D" : "#F3F4F6"),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleBadgeText,
                      { color: portionFilter === "booking_70" ? "#FFFFFF" : uiTheme.textSecondary },
                    ]}
                  >
                    {formatMoney(activeBookingTotal)}
                  </Text>
                </View>
              </Pressable>

              {/* Tab 3: All */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setPortionFilter("all")}
                style={[
                  styles.toggleTab,
                  portionFilter === "all" && [
                    styles.toggleTabActive,
                    {
                      backgroundColor: `${uiTheme.brandPink}14`,
                      borderColor: uiTheme.brandPink,
                    },
                  ],
                ]}
              >
                <ReceiptText
                  size={16}
                  color={portionFilter === "all" ? uiTheme.brandPink : uiTheme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleTabText,
                    {
                      color: portionFilter === "all" ? uiTheme.brandPink : uiTheme.textSecondary,
                      fontWeight: portionFilter === "all" ? "800" : "600",
                    },
                  ]}
                >
                  All ({channelTransactions.length})
                </Text>
              </Pressable>
            </View>

            {/* Compact Search Box */}
            <View style={[styles.compactSearchBox, { backgroundColor: uiTheme.cardBg, borderColor: uiTheme.cardBorder }]}>
              <Search size={15} color={uiTheme.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by client or ticket..."
                placeholderTextColor={uiTheme.textSecondary}
                style={[styles.compactSearchInput, { color: uiTheme.textPrimary }]}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")} style={{ padding: 4 }}>
                  <X size={14} color={uiTheme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Active Filter Info Banner */}
          <View style={styles.activeFilterBanner}>
            <Text style={[styles.activeFilterText, { color: uiTheme.textSecondary }]}>
              Showing <Text style={{ color: uiTheme.textPrimary, fontWeight: "700" }}>{filteredTransactions.length}</Text> verified records for{" "}
              <Text style={{ color: channelFilter === "online" ? uiTheme.emerald : channelFilter === "offline" ? uiTheme.teal : uiTheme.brandPink, fontWeight: "700" }}>
                {channelFilter === "online" ? "Online Earning" : channelFilter === "offline" ? "Offline Earning" : "Total Business"}
              </Text>
              {" · "}
              <Text style={{ color: uiTheme.textPrimary, fontWeight: "600" }}>
                {portionFilter === "advance_30" ? "Advanced amount (30%)" : portionFilter === "booking_70" ? "Booking amount (70%)" : "All transactions"}
              </Text>
            </Text>
          </View>
        </View>

        {/* Transactions List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={uiTheme.brandPink} />
            <Text style={[styles.loadingText, { color: uiTheme.textSecondary }]}>
              Syncing RoyalLagn verified transactions…
            </Text>
          </View>
        ) : error ? (
          <View style={[styles.errorCard, { backgroundColor: uiTheme.cardBg, borderColor: "#FCA5A5" }]}>
            <CircleAlert size={20} color="#DC2626" />
            <Text style={{ color: "#DC2626", fontWeight: "600" }}>{error}</Text>
          </View>
        ) : filteredTransactions.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: uiTheme.cardBg, borderColor: uiTheme.cardBorder }]}>
            <View style={[styles.emptyIconPod, { backgroundColor: `${uiTheme.brandPink}12` }]}>
              <FileSpreadsheet size={36} color={uiTheme.brandPink} />
            </View>
            <Text style={[styles.emptyTitle, { color: uiTheme.textPrimary }]}>No transactions found</Text>
            <Text style={[styles.emptyDesc, { color: uiTheme.textSecondary }]}>
              {searchQuery
                ? `No matching records found for "${searchQuery}". Try modifying your search query.`
                : channelFilter === "offline"
                ? "No offline CRM bookings recorded yet. Record your walk-in and direct customer bookings to begin tracking advance payouts and due balances."
                : portionFilter === "advance_30"
                ? "No 30% advance transactions recorded for this category."
                : portionFilter === "booking_70"
                ? "No 70% booking balances recorded for this category."
                : "No transactions found in this category."}
            </Text>
            {channelFilter === "offline" ? (
              <Pressable
                onPress={() => setShowAddOffline(true)}
                style={[styles.emptyActionBtn, { backgroundColor: uiTheme.teal }]}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.emptyActionText}>Record Offline Booking</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.transactionsList}>
            <View style={styles.listHeaderRow}>
              <Text style={[styles.listCount, { color: uiTheme.textSecondary }]}>
                Showing <Text style={{ color: uiTheme.textPrimary, fontWeight: "700" }}>{filteredTransactions.length}</Text> verified records
              </Text>
            </View>

            {filteredTransactions.map((item) => {
              const isAdvance = item.type === "royallagn_advance" || item.type === "admin_advance";
              const isOffline = item.type === "offline_booking";
              const isInflow = item.direction === "inflow";
              const isExpanded = expandedTxnId === item.id;
              const typeBadge = getTxnBadgeInfo(item.type);
              const statusStyle = getStatusBadgeStyle(item.status);

              const isBooking70 = portionFilter === "booking_70";
              const isAdvance30 = portionFilter === "advance_30";

              // Amount to show depending on the active tab
              const displayAmount = isBooking70 && item.dueAmount !== undefined
                ? item.dueAmount
                : item.amount;

              // Title and badge adaptations
              let customBadgeLabel = typeBadge.label;
              let customBadgeBg = typeBadge.bg;
              let customBadgeBorder = typeBadge.border;
              let customBadgeText = typeBadge.text;

              if (isBooking70) {
                customBadgeLabel = isOffline ? "Offline Booking (70%)" : "RoyalLagn Booking (70%)";
                customBadgeBg = isDark ? "#451A03" : "#FFFBEB";
                customBadgeBorder = isDark ? "#78350F" : "#FDE68A";
                customBadgeText = uiTheme.gold;
              } else if (isAdvance30) {
                customBadgeLabel = isOffline ? "Offline Advance (30%)" : "RoyalLagn Advance (30%)";
                customBadgeBg = isDark ? "#064E3B" : "#ECFDF5";
                customBadgeBorder = isDark ? "#047857" : "#A7F3D0";
                customBadgeText = uiTheme.emerald;
              }

              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleExpand(item.id)}
                  style={({ pressed }) => [
                    styles.txnCard,
                    {
                      backgroundColor: uiTheme.cardBg,
                      borderColor: isExpanded ? uiTheme.brandPink : uiTheme.cardBorder,
                    },
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <View style={styles.txnMainRow}>
                    {/* Left Icon Badge Pod */}
                    <View
                      style={[
                        styles.txnIconWrap,
                        {
                          backgroundColor: isBooking70
                            ? (isDark ? "#451A03" : "#FEF3C7")
                            : customBadgeBg,
                          borderColor: isBooking70
                            ? (isDark ? "#78350F" : "#FDE68A")
                            : customBadgeBorder,
                        },
                      ]}
                    >
                      {isBooking70 ? (
                        <Clock size={20} color={uiTheme.gold} />
                      ) : (
                        getTxnIcon(item.type)
                      )}
                    </View>

                    {/* Middle Details */}
                    <View style={styles.txnInfo}>
                      {/* Top Badges Row */}
                      <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: customBadgeBg, borderColor: customBadgeBorder }]}>
                          <Text style={[styles.typeBadgeText, { color: customBadgeText }]}>
                            {customBadgeLabel}
                          </Text>
                        </View>

                        <Text style={[styles.dateText, { color: uiTheme.textSecondary }]}>
                          {item.displayDate}
                        </Text>
                      </View>

                      {/* Title */}
                      <Text style={[styles.txnTitle, { color: uiTheme.textPrimary }]} numberOfLines={1}>
                        {isBooking70
                          ? `Booking Balance: ${item.counterparty}`
                          : item.title}
                      </Text>

                      {/* Subtitle */}
                      <Text style={[styles.txnSubtitle, { color: uiTheme.textSecondary }]} numberOfLines={1}>
                        {item.subtitle}
                      </Text>

                      {/* Metadata Chips */}
                      <View style={styles.tagsRow}>
                        <View style={[styles.methodTag, { backgroundColor: uiTheme.surfaceSoft, borderColor: uiTheme.cardBorder }]}>
                          <Text style={[styles.methodTagText, { color: uiTheme.textPrimary }]}>
                            {isBooking70 ? "Direct Client Payment" : item.paymentMethod}
                          </Text>
                        </View>

                        <View style={[styles.statusTag, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                          <Text style={[styles.statusTagText, { color: statusStyle.text }]}>
                            {isBooking70
                              ? (item.dueAmount === 0 ? "Fully Paid" : "Remaining Event Balance")
                              : item.statusLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Right Amount Column */}
                    <View style={styles.txnAmountWrap}>
                      <Text
                        style={[
                          styles.txnAmount,
                          {
                            color: isBooking70
                              ? uiTheme.gold
                              : isInflow
                              ? uiTheme.emerald
                              : uiTheme.textPrimary,
                          },
                        ]}
                      >
                        {isBooking70 ? "" : isInflow ? "+" : "-"}{formatMoney(displayAmount)}
                      </Text>

                      {/* Total and Due Breakdown */}
                      {item.totalBookingAmount ? (
                        <View style={styles.dueWrap}>
                          <Text style={[styles.dueTotalText, { color: uiTheme.textSecondary }]}>
                            Total: {formatMoney(item.totalBookingAmount)}
                          </Text>

                          {isBooking70 ? (
                            <View style={[styles.dueBadge, { backgroundColor: isDark ? "#064E3B" : "#ECFDF5", borderColor: "#A7F3D0" }]}>
                              <Text style={[styles.dueBadgeText, { color: uiTheme.emerald }]}>
                                30% Adv: {formatMoney(item.amount)}
                              </Text>
                            </View>
                          ) : item.dueAmount !== undefined && item.dueAmount > 0 ? (
                            <View style={[styles.dueBadge, { backgroundColor: isDark ? "#451A03" : "#FFFBEB", borderColor: "#FDE68A" }]}>
                              <Text style={[styles.dueBadgeText, { color: uiTheme.gold }]}>
                                70% Due: {formatMoney(item.dueAmount)}
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.dueBadge, { backgroundColor: isDark ? "#064E3B" : "#ECFDF5", borderColor: "#A7F3D0" }]}>
                              <Text style={[styles.dueBadgeText, { color: uiTheme.emerald }]}>
                                Fully Paid
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : null}

                      <View style={styles.expandChevron}>
                        {isExpanded ? (
                          <ChevronUp size={16} color={uiTheme.textSecondary} />
                        ) : (
                          <ChevronDown size={16} color={uiTheme.textSecondary} />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Expanded Breakdown Drawer */}
                  {isExpanded ? (
                    <View
                      style={[
                        styles.expandedArea,
                        {
                          borderTopColor: isDark ? "#283449" : "#F3EBF0",
                          backgroundColor: uiTheme.surfaceSoft,
                        },
                      ]}
                    >
                      <View style={styles.expandDetailsGrid}>
                        <View style={styles.expandItem}>
                          <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>Counterparty / Entity:</Text>
                          <Text style={[styles.expandVal, { color: uiTheme.textPrimary }]}>{item.counterparty}</Text>
                        </View>

                        <View style={styles.expandItem}>
                          <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>Reference / Ticket ID:</Text>
                          <Text style={[styles.expandVal, { color: uiTheme.textPrimary }]}>{item.referenceNumber}</Text>
                        </View>

                        {item.eventDate ? (
                          <View style={styles.expandItem}>
                            <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>Event Date:</Text>
                            <Text style={[styles.expandVal, { color: uiTheme.textPrimary }]}>{item.eventDate}</Text>
                          </View>
                        ) : null}

                        {item.totalBookingAmount ? (
                          <View style={styles.expandItem}>
                            <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>Total Booking Value:</Text>
                            <Text style={[styles.expandVal, { color: uiTheme.textPrimary }]}>{formatMoney(item.totalBookingAmount)}</Text>
                          </View>
                        ) : null}

                        <View style={styles.expandItem}>
                          <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>30% Advance Portion:</Text>
                          <Text style={[styles.expandVal, { color: uiTheme.emerald }]}>{formatMoney(item.amount)}</Text>
                        </View>

                        {item.dueAmount !== undefined ? (
                          <View style={styles.expandItem}>
                            <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>70% Booking Balance:</Text>
                            <Text style={[styles.expandVal, { color: uiTheme.gold }]}>{formatMoney(item.dueAmount)}</Text>
                          </View>
                        ) : null}

                        {item.notes ? (
                          <View style={[styles.expandItem, { width: "100%" }]}>
                            <Text style={[styles.expandLabel, { color: uiTheme.textSecondary }]}>Details & Remarks:</Text>
                            <Text style={[styles.expandVal, { color: uiTheme.textPrimary }]}>{item.notes}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Reusable Offline Booking CRM Modal */}
      {vendorId ? (
        <AddOfflineBookingModal
          visible={showAddOffline}
          vendorId={vendorId}
          onClose={() => setShowAddOffline(false)}
          onSuccess={() => void loadData(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 56,
    gap: 20,
  },
  contentDesktop: {
    maxWidth: 1100,
    paddingHorizontal: 28,
  },
  topNavRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
  },
  topRightActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: "100%",
    alignItems: "center",
    gap: 10,
  },
  calendarLinkBtn: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  calendarLinkText: {
    fontSize: 13,
    fontWeight: "600",
  },
  primaryActionBtn: {
    minHeight: 48,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: "#BE123C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  headerArea: {
    gap: 6,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.sans.bold,
    letterSpacing: 1.4,
    fontWeight: "800",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 720,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: 260,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  kpiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  kpiBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  kpiMainContent: {
    gap: 3,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  kpiLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  kpiBreakdownPod: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  kpiBreakdownCol: {
    flex: 1,
    gap: 3,
  },
  kpiBreakdownTitle: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  kpiBreakdownAmount: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  kpiDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 10,
  },
  kpiFooterNote: {
    paddingTop: 2,
  },
  kpiFooterText: {
    fontSize: 11,
    lineHeight: 15,
  },
  toggleBarSection: {
    gap: 10,
  },
  toggleBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    flexWrap: "wrap",
  },
  toggleTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  toggleTabActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  toggleTabText: {
    fontSize: 13,
  },
  toggleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  toggleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  compactSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    minWidth: 240,
    flex: 1,
    maxWidth: 360,
  },
  compactSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  activeFilterBanner: {
    paddingHorizontal: 4,
  },
  activeFilterText: {
    fontSize: 12,
    lineHeight: 18,
  },
  loadingWrap: {
    padding: 48,
    alignItems: "center",
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyWrap: {
    padding: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  emptyIconPod: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 440,
    lineHeight: 20,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 6,
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  transactionsList: {
    gap: 12,
  },
  listHeaderRow: {
    paddingHorizontal: 4,
  },
  listCount: {
    fontSize: 12,
  },
  txnCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  txnMainRow: {
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  txnIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  txnInfo: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  dateText: {
    fontSize: 12,
  },
  txnTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginTop: 2,
  },
  txnSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  methodTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  methodTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  txnAmountWrap: {
    alignItems: "flex-end",
    gap: 4,
  },
  txnAmount: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  dueWrap: {
    alignItems: "flex-end",
    gap: 3,
  },
  dueTotalText: {
    fontSize: 11,
  },
  dueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  expandChevron: {
    marginTop: 4,
  },
  expandedArea: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  expandItem: {
    minWidth: 200,
    gap: 3,
  },
  expandLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  expandVal: {
    fontSize: 13,
    fontWeight: "600",
  },
});
