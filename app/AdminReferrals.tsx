import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  AlertCircle,
  ArrowDownUp,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Filter,
  Lock,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Unlock,
  User,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { adminContentWidth } from "@/utils/responsiveLayout";
import { adminPalette } from "@/theme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  ReferralCommissionService,
  CustomerPaymentDestination,
  ReferralPayoutRequest,
  ReferralCommissionTransaction,
} from "@/services/referralCommission";

const pink = adminPalette.brand;
const money = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

type MainTab = "verifications" | "withdrawals" | "ledger";

export default function AdminReferrals() {
  const { isPhone, isTablet, contentPadding, width } = useResponsiveLayout();
  const compactTabs = adminContentWidth(width) - contentPadding * 2 < 980;
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const { identity } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<MainTab>("verifications");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // ----------------- Tab 1: Verifications State -----------------
  const [destinations, setDestinations] = useState<CustomerPaymentDestination[]>([]);
  const [destStatusFilter, setDestStatusFilter] = useState<string>("all");
  const [destSearch, setDestSearch] = useState("");

  // ----------------- Tab 2: Withdrawals State -----------------
  const [payouts, setPayouts] = useState<ReferralPayoutRequest[]>([]);
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<string>("all");
  const [payoutSearch, setPayoutSearch] = useState("");

  // ----------------- Tab 3: Ledger State -----------------
  const [ledgerEntries, setLedgerEntries] = useState<ReferralCommissionTransaction[]>([]);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<string>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");

  // ----------------- Modals State -----------------
  // Inspect QR Modal
  const [qrModalUrl, setQrModalUrl] = useState<string | null>(null);
  const [qrModalDetails, setQrModalDetails] = useState<{ upiId: string; name: string } | null>(null);

  // Approve Destination Modal
  const [approveModalItem, setApproveModalItem] = useState<CustomerPaymentDestination | null>(null);
  const [observedNameInput, setObservedNameInput] = useState("");
  const [approveNotesInput, setApproveNotesInput] = useState("");

  // Reject / Request Changes Destination Modal
  const [rejectDestModalItem, setRejectDestModalItem] = useState<CustomerPaymentDestination | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [rejectDestNotesInput, setRejectDestNotesInput] = useState("");

  // Mark Withdrawal Paid Modal
  const [payModalRequest, setPayModalRequest] = useState<ReferralPayoutRequest | null>(null);
  const [payoutStatusTab, setPayoutStatusTab] = useState<"processing" | "payment_pending" | "paid">("paid");
  const [utrInput, setUtrInput] = useState("");
  const [sourceAccountInput, setSourceAccountInput] = useState("RoyalLagn Business Current A/C (HDFC UPI)");
  const [payoutNotesInput, setPayoutNotesInput] = useState("");

  // Reject Withdrawal Modal
  const [rejectWithdrawalModalReq, setRejectWithdrawalModalReq] = useState<ReferralPayoutRequest | null>(null);
  const [rejectWithdrawalReason, setRejectWithdrawalReason] = useState("");

  // Reconcile Withdrawal Failure Modal
  const [reconcileModalReq, setReconcileModalReq] = useState<ReferralPayoutRequest | null>(null);
  const [reconcileStatusType, setReconcileStatusType] = useState<"failed" | "reversed">("failed");
  const [reconcileReason, setReconcileReason] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");

  // Feedback banner
  const [bannerMessage, setBannerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showBanner = (type: "success" | "error", text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => setBannerMessage(null), 5000);
  };

  const copyToClipboard = async (text: string, label: string = "Value") => {
    if (!text) return;
    try {
      if (Clipboard && Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(text);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      showBanner("success", `${label} copied to clipboard!`);
    } catch {
      Alert.alert("Copied", `${label}: ${text}`);
    }
  };

  // ----------------- Data Fetching -----------------
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [destList, reqList, commList] = await Promise.all([
        ReferralCommissionService.listAdminPaymentDestinations(),
        ReferralCommissionService.listAdminWithdrawalRequests(),
        ReferralCommissionService.listAdminCommissionLedger(),
      ]);

      setDestinations(destList);
      setPayouts(reqList);
      setLedgerEntries(commList);
    } catch (err: any) {
      console.warn("Error loading referral admin data:", err);
      showBanner("error", "Failed to load referral data. Please check network connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const unsubscribe = ReferralCommissionService.subscribeToReferralRealtime(() => {
      void loadData(true);
    });
    return () => {
      unsubscribe();
    };
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  // ----------------- Filtered Datasets -----------------
  const pendingDestCount = useMemo(
    () => destinations.filter((d) => d.status === "pending").length,
    [destinations]
  );

  const pendingWithdrawalCount = useMemo(
    () =>
      payouts.filter((p) =>
        ["requested", "under_review", "approved", "processing", "payment_pending"].includes(p.status)
      ).length,
    [payouts]
  );

  const filteredDestinations = useMemo(() => {
    return destinations.filter((item) => {
      const matchesStatus =
        destStatusFilter === "all" ||
        item.status === destStatusFilter;

      if (!matchesStatus) return false;
      if (!destSearch.trim()) return true;

      const q = destSearch.trim().toLowerCase();
      return (
        item.beneficiaryName.toLowerCase().includes(q) ||
        item.upiId.toLowerCase().includes(q) ||
        (item.mobile && item.mobile.includes(q)) ||
        (item.customerProfile?.fullName && item.customerProfile.fullName.toLowerCase().includes(q)) ||
        (item.customerProfile?.email && item.customerProfile.email.toLowerCase().includes(q))
      );
    });
  }, [destinations, destSearch, destStatusFilter]);

  const filteredPayouts = useMemo(() => {
    return payouts.filter((item) => {
      let matchesStatus = true;
      if (payoutStatusFilter === "action_needed") {
        matchesStatus = ["requested", "under_review", "approved"].includes(item.status);
      } else if (payoutStatusFilter === "processing") {
        matchesStatus = item.status === "processing";
      } else if (payoutStatusFilter === "payment_pending") {
        matchesStatus = item.status === "payment_pending";
      } else if (payoutStatusFilter === "paid") {
        matchesStatus = item.status === "paid" || item.status === "processed";
      } else if (payoutStatusFilter === "rejected_or_failed") {
        matchesStatus = ["rejected", "failed", "reversed", "cancelled"].includes(item.status);
      }

      if (!matchesStatus) return false;
      if (!payoutSearch.trim()) return true;

      const q = payoutSearch.trim().toLowerCase();
      return (
        item.beneficiaryName.toLowerCase().includes(q) ||
        item.mobile.includes(q) ||
        (item.transactionRef && item.transactionRef.toLowerCase().includes(q)) ||
        (item.destinationSnapshot?.upi_id && item.destinationSnapshot.upi_id.toLowerCase().includes(q)) ||
        (item.customerProfile?.fullName && item.customerProfile.fullName.toLowerCase().includes(q)) ||
        (item.customerProfile?.email && item.customerProfile.email.toLowerCase().includes(q))
      );
    });
  }, [payouts, payoutSearch, payoutStatusFilter]);

  const filteredLedger = useMemo(() => {
    return ledgerEntries.filter((item) => {
      const matchesStatus =
        ledgerStatusFilter === "all" || item.status === ledgerStatusFilter;

      if (!matchesStatus) return false;
      if (!ledgerSearch.trim()) return true;

      const q = ledgerSearch.trim().toLowerCase();
      return (
        item.referralCode.toLowerCase().includes(q) ||
        (item.ticketId && item.ticketId.toLowerCase().includes(q)) ||
        (item.referrerProfile?.fullName && item.referrerProfile.fullName.toLowerCase().includes(q)) ||
        (item.referrerProfile?.email && item.referrerProfile.email.toLowerCase().includes(q)) ||
        (item.referredProfile?.fullName && item.referredProfile.fullName.toLowerCase().includes(q))
      );
    });
  }, [ledgerEntries, ledgerSearch, ledgerStatusFilter]);

  // Ledger summary stats
  const ledgerStats = useMemo(() => {
    const totalCount = ledgerEntries.length;
    const earnedGross = ledgerEntries
      .filter((c) => c.status === "earned")
      .reduce((sum, c) => sum + c.referrerReward, 0);
    const pendingGross = ledgerEntries
      .filter((c) => c.status === "pending")
      .reduce((sum, c) => sum + c.referrerReward, 0);
    const totalPaid = payouts
      .filter((p) => p.status === "paid" || p.status === "processed")
      .reduce((sum, p) => sum + p.amount, 0);
    const reserved = payouts
      .filter((p) => ["requested", "under_review", "approved", "processing", "payment_pending"].includes(p.status))
      .reduce((sum, p) => sum + p.amount, 0);

    return { totalCount, earnedGross, pendingGross, totalPaid, reserved };
  }, [ledgerEntries, payouts]);

  // ----------------- Verification Actions -----------------
  const handleOpenApproveModal = (item: CustomerPaymentDestination) => {
    setApproveModalItem(item);
    setObservedNameInput(item.observedRecipientName || item.beneficiaryName);
    setApproveNotesInput("");
  };

  const handleConfirmApproval = async () => {
    if (!approveModalItem) return;
    setActionInProgress(approveModalItem.id);
    try {
      const res = await ReferralCommissionService.reviewPaymentDestination(
        approveModalItem.id,
        "approved",
        observedNameInput.trim() || approveModalItem.beneficiaryName,
        approveNotesInput.trim() || undefined
      );

      if (!res.success) {
        showBanner("error", res.message || "Approval failed.");
      } else {
        showBanner("success", `Payment destination approved for ${approveModalItem.beneficiaryName}.`);
        setApproveModalItem(null);
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Approval action failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenRejectModal = (item: CustomerPaymentDestination) => {
    setRejectDestModalItem(item);
    setRejectionReasonInput("");
    setRejectDestNotesInput("");
  };

  const handleConfirmRejectDest = async () => {
    if (!rejectDestModalItem) return;
    if (!rejectionReasonInput.trim()) {
      Alert.alert("Reason Required", "Please enter a reason so the customer understands what needs correction.");
      return;
    }

    setActionInProgress(rejectDestModalItem.id);
    try {
      const res = await ReferralCommissionService.reviewPaymentDestination(
        rejectDestModalItem.id,
        "changes_required",
        undefined,
        rejectDestNotesInput.trim() || undefined,
        rejectionReasonInput.trim()
      );

      if (!res.success) {
        showBanner("error", res.message || "Action failed.");
      } else {
        showBanner("success", "Changes requested from customer.");
        setRejectDestModalItem(null);
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Rejection action failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  // ----------------- Payout Actions -----------------
  const handleClaimPayout = async (request: ReferralPayoutRequest) => {
    setActionInProgress(request.id);
    try {
      const res = await ReferralCommissionService.claimWithdrawalPayout(request.id);
      if (!res.success) {
        showBanner("error", res.message || "Could not claim payout request.");
      } else {
        showBanner("success", "Payout request claimed for processing.");
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Claim action failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReleaseClaim = async (request: ReferralPayoutRequest) => {
    setActionInProgress(request.id);
    try {
      const res = await ReferralCommissionService.releaseWithdrawalClaim(request.id);
      if (!res.success) {
        showBanner("error", res.message || "Could not release claim.");
      } else {
        showBanner("success", "Claim released back to pool.");
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Release action failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenPayModal = (request: ReferralPayoutRequest) => {
    setPayModalRequest(request);
    setPayoutStatusTab(
      request.status === "processing"
        ? "processing"
        : request.status === "payment_pending"
        ? "payment_pending"
        : "paid"
    );
    setUtrInput(request.transactionRef || "");
    setSourceAccountInput(request.businessSourceAccount || "RoyalLagn Business Current A/C (HDFC UPI)");
    setPayoutNotesInput(request.reconciliationNotes || "");
  };

  const handleConfirmPayModal = async () => {
    if (!payModalRequest) return;
    if (payoutStatusTab === "paid" && !utrInput.trim()) {
      Alert.alert("UTR / Reference Required", "Please provide the bank UTR or IMPS/UPI reference number.");
      return;
    }

    setActionInProgress(payModalRequest.id);
    try {
      const res = await ReferralCommissionService.updatePayoutStatus(
        payModalRequest.id,
        payoutStatusTab,
        utrInput.trim(),
        sourceAccountInput.trim(),
        payoutNotesInput.trim() || undefined
      );

      if (!res.success) {
        showBanner("error", res.message || "Failed to update withdrawal status.");
      } else {
        if (payoutStatusTab === "paid") {
          showBanner("success", `Withdrawal of ${money(payModalRequest.amount)} marked as Paid! Customer balance settled.`);
        } else if (payoutStatusTab === "processing") {
          showBanner("success", `Withdrawal marked as Processing Payment.`);
        } else {
          showBanner("success", `Withdrawal marked as Payment Pending.`);
        }
        setPayModalRequest(null);
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Payout status update failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkPaymentPending = async (request: ReferralPayoutRequest) => {
    setActionInProgress(request.id);
    try {
      const res = await ReferralCommissionService.markWithdrawalPaymentPending(
        request.id,
        "Marked as Payment Pending awaiting bank settlement confirmation."
      );
      if (!res.success) {
        showBanner("error", res.message || "Action failed.");
      } else {
        showBanner("success", "Payout status updated to Payment Pending.");
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Action failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenRejectWithdrawal = (request: ReferralPayoutRequest) => {
    setRejectWithdrawalModalReq(request);
    setRejectWithdrawalReason("");
  };

  const handleConfirmRejectWithdrawal = async () => {
    if (!rejectWithdrawalModalReq) return;
    if (!rejectWithdrawalReason.trim()) {
      Alert.alert("Reason Required", "Please enter the rejection reason.");
      return;
    }

    setActionInProgress(rejectWithdrawalModalReq.id);
    try {
      const res = await ReferralCommissionService.rejectWithdrawal(
        rejectWithdrawalModalReq.id,
        rejectWithdrawalReason.trim()
      );

      if (!res.success) {
        showBanner("error", res.message || "Rejection failed.");
      } else {
        showBanner("success", `Request rejected. ${money(rejectWithdrawalModalReq.amount)} restored to customer wallet.`);
        setRejectWithdrawalModalReq(null);
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Rejection failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenReconcile = (request: ReferralPayoutRequest) => {
    setReconcileModalReq(request);
    setReconcileStatusType("failed");
    setReconcileReason("");
    setReconcileNotes("");
  };

  const handleConfirmReconcile = async () => {
    if (!reconcileModalReq) return;
    if (!reconcileReason.trim()) {
      Alert.alert("Reason Required", "Please enter the reason for failure or reversal.");
      return;
    }

    setActionInProgress(reconcileModalReq.id);
    try {
      const res = await ReferralCommissionService.reconcileWithdrawalFailure(
        reconcileModalReq.id,
        reconcileStatusType,
        reconcileReason.trim(),
        reconcileNotes.trim() || undefined
      );

      if (!res.success) {
        showBanner("error", res.message || "Reconciliation failed.");
      } else {
        showBanner("success", `Reconciled as ${reconcileStatusType}. Funds restored to customer wallet.`);
        setReconcileModalReq(null);
        await loadData(true);
      }
    } catch (err: any) {
      showBanner("error", err.message || "Reconciliation failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding }]}
      >
        {/* Header */}
        <AdminPageHeader
          title="Referral & Payout Operations"
          subtitle="Customer payment detail verifications, manual UPI payouts, and platform commission ledgers."
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh Data"
              onPress={() => void loadData(true)}
              style={styles.refreshBtn}
            >
              <RefreshCw
                size={18}
                color={pink}
                style={refreshing ? { transform: [{ rotate: "45deg" }] } : undefined}
              />
            </Pressable>
          }
        />

        {/* Global Feedback Banner */}
        {bannerMessage && (
          <View
            style={[
              styles.feedbackBanner,
              bannerMessage.type === "success" ? styles.bannerSuccess : styles.bannerError,
            ]}
          >
            {bannerMessage.type === "success" ? (
              <CircleCheck size={18} color="#15803D" />
            ) : (
              <AlertCircle size={18} color="#B91C1C" />
            )}
            <Text
              style={[
                styles.bannerText,
                bannerMessage.type === "success" ? styles.bannerTextSuccess : styles.bannerTextError,
              ]}
            >
              {bannerMessage.text}
            </Text>
          </View>
        )}

        {/* Top Segmented Tab Switcher */}
        <View style={styles.tabBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={compactTabs}
            contentContainerStyle={compactTabs ? styles.tabBarScroll : styles.tabBarScrollFill}
          >
          <Pressable
            onPress={() => setActiveTab("verifications")}
            style={[styles.tabButton, !compactTabs && styles.tabButtonFill, activeTab === "verifications" && styles.tabButtonActive]}
          >
            <ShieldCheck
              size={18}
              color={activeTab === "verifications" ? "#FFF" : adminPalette.textSecondary}
            />
            <Text
              style={[styles.tabButtonText, activeTab === "verifications" && styles.tabButtonTextActive]}
            >
              Payment Verifications
            </Text>
            {pendingDestCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingDestCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("withdrawals")}
            style={[styles.tabButton, !compactTabs && styles.tabButtonFill, activeTab === "withdrawals" && styles.tabButtonActive]}
          >
            <Wallet
              size={18}
              color={activeTab === "withdrawals" ? "#FFF" : adminPalette.textSecondary}
            />
            <Text
              style={[styles.tabButtonText, activeTab === "withdrawals" && styles.tabButtonTextActive]}
            >
              Withdrawal Requests
            </Text>
            {pendingWithdrawalCount > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: "#EA580C" }]}>
                <Text style={styles.tabBadgeText}>{pendingWithdrawalCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("ledger")}
            style={[styles.tabButton, !compactTabs && styles.tabButtonFill, activeTab === "ledger" && styles.tabButtonActive]}
          >
            <ReceiptText
              size={18}
              color={activeTab === "ledger" ? "#FFF" : adminPalette.textSecondary}
            />
            <Text
              style={[styles.tabButtonText, activeTab === "ledger" && styles.tabButtonTextActive]}
            >
              Platform Ledger
            </Text>
          </Pressable>
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={pink} />
            <Text style={styles.loadingText}>Loading referral data...</Text>
          </View>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* TAB 1: PAYMENT VERIFICATIONS                                             */}
            {/* ========================================================================= */}
            {activeTab === "verifications" && (
              <View style={styles.sectionWrap}>
                {/* Metric Summary Ribbon */}
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>Total Submissions</Text>
                    <Text style={styles.kpiVal}>{destinations.length}</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#FDE68A", backgroundColor: "#FEFCE8" }]}>
                    <Text style={[styles.kpiLabel, { color: "#854D0E" }]}>Pending Review</Text>
                    <Text style={[styles.kpiVal, { color: "#B45309" }]}>{pendingDestCount}</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" }]}>
                    <Text style={[styles.kpiLabel, { color: "#166534" }]}>Approved</Text>
                    <Text style={[styles.kpiVal, { color: "#15803D" }]}>
                      {destinations.filter((d) => d.status === "approved").length}
                    </Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#FECDD3", backgroundColor: "#FFF1F2" }]}>
                    <Text style={[styles.kpiLabel, { color: "#9F1239" }]}>Changes Required</Text>
                    <Text style={[styles.kpiVal, { color: "#BE123C" }]}>
                      {destinations.filter((d) => d.status === "changes_required").length}
                    </Text>
                  </View>
                </View>

                {/* Filter and Search Bar */}
                <View style={styles.filterBar}>
                  <View style={styles.searchBox}>
                    <Search size={16} color={adminPalette.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search customer, beneficiary, UPI, email..."
                      placeholderTextColor={adminPalette.textMuted}
                      value={destSearch}
                      onChangeText={setDestSearch}
                    />
                    {destSearch ? (
                      <Pressable onPress={() => setDestSearch("")}>
                        <X size={16} color={adminPalette.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterPillsStrip}
                  >
                    {[
                      { key: "all", label: "All" },
                      { key: "pending", label: `Pending Review (${pendingDestCount})` },
                      { key: "approved", label: "Approved" },
                      { key: "changes_required", label: "Changes Required" },
                    ].map((f) => (
                      <Pressable
                        key={f.key}
                        onPress={() => setDestStatusFilter(f.key)}
                        style={[
                          styles.filterPill,
                          destStatusFilter === f.key && styles.filterPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterPillText,
                            destStatusFilter === f.key && styles.filterPillTextActive,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Destinations List */}
                {filteredDestinations.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <ShieldCheck size={36} color={adminPalette.textMuted} />
                    <Text style={styles.emptyTitle}>No payment submissions found</Text>
                    <Text style={styles.emptySubtitle}>
                      {destSearch || destStatusFilter !== "all"
                        ? "Try clearing filters to see all submissions."
                        : "No customer payment verification submissions recorded yet."}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardsGrid}>
                    {filteredDestinations.map((item) => {
                      const isPending = item.status === "pending" || item.status === "under_review";
                      const isApproved = item.status === "approved";
                      const isChangesReq = item.status === "changes_required";
                      const isBusy = actionInProgress === item.id;

                      return (
                        <View key={item.id} style={styles.card}>
                          {/* Card Top */}
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cardTitle}>
                                {item.customerProfile?.fullName || "Public Customer"}
                              </Text>
                              <Text style={styles.cardSubtitle}>
                                {item.customerProfile?.email || "No email"} •{" "}
                                {item.mobile || item.customerProfile?.phone || "No phone"}
                              </Text>
                            </View>
                            <View style={styles.badgeWrap}>
                              {isPending && (
                                <View style={[styles.statusBadge, styles.badgeAmber]}>
                                  <Clock size={12} color="#B45309" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextAmber]}>
                                    Pending Review
                                  </Text>
                                </View>
                              )}
                              {isApproved && (
                                <View style={[styles.statusBadge, styles.badgeGreen]}>
                                  <CheckCircle2 size={12} color="#15803D" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextGreen]}>
                                    Approved
                                  </Text>
                                </View>
                              )}
                              {isChangesReq && (
                                <View style={[styles.statusBadge, styles.badgeRed]}>
                                  <AlertCircle size={12} color="#BE123C" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextRed]}>
                                    Changes Required
                                  </Text>
                                </View>
                              )}
                              <Text style={styles.versionTag}>v{item.version}</Text>
                            </View>
                          </View>

                          {/* Destination Information Grid */}
                          <View style={styles.destInfoBox}>
                            <View style={styles.destFieldRow}>
                              <Text style={styles.fieldLabel}>Claimed Beneficiary Name</Text>
                              <Text style={styles.fieldValueBold}>{item.beneficiaryName}</Text>
                            </View>

                            <View style={styles.destFieldRow}>
                              <Text style={styles.fieldLabel}>Receiving UPI ID</Text>
                              <View style={styles.copyableRow}>
                                <Text style={styles.fieldValueMono}>{item.upiId}</Text>
                                <Pressable
                                  onPress={() => copyToClipboard(item.upiId, "UPI ID")}
                                  style={styles.copyBtn}
                                >
                                  <Copy size={13} color={pink} />
                                </Pressable>
                              </View>
                            </View>

                            {item.mobile && (
                              <View style={styles.destFieldRow}>
                                <Text style={styles.fieldLabel}>Banking Mobile Number</Text>
                                <Text style={styles.fieldValue}>{item.mobile}</Text>
                              </View>
                            )}

                            {/* QR Code Preview Thumbnail */}
                            {item.qrCodeUrl ? (
                              <View style={styles.qrRow}>
                                <View style={styles.qrThumbWrap}>
                                  <Image
                                    source={{ uri: item.qrCodeUrl }}
                                    style={styles.qrThumb}
                                    resizeMode="cover"
                                  />
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={styles.qrLabel}>Personal UPI QR Code</Text>
                                  <Pressable
                                    onPress={() => {
                                      setQrModalUrl(item.qrCodeUrl!);
                                      setQrModalDetails({
                                        upiId: item.upiId,
                                        name: item.beneficiaryName,
                                      });
                                    }}
                                    style={styles.inspectQrBtn}
                                  >
                                    <QrCode size={14} color={pink} />
                                    <Text style={styles.inspectQrBtnText}>Inspect & Scan QR</Text>
                                  </Pressable>
                                </View>
                              </View>
                            ) : (
                              <View style={styles.noQrRow}>
                                <Text style={styles.noQrText}>No QR image submitted (UPI ID only)</Text>
                              </View>
                            )}
                          </View>

                          {/* Historical Review Feedback */}
                          {item.observedRecipientName && (
                            <View style={styles.observedBox}>
                              <Text style={styles.observedLabel}>Verified Observed Name:</Text>
                              <Text style={styles.observedVal}>{item.observedRecipientName}</Text>
                            </View>
                          )}

                          {isChangesReq && item.rejectionReason && (
                            <View style={styles.reasonBox}>
                              <Text style={styles.reasonLabel}>Rejection / Changes Reason:</Text>
                              <Text style={styles.reasonText}>{item.rejectionReason}</Text>
                            </View>
                          )}

                          {/* Submission Date */}
                          <Text style={styles.dateText}>
                            Submitted on {new Date(item.createdAt).toLocaleString("en-IN")}
                          </Text>

                          {/* Action Buttons */}
                          <View style={styles.cardActions}>
                            {isPending ? (
                              <>
                                <Pressable
                                  disabled={isBusy}
                                  onPress={() => handleOpenApproveModal(item)}
                                  style={[styles.btn, styles.btnApprove, isBusy && styles.btnDisabled]}
                                >
                                  <CheckCircle2 size={15} color="#FFF" />
                                  <Text style={styles.btnApproveText}>Approve Destination</Text>
                                </Pressable>

                                <Pressable
                                  disabled={isBusy}
                                  onPress={() => handleOpenRejectModal(item)}
                                  style={[styles.btn, styles.btnReject, isBusy && styles.btnDisabled]}
                                >
                                  <AlertCircle size={15} color="#DC2626" />
                                  <Text style={styles.btnRejectText}>Request Changes</Text>
                                </Pressable>
                              </>
                            ) : (
                              <View style={styles.reviewCompletedRow}>
                                <Text style={styles.reviewedNotice}>
                                  Reviewed on{" "}
                                  {item.reviewedAt
                                    ? new Date(item.reviewedAt).toLocaleDateString("en-IN")
                                    : "Earlier"}
                                </Text>
                                <Pressable
                                  disabled={isBusy}
                                  onPress={() => handleOpenRejectModal(item)}
                                  style={styles.btnReevaluate}
                                >
                                  <Text style={styles.btnReevaluateText}>Modify Status</Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: WITHDRAWAL REQUESTS                                               */}
            {/* ========================================================================= */}
            {activeTab === "withdrawals" && (
              <View style={styles.sectionWrap}>
                {/* Metric Summary Ribbon */}
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>Total Requests</Text>
                    <Text style={styles.kpiVal}>{payouts.length}</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#FDE68A", backgroundColor: "#FEFCE8" }]}>
                    <Text style={[styles.kpiLabel, { color: "#854D0E" }]}>Action Needed</Text>
                    <Text style={[styles.kpiVal, { color: "#B45309" }]}>
                      {
                        payouts.filter((p) =>
                          ["requested", "under_review", "approved"].includes(p.status)
                        ).length
                      }
                    </Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" }]}>
                    <Text style={[styles.kpiLabel, { color: "#1E40AF" }]}>Processing / Claimed</Text>
                    <Text style={[styles.kpiVal, { color: "#2563EB" }]}>
                      {payouts.filter((p) => p.status === "processing").length}
                    </Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" }]}>
                    <Text style={[styles.kpiLabel, { color: "#166534" }]}>Total Paid Out</Text>
                    <Text style={[styles.kpiVal, { color: "#15803D" }]}>{money(ledgerStats.totalPaid)}</Text>
                  </View>
                </View>

                {/* Filter and Search Bar */}
                <View style={styles.filterBar}>
                  <View style={styles.searchBox}>
                    <Search size={16} color={adminPalette.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search customer, beneficiary, UPI, UTR..."
                      placeholderTextColor={adminPalette.textMuted}
                      value={payoutSearch}
                      onChangeText={setPayoutSearch}
                    />
                    {payoutSearch ? (
                      <Pressable onPress={() => setPayoutSearch("")}>
                        <X size={16} color={adminPalette.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterPillsStrip}
                  >
                    {[
                      { key: "all", label: "All" },
                      { key: "action_needed", label: "Action Needed" },
                      { key: "processing", label: "Processing" },
                      { key: "payment_pending", label: "Payment Pending" },
                      { key: "paid", label: "Paid" },
                      { key: "rejected_or_failed", label: "Rejected / Failed" },
                    ].map((f) => (
                      <Pressable
                        key={f.key}
                        onPress={() => setPayoutStatusFilter(f.key)}
                        style={[
                          styles.filterPill,
                          payoutStatusFilter === f.key && styles.filterPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterPillText,
                            payoutStatusFilter === f.key && styles.filterPillTextActive,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Payouts List */}
                {filteredPayouts.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Wallet size={36} color={adminPalette.textMuted} />
                    <Text style={styles.emptyTitle}>No withdrawal requests found</Text>
                    <Text style={styles.emptySubtitle}>
                      {payoutSearch || payoutStatusFilter !== "all"
                        ? "Try resetting filters or search query."
                        : "No referral withdrawal requests created yet."}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardsGrid}>
                    {filteredPayouts.map((req) => {
                      const isUnclaimed =
                        !req.claimedBy && ["requested", "under_review", "approved"].includes(req.status);
                      const isClaimedByMe =
                        req.claimedBy &&
                        identity?.profile?.id &&
                        req.claimedBy === identity.profile.id;
                      const isClaimedBySomeoneElse =
                        req.claimedBy && (!identity?.profile?.id || req.claimedBy !== identity.profile.id);
                      const isProcessing = req.status === "processing";
                      const isPaymentPending = req.status === "payment_pending";
                      const isPaid = req.status === "paid" || req.status === "processed";
                      const isRejected = req.status === "rejected";
                      const isCancelled = req.status === "cancelled";
                      const isFailedOrReversed = req.status === "failed" || req.status === "reversed";
                      const isBusy = actionInProgress === req.id;

                      const snap = req.destinationSnapshot;
                      const upiId = snap?.upi_id || req.mobile;

                      return (
                        <View key={req.id} style={styles.card}>
                          {/* Card Header with Amount */}
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.amountText}>{money(req.amount)}</Text>
                              <Text style={styles.cardSubtitle}>
                                Customer: {req.customerProfile?.fullName || "Public Customer"} (
                                {req.customerProfile?.phone || req.mobile})
                              </Text>
                            </View>
                            <View style={styles.badgeWrap}>
                              {isPaid && (
                                <View style={[styles.statusBadge, styles.badgeGreen]}>
                                  <CheckCircle2 size={12} color="#15803D" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextGreen]}>
                                    Paid
                                  </Text>
                                </View>
                              )}
                              {isProcessing && (
                                <View style={[styles.statusBadge, styles.badgeBlue]}>
                                  <Lock size={12} color="#2563EB" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextBlue]}>
                                    Processing
                                  </Text>
                                </View>
                              )}
                              {isPaymentPending && (
                                <View style={[styles.statusBadge, styles.badgeOrange]}>
                                  <Clock size={12} color="#EA580C" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextOrange]}>
                                    Payment Pending
                                  </Text>
                                </View>
                              )}
                              {isUnclaimed && (
                                <View style={[styles.statusBadge, styles.badgeAmber]}>
                                  <Clock size={12} color="#B45309" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextAmber]}>
                                    Awaiting Claim
                                  </Text>
                                </View>
                              )}
                              {isRejected && (
                                <View style={[styles.statusBadge, styles.badgeRed]}>
                                  <XCircle size={12} color="#BE123C" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextRed]}>
                                    Rejected
                                  </Text>
                                </View>
                              )}
                              {isCancelled && (
                                <View style={[styles.statusBadge, styles.badgeSlate]}>
                                  <Ban size={12} color="#64748B" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextSlate]}>
                                    Cancelled by User
                                  </Text>
                                </View>
                              )}
                              {isFailedOrReversed && (
                                <View style={[styles.statusBadge, styles.badgeRed]}>
                                  <ShieldAlert size={12} color="#BE123C" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextRed]}>
                                    {req.status === "failed" ? "Failed" : "Reversed"}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Destination Snapshot Box */}
                          <View style={styles.destInfoBox}>
                            <View style={styles.destFieldRow}>
                              <Text style={styles.fieldLabel}>Pay to Beneficiary</Text>
                              <Text style={styles.fieldValueBold}>
                                {snap?.beneficiary_name || req.beneficiaryName}
                              </Text>
                            </View>

                            <View style={styles.destFieldRow}>
                              <Text style={styles.fieldLabel}>Receiving UPI ID</Text>
                              <View style={styles.copyableRow}>
                                <Text style={styles.fieldValueMono}>{upiId}</Text>
                                <Pressable
                                  onPress={() => copyToClipboard(upiId, "UPI ID")}
                                  style={styles.copyBtn}
                                >
                                  <Copy size={13} color={pink} />
                                </Pressable>
                              </View>
                            </View>

                            {snap?.qr_code_url && (
                              <View style={styles.qrRow}>
                                <Image
                                  source={{ uri: snap.qr_code_url }}
                                  style={styles.qrThumb}
                                  resizeMode="cover"
                                />
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={styles.qrLabel}>Customer Personal QR</Text>
                                  <Pressable
                                    onPress={() => {
                                      setQrModalUrl(snap.qr_code_url!);
                                      setQrModalDetails({
                                        upiId: snap.upi_id || "",
                                        name: snap.beneficiary_name || "",
                                      });
                                    }}
                                    style={styles.inspectQrBtn}
                                  >
                                    <QrCode size={14} color={pink} />
                                    <Text style={styles.inspectQrBtnText}>Scan with UPI App</Text>
                                  </Pressable>
                                </View>
                              </View>
                            )}
                          </View>

                          {/* Paid Transfer Details */}
                          {isPaid && (
                            <View style={styles.paidDetailsBox}>
                              <View style={styles.paidDetailRow}>
                                <Text style={styles.paidLabel}>Bank Reference / UTR:</Text>
                                <Text style={styles.paidValMono}>{req.transactionRef || "N/A"}</Text>
                                <Pressable
                                  onPress={() => copyToClipboard(req.transactionRef || "", "UTR")}
                                  style={styles.copyBtn}
                                >
                                  <Copy size={12} color="#15803D" />
                                </Pressable>
                              </View>
                              <Text style={styles.paidSubtext}>
                                Source: {req.businessSourceAccount || "RoyalLagn Business UPI"} • Paid on{" "}
                                {req.paidAt ? new Date(req.paidAt).toLocaleString("en-IN") : "Recorded"}
                              </Text>
                            </View>
                          )}

                          {/* Rejection / Failure Reason */}
                          {(isRejected || isFailedOrReversed) && (
                            <View style={styles.reasonBox}>
                              <Text style={styles.reasonLabel}>
                                {isRejected ? "Rejection Reason:" : "Reversal Reason:"}
                              </Text>
                              <Text style={styles.reasonText}>
                                {req.rejectionReason || req.reversalReason || "No details provided"}
                              </Text>
                            </View>
                          )}

                          {/* Operator Ownership / Claim Status */}
                          {req.claimedBy && !isPaid && !isRejected && !isCancelled && (
                            <View style={styles.claimedBanner}>
                              <Lock size={13} color="#1E40AF" />
                              <Text style={styles.claimedBannerText}>
                                {isClaimedByMe
                                  ? "Claimed by you (Protected from concurrent payout)"
                                  : `Claimed by admin (${req.claimedBy.slice(0, 8)}...)`}
                              </Text>
                            </View>
                          )}

                          {/* Timestamps */}
                          <Text style={styles.dateText}>
                            Requested on {new Date(req.requestedAt).toLocaleString("en-IN")}
                          </Text>

                          {/* Operator Actions */}
                          <View style={styles.cardActions}>
                            {/* State 1: Unclaimed */}
                            {isUnclaimed && (
                              <Pressable
                                disabled={isBusy}
                                onPress={() => handleClaimPayout(req)}
                                style={[styles.btn, styles.btnClaim, isBusy && styles.btnDisabled]}
                              >
                                <Lock size={15} color="#FFF" />
                                <Text style={styles.btnClaimText}>Claim Request to Process</Text>
                              </Pressable>
                            )}

                            {/* State 2: Claimed & Active */}
                            {(isProcessing || isPaymentPending || (!isPaid && !isRejected && !isCancelled && req.claimedBy)) && (
                              <>
                                <Pressable
                                  disabled={isBusy}
                                  onPress={() => handleOpenPayModal(req)}
                                  style={[styles.btn, styles.btnPay, isBusy && styles.btnDisabled]}
                                >
                                  <CircleDollarSign size={15} color="#FFF" />
                                  <Text style={styles.btnPayText}>Mark as Paid (Enter UTR)</Text>
                                </Pressable>

                                <View style={styles.actionButtonGroup}>
                                  {!isPaymentPending && (
                                    <Pressable
                                      disabled={isBusy}
                                      onPress={() => handleMarkPaymentPending(req)}
                                      style={[styles.btnSmall, styles.btnPending]}
                                    >
                                      <Clock size={13} color="#EA580C" />
                                      <Text style={styles.btnPendingText}>Payment Pending</Text>
                                    </Pressable>
                                  )}

                                  <Pressable
                                    disabled={isBusy}
                                    onPress={() => handleReleaseClaim(req)}
                                    style={[styles.btnSmall, styles.btnRelease]}
                                  >
                                    <Unlock size={13} color={adminPalette.textSecondary} />
                                    <Text style={styles.btnReleaseText}>Release Claim</Text>
                                  </Pressable>

                                  <Pressable
                                    disabled={isBusy}
                                    onPress={() => handleOpenRejectWithdrawal(req)}
                                    style={[styles.btnSmall, styles.btnRejectSmall]}
                                  >
                                    <XCircle size={13} color="#DC2626" />
                                    <Text style={styles.btnRejectSmallText}>Reject & Refund</Text>
                                  </Pressable>
                                </View>
                              </>
                            )}

                            {/* State 3: Reconcile Failure / Reversal for processing or payment_pending transfers */}
                            {(isProcessing || isPaymentPending) && (
                              <Pressable
                                disabled={isBusy}
                                onPress={() => handleOpenReconcile(req)}
                                style={styles.btnReconcile}
                              >
                                <ShieldAlert size={14} color="#B91C1C" />
                                <Text style={styles.btnReconcileText}>Reconcile Transfer Failure / Reversal</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: PLATFORM REFERRAL LEDGER                                          */}
            {/* ========================================================================= */}
            {activeTab === "ledger" && (
              <View style={styles.sectionWrap}>
                {/* Metric Summary Ribbon */}
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>Total Referrals Recorded</Text>
                    <Text style={styles.kpiVal}>{ledgerStats.totalCount}</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" }]}>
                    <Text style={[styles.kpiLabel, { color: "#166534" }]}>Earned Commission (Gross)</Text>
                    <Text style={[styles.kpiVal, { color: "#15803D" }]}>{money(ledgerStats.earnedGross)}</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#FDE68A", backgroundColor: "#FEFCE8" }]}>
                    <Text style={[styles.kpiLabel, { color: "#854D0E" }]}>Pending Commission</Text>
                    <Text style={[styles.kpiVal, { color: "#B45309" }]}>{money(ledgerStats.pendingGross)}</Text>
                  </View>
                  <View style={[styles.kpiCard, { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" }]}>
                    <Text style={[styles.kpiLabel, { color: "#1E40AF" }]}>Reserved in Withdrawals</Text>
                    <Text style={[styles.kpiVal, { color: "#2563EB" }]}>{money(ledgerStats.reserved)}</Text>
                  </View>
                </View>

                {/* Filter and Search Bar */}
                <View style={styles.filterBar}>
                  <View style={styles.searchBox}>
                    <Search size={16} color={adminPalette.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search ticket, referrer, code, referee..."
                      placeholderTextColor={adminPalette.textMuted}
                      value={ledgerSearch}
                      onChangeText={setLedgerSearch}
                    />
                    {ledgerSearch ? (
                      <Pressable onPress={() => setLedgerSearch("")}>
                        <X size={16} color={adminPalette.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterPillsStrip}
                  >
                    {[
                      { key: "all", label: "All Commissions" },
                      { key: "earned", label: "Earned (Confirmed)" },
                      { key: "pending", label: "Pending (Advance Paid)" },
                      { key: "reversed", label: "Reversed" },
                    ].map((f) => (
                      <Pressable
                        key={f.key}
                        onPress={() => setLedgerStatusFilter(f.key)}
                        style={[
                          styles.filterPill,
                          ledgerStatusFilter === f.key && styles.filterPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterPillText,
                            ledgerStatusFilter === f.key && styles.filterPillTextActive,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Ledger Table / List */}
                {filteredLedger.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <ReceiptText size={36} color={adminPalette.textMuted} />
                    <Text style={styles.emptyTitle}>No commission entries found</Text>
                    <Text style={styles.emptySubtitle}>
                      Commissions are recorded automatically when direct bookings complete their 30% advance.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardsGrid}>
                    {filteredLedger.map((c) => {
                      const isEarned = c.status === "earned";
                      const isPending = c.status === "pending";
                      const isReversed = c.status === "reversed" || c.status === "cancelled";

                      return (
                        <View key={c.id} style={styles.card}>
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <View style={styles.ticketPill}>
                                <Tag size={12} color="#7E22CE" />
                                <Text style={styles.ticketPillText}>
                                  Ticket #{c.ticketId || c.bookingRecordId?.slice(0, 8)}
                                </Text>
                              </View>
                              <Text style={styles.cardSubtitle}>
                                Code used: <Text style={{ fontWeight: "700" }}>{c.referralCode}</Text>
                              </Text>
                            </View>

                            <View style={styles.badgeWrap}>
                              {isEarned && (
                                <View style={[styles.statusBadge, styles.badgeGreen]}>
                                  <CheckCircle2 size={12} color="#15803D" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextGreen]}>
                                    Earned
                                  </Text>
                                </View>
                              )}
                              {isPending && (
                                <View style={[styles.statusBadge, styles.badgeAmber]}>
                                  <Clock size={12} color="#B45309" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextAmber]}>
                                    Pending Advance
                                  </Text>
                                </View>
                              )}
                              {isReversed && (
                                <View style={[styles.statusBadge, styles.badgeRed]}>
                                  <XCircle size={12} color="#BE123C" />
                                  <Text style={[styles.statusBadgeText, styles.badgeTextRed]}>
                                    Reversed
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {/* Referrer & Referee Info */}
                          <View style={styles.partiesRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.partyLabel}>Referrer (Earns Reward)</Text>
                              <Text style={styles.partyName}>
                                {c.referrerProfile?.fullName || "Customer"}
                              </Text>
                              <Text style={styles.partyContact}>
                                {c.referrerProfile?.phone || c.referrerProfile?.email || "ID: " + c.referrerId?.slice(0, 8)}
                              </Text>
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={styles.partyLabel}>Referred Customer</Text>
                              <Text style={styles.partyName}>
                                {c.referredProfile?.fullName || "Referred Guest"}
                              </Text>
                              <Text style={styles.partyContact}>
                                {c.referredProfile?.phone || c.referredProfile?.email || "N/A"}
                              </Text>
                            </View>
                          </View>

                          {/* Financial Breakdown Cells */}
                          <View style={styles.finGrid}>
                            <View style={styles.finCell}>
                              <Text style={styles.finCellLabel}>Total Booking Value</Text>
                              <Text style={styles.finCellVal}>{money(c.bookingTotal)}</Text>
                            </View>

                            <View style={styles.finCell}>
                              <Text style={styles.finCellLabel}>30% Advance Paid</Text>
                              <Text style={styles.finCellVal}>{money(c.advancePaid)}</Text>
                            </View>

                            <View style={[styles.finCell, styles.finCellReward]}>
                              <Text style={styles.finCellLabelReward}>Customer Reward</Text>
                              <Text style={styles.finCellValReward}>{money(c.referrerReward)}</Text>
                            </View>

                            <View style={styles.finCell}>
                              <Text style={styles.finCellLabel}>RoyalLagn Fee</Text>
                              <Text style={styles.finCellVal}>{money(c.royallagnCommission)}</Text>
                            </View>
                          </View>

                          <View style={styles.ledgerCardFooter}>
                            <Text style={styles.slabTag}>Slab: {c.commissionSlab}</Text>
                            <Text style={styles.dateText}>
                              Recorded on {new Date(c.createdAt).toLocaleDateString("en-IN")}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: INSPECT QR CODE                                                 */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(qrModalUrl)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Personal UPI QR Code</Text>
                <Text style={styles.modalSubtitle}>
                  {qrModalDetails?.name} • {qrModalDetails?.upiId}
                </Text>
              </View>
              <Pressable onPress={() => setQrModalUrl(null)} style={styles.modalCloseBtn}>
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            {qrModalUrl && (
              <View style={styles.qrDisplayBox}>
                <Image
                  source={{ uri: qrModalUrl }}
                  style={styles.qrFullImage}
                  resizeMode="contain"
                />
              </View>
            )}

            {qrModalDetails?.upiId && (
              <View style={styles.qrModalFooter}>
                <Text style={styles.modalFieldLabel}>UPI ID for Transfer:</Text>
                <View style={styles.copyableRow}>
                  <Text style={styles.fieldValueMono}>{qrModalDetails.upiId}</Text>
                  <Pressable
                    onPress={() => copyToClipboard(qrModalDetails.upiId, "UPI ID")}
                    style={styles.copyBtn}
                  >
                    <Copy size={14} color={pink} />
                  </Pressable>
                </View>
              </View>
            )}

            <Pressable onPress={() => setQrModalUrl(null)} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>Close Preview</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: APPROVE PAYMENT DESTINATION                                     */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(approveModalItem)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve Payment Destination</Text>
              <Pressable onPress={() => setApproveModalItem(null)} style={styles.modalCloseBtn}>
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            <Text style={styles.modalHelpText}>
              Verify that the customer's claimed beneficiary name matches the name registered in the
              banking / UPI network before approving.
            </Text>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>Customer's Beneficiary Name</Text>
              <Text style={styles.readOnlyText}>{approveModalItem?.beneficiaryName}</Text>
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>UPI ID</Text>
              <Text style={styles.readOnlyText}>{approveModalItem?.upiId}</Text>
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>
                Observed Name in Banking / UPI App (Optional)
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Exact name seen on banking test/lookup"
                value={observedNameInput}
                onChangeText={setObservedNameInput}
              />
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>Internal Review Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Notes for compliance or team records"
                multiline
                numberOfLines={3}
                value={approveNotesInput}
                onChangeText={setApproveNotesInput}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setApproveModalItem(null)}
                style={[styles.modalBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmApproval}
                style={[styles.modalBtn, styles.btnApproveConfirm]}
              >
                <CheckCircle2 size={16} color="#FFF" />
                <Text style={styles.btnApproveConfirmText}>Confirm Approval</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: REQUEST CHANGES / REJECT DESTINATION                            */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(rejectDestModalItem)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Changes / Reject Details</Text>
              <Pressable onPress={() => setRejectDestModalItem(null)} style={styles.modalCloseBtn}>
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            <Text style={styles.modalHelpText}>
              Explain specifically why verification could not be completed. The customer will be
              prompted to update their details on their dashboard.
            </Text>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>
                Reason for Rejection / Changes Required <Text style={{ color: "#DC2626" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Beneficiary banking name does not match the name registered with UPI ID. Please provide correct matching details."
                multiline
                numberOfLines={4}
                value={rejectionReasonInput}
                onChangeText={setRejectionReasonInput}
              />
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>Internal Notes (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Internal memo for other staff members"
                value={rejectDestNotesInput}
                onChangeText={setRejectDestNotesInput}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setRejectDestModalItem(null)}
                style={[styles.modalBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmRejectDest}
                style={[styles.modalBtn, styles.btnRejectConfirm]}
              >
                <AlertCircle size={16} color="#FFF" />
                <Text style={styles.btnRejectConfirmText}>Send Changes Request</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: EXECUTE MANUAL PAYOUT (UPDATE STATUS & RECORD UTR)               */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(payModalRequest)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalDialog, { maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Execute Manual Payout</Text>
                <Text style={styles.modalSubtitle}>Prefetched recipient destination & payout status selector</Text>
              </View>
              <Pressable onPress={() => setPayModalRequest(null)} style={styles.modalCloseBtn}>
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 6 }}>
              {/* SUMMARY BOX: AMOUNT & BENEFICIARY */}
              <View style={styles.payoutSummaryBox}>
                <Text style={styles.payoutSummaryAmount}>{money(payModalRequest?.amount)}</Text>
                <Text style={styles.payoutSummaryText}>
                  Beneficiary: {payModalRequest?.destinationSnapshot?.beneficiary_name || payModalRequest?.beneficiaryName}
                </Text>
                {payModalRequest?.destinationSnapshot?.observed_recipient_name && (
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#166534" }}>
                    Verified A/C: {payModalRequest.destinationSnapshot.observed_recipient_name}
                  </Text>
                )}
              </View>

              {/* PREFETCHED DESTINATION DETAILS */}
              <View style={styles.prefetchContainer}>
                <Text style={styles.prefetchSectionTitle}>Prefetched Receiving Details</Text>

                {/* 1. UPI ID */}
                <View style={styles.prefetchRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.prefetchLabel}>Receiving UPI ID</Text>
                    <Text style={styles.prefetchValMono} numberOfLines={1}>
                      {payModalRequest?.destinationSnapshot?.upi_id || payModalRequest?.mobile}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => copyToClipboard(payModalRequest?.destinationSnapshot?.upi_id || payModalRequest?.mobile || "", "UPI ID")}
                    style={styles.prefetchCopyBtn}
                  >
                    <Copy size={12} color={pink} />
                    <Text style={styles.prefetchCopyBtnText}>Copy</Text>
                  </Pressable>
                </View>

                {/* 2. GPay / Phone Number */}
                <View style={styles.prefetchRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.prefetchLabel}>GPay / Phone Number</Text>
                    <Text style={styles.prefetchValMono} numberOfLines={1}>
                      {payModalRequest?.destinationSnapshot?.mobile || payModalRequest?.mobile || "No phone linked"}
                    </Text>
                  </View>
                  {(payModalRequest?.destinationSnapshot?.mobile || payModalRequest?.mobile) ? (
                    <Pressable
                      onPress={() => copyToClipboard(payModalRequest?.destinationSnapshot?.mobile || payModalRequest?.mobile || "", "Phone Number")}
                      style={styles.prefetchCopyBtn}
                    >
                      <Copy size={12} color={pink} />
                      <Text style={styles.prefetchCopyBtnText}>Copy</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* 3. Personal Receiving QR Code */}
                {payModalRequest?.destinationSnapshot?.qr_code_url ? (
                  <View style={styles.qrContainerBox}>
                    <View style={styles.qrContainerHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <QrCode size={14} color={pink} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: adminPalette.text }}>
                          Personal Receiving QR Code
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          if (Platform.OS === "web" && typeof window !== "undefined") {
                            window.open(payModalRequest.destinationSnapshot?.qr_code_url || "", "_blank");
                          } else {
                            setQrModalUrl(payModalRequest.destinationSnapshot?.qr_code_url || "");
                            setQrModalDetails({
                              upiId: payModalRequest.destinationSnapshot?.upi_id || payModalRequest.mobile,
                              name: payModalRequest.destinationSnapshot?.beneficiary_name || payModalRequest.beneficiaryName,
                            });
                          }
                        }}
                        style={styles.openFullBtn}
                      >
                        <ExternalLink size={10} color={adminPalette.textSecondary} />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: adminPalette.textSecondary }}>Open Full</Text>
                      </Pressable>
                    </View>
                    <View style={styles.qrWhiteBox}>
                      <Image
                        source={{ uri: payModalRequest.destinationSnapshot.qr_code_url }}
                        style={{ width: 140, height: 140 }}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={styles.qrScanPrompt}>
                      Scan directly with GPay / PhonePe / Paytm to execute payment
                    </Text>
                  </View>
                ) : (
                  <View style={styles.noQrBox}>
                    <QrCode size={14} color={adminPalette.textMuted} />
                    <Text style={{ fontSize: 11, color: adminPalette.textMuted }}>No QR code image uploaded with destination.</Text>
                  </View>
                )}
              </View>

              {/* THREE STATUS SELECTOR TABS */}
              <View style={styles.statusTabsWrap}>
                <Text style={styles.statusTabsLabel}>Select Payout Status</Text>
                <View style={styles.statusTabsRow}>
                  {/* Tab 1: Processing */}
                  <Pressable
                    onPress={() => setPayoutStatusTab("processing")}
                    style={[
                      styles.statusTab,
                      payoutStatusTab === "processing" && styles.statusTabActiveProcessing,
                    ]}
                  >
                    <Clock size={13} color={payoutStatusTab === "processing" ? "#FFF" : "#2563EB"} />
                    <Text
                      style={[
                        styles.statusTabText,
                        { color: payoutStatusTab === "processing" ? "#FFF" : "#2563EB" },
                      ]}
                      numberOfLines={1}
                    >
                      Processing
                    </Text>
                  </Pressable>

                  {/* Tab 2: Payment Pending */}
                  <Pressable
                    onPress={() => setPayoutStatusTab("payment_pending")}
                    style={[
                      styles.statusTab,
                      payoutStatusTab === "payment_pending" && styles.statusTabActivePending,
                    ]}
                  >
                    <AlertCircle size={13} color={payoutStatusTab === "payment_pending" ? "#FFF" : "#D97706"} />
                    <Text
                      style={[
                        styles.statusTabText,
                        { color: payoutStatusTab === "payment_pending" ? "#FFF" : "#D97706" },
                      ]}
                      numberOfLines={1}
                    >
                      Pending
                    </Text>
                  </Pressable>

                  {/* Tab 3: Payment Successful */}
                  <Pressable
                    onPress={() => setPayoutStatusTab("paid")}
                    style={[
                      styles.statusTab,
                      payoutStatusTab === "paid" && styles.statusTabActivePaid,
                    ]}
                  >
                    <CheckCircle2 size={13} color={payoutStatusTab === "paid" ? "#FFF" : "#059669"} />
                    <Text
                      style={[
                        styles.statusTabText,
                        { color: payoutStatusTab === "paid" ? "#FFF" : "#059669" },
                      ]}
                      numberOfLines={1}
                    >
                      Successful
                    </Text>
                  </Pressable>
                </View>

                {/* Status Explanation Helper */}
                <Text style={styles.statusHelpText}>
                  {payoutStatusTab === "paid"
                    ? "✓ Completes request, records UTR reference, and deducts the amount from customer's referral balance."
                    : payoutStatusTab === "processing"
                    ? "ℹ Sets status to Processing. Funds remain held in customer's reserved balance."
                    : "ℹ Sets status to Payment Pending (awaiting banking transfer/clearance)."}
                </Text>
              </View>

              {/* FORM INPUTS */}
              {payoutStatusTab === "paid" ? (
                <View style={styles.modalFieldWrap}>
                  <Text style={styles.modalFieldLabel}>
                    Bank UTR / Transaction Reference <Text style={{ color: "#DC2626" }}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.textInput, { fontFamily: "monospace" }]}
                    placeholder="e.g. 528394829103 or UPI Ref ID"
                    value={utrInput}
                    onChangeText={setUtrInput}
                  />
                </View>
              ) : (
                <View style={styles.modalFieldWrap}>
                  <Text style={styles.modalFieldLabel}>
                    Transaction / Tracking Reference (Optional)
                  </Text>
                  <TextInput
                    style={[styles.textInput, { fontFamily: "monospace" }]}
                    placeholder="Optional bank ref or internal tracking ID"
                    value={utrInput}
                    onChangeText={setUtrInput}
                  />
                </View>
              )}

              <View style={styles.modalFieldWrap}>
                <Text style={styles.modalFieldLabel}>Business Source Account</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="RoyalLagn Business Current A/C"
                  value={sourceAccountInput}
                  onChangeText={setSourceAccountInput}
                />
              </View>

              <View style={styles.modalFieldWrap}>
                <Text style={styles.modalFieldLabel}>Reconciliation Notes (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Transferred via HDFC netbanking/GPay business app"
                  value={payoutNotesInput}
                  onChangeText={setPayoutNotesInput}
                />
              </View>

              {/* ACTION BUTTONS */}
              <View style={styles.modalBtnRow}>
                <Pressable
                  onPress={() => setPayModalRequest(null)}
                  style={[styles.modalBtn, styles.btnSecondary]}
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={Boolean(actionInProgress)}
                  onPress={handleConfirmPayModal}
                  style={[
                    styles.modalBtn,
                    payoutStatusTab === "paid"
                      ? styles.btnApproveConfirm
                      : payoutStatusTab === "processing"
                      ? { backgroundColor: "#2563EB" }
                      : { backgroundColor: "#D97706" },
                  ]}
                >
                  {payoutStatusTab === "paid" ? (
                    <CheckCircle2 size={16} color="#FFF" />
                  ) : payoutStatusTab === "processing" ? (
                    <Clock size={16} color="#FFF" />
                  ) : (
                    <AlertCircle size={16} color="#FFF" />
                  )}
                  <Text style={styles.btnApproveConfirmText}>
                    {payoutStatusTab === "paid"
                      ? "Confirm Payment & Deduct"
                      : payoutStatusTab === "processing"
                      ? "Save as Processing"
                      : "Save as Payment Pending"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 5: REJECT WITHDRAWAL REQUEST                                       */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(rejectWithdrawalModalReq)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Withdrawal Request</Text>
              <Pressable
                onPress={() => setRejectWithdrawalModalReq(null)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            <View style={styles.warningNoticeBox}>
              <AlertCircle size={16} color="#B91C1C" />
              <Text style={styles.warningNoticeText}>
                Rejecting this request will immediately release the reserved balance of{" "}
                {money(rejectWithdrawalModalReq?.amount)} back to the customer's available referral wallet.
              </Text>
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>
                Rejection Reason <Text style={{ color: "#DC2626" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Destination UPI account invalid / Customer requested withdrawal cancellation"
                multiline
                numberOfLines={3}
                value={rejectWithdrawalReason}
                onChangeText={setRejectWithdrawalReason}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setRejectWithdrawalModalReq(null)}
                style={[styles.modalBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmRejectWithdrawal}
                style={[styles.modalBtn, styles.btnRejectConfirm]}
              >
                <XCircle size={16} color="#FFF" />
                <Text style={styles.btnRejectConfirmText}>Confirm Rejection & Release</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: RECONCILE TRANSFER FAILURE / REVERSAL                            */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(reconcileModalReq)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reconcile Transfer Failure / Reversal</Text>
              <Pressable onPress={() => setReconcileModalReq(null)} style={styles.modalCloseBtn}>
                <X size={20} color={adminPalette.text} />
              </Pressable>
            </View>

            <Text style={styles.modalHelpText}>
              Use this if an initiated bank transfer bounced, failed at NPCI, or reversed. The customer's
              reserved balance will be restored safely.
            </Text>

            <View style={styles.radioRow}>
              <Pressable
                onPress={() => setReconcileStatusType("failed")}
                style={[
                  styles.radioBtn,
                  reconcileStatusType === "failed" && styles.radioBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.radioBtnText,
                    reconcileStatusType === "failed" && styles.radioBtnTextActive,
                  ]}
                >
                  Bank Transfer Failed
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setReconcileStatusType("reversed")}
                style={[
                  styles.radioBtn,
                  reconcileStatusType === "reversed" && styles.radioBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.radioBtnText,
                    reconcileStatusType === "reversed" && styles.radioBtnTextActive,
                  ]}
                >
                  Payment Reversed by Bank
                </Text>
              </Pressable>
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>
                Failure / Reversal Reason <Text style={{ color: "#DC2626" }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. Bank response code: U30 Account Does Not Exist or Transaction Timed Out"
                multiline
                numberOfLines={3}
                value={reconcileReason}
                onChangeText={setReconcileReason}
              />
            </View>

            <View style={styles.modalFieldWrap}>
              <Text style={styles.modalFieldLabel}>Reconciliation Notes (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Internal memo"
                value={reconcileNotes}
                onChangeText={setReconcileNotes}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setReconcileModalReq(null)}
                style={[styles.modalBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmReconcile}
                style={[styles.modalBtn, styles.btnRejectConfirm]}
              >
                <ShieldAlert size={16} color="#FFF" />
                <Text style={styles.btnRejectConfirmText}>Confirm & Restore Balance</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AdminFooter activeTab="referrals" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: adminPalette.canvas,
  },
  scrollContent: {
    paddingBottom: 40,
    maxWidth: 1600,
    width: "100%",
    alignSelf: "center",
  },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${pink}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  bannerError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECDD3",
  },
  bannerText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  bannerTextSuccess: {
    color: "#166534",
  },
  bannerTextError: {
    color: "#991B1B",
  },

  // Tab switcher
  tabBar: {
    marginBottom: 20,
    backgroundColor: adminPalette.surfaceSubtle,
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.border,
  },
  tabBarScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tabBarScrollFill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
    width: "100%",
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    minHeight: 44,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  tabButtonFill: {
    flex: 1,
  },
  tabButtonActive: {
    backgroundColor: pink,
    shadowColor: pink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: adminPalette.textSecondary,
  },
  tabButtonTextActive: {
    color: "#FFF",
  },
  tabBadge: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tabBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },

  // KPI Ribbons
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 14,
    padding: 14,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: adminPalette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 20,
    fontWeight: "800",
    color: adminPalette.text,
    marginTop: 4,
  },

  // Search & Filter Strip
  filterBar: {
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: adminPalette.text,
  },
  filterPillsStrip: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: adminPalette.surfaceSubtle,
    borderWidth: 1,
    borderColor: adminPalette.border,
  },
  filterPillActive: {
    backgroundColor: `${pink}15`,
    borderColor: pink,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: adminPalette.textSecondary,
  },
  filterPillTextActive: {
    color: pink,
    fontWeight: "700",
  },

  // Loading & Empty States
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: adminPalette.textSecondary,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: adminPalette.text,
  },
  emptySubtitle: {
    fontSize: 12,
    color: adminPalette.textSecondary,
    textAlign: "center",
  },

  // Cards List Grid
  sectionWrap: {
    gap: 14,
  },
  cardsGrid: {
    gap: 14,
  },
  card: {
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: adminPalette.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: adminPalette.textSecondary,
    marginTop: 2,
  },
  amountText: {
    fontSize: 20,
    fontWeight: "900",
    color: adminPalette.text,
  },
  badgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  versionTag: {
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: adminPalette.surfaceSubtle,
    color: adminPalette.textMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // Status Badges
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeAmber: {
    backgroundColor: "#FEF3C7",
  },
  badgeTextAmber: {
    color: "#B45309",
  },
  badgeGreen: {
    backgroundColor: "#DCFCE7",
  },
  badgeTextGreen: {
    color: "#15803D",
  },
  badgeBlue: {
    backgroundColor: "#DBEAFE",
  },
  badgeTextBlue: {
    color: "#1D4ED8",
  },
  badgeOrange: {
    backgroundColor: "#FFEDD5",
  },
  badgeTextOrange: {
    color: "#C2410C",
  },
  badgeRed: {
    backgroundColor: "#FEE2E2",
  },
  badgeTextRed: {
    color: "#B91C1C",
  },
  badgeSlate: {
    backgroundColor: "#F1F5F9",
  },
  badgeTextSlate: {
    color: "#475569",
  },

  // Destination Details Box
  destInfoBox: {
    backgroundColor: adminPalette.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  destFieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    color: adminPalette.textMuted,
    fontWeight: "600",
  },
  fieldValue: {
    fontSize: 13,
    color: adminPalette.text,
  },
  fieldValueBold: {
    fontSize: 13,
    fontWeight: "700",
    color: adminPalette.text,
  },
  fieldValueMono: {
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "700",
    color: adminPalette.text,
  },
  copyableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  copyBtn: {
    padding: 4,
    backgroundColor: `${pink}15`,
    borderRadius: 6,
  },

  // QR Thumbnail
  qrRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: adminPalette.border,
    paddingTop: 8,
    marginTop: 4,
  },
  qrThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: adminPalette.border,
    backgroundColor: "#FFF",
  },
  qrThumb: {
    width: 44,
    height: 44,
  },
  qrLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: adminPalette.text,
  },
  inspectQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  inspectQrBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: pink,
  },
  noQrRow: {
    paddingTop: 4,
  },
  noQrText: {
    fontSize: 11,
    fontStyle: "italic",
    color: adminPalette.textMuted,
  },

  // Feedback & Reasons
  observedBox: {
    backgroundColor: "#F0FDF4",
    padding: 8,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  observedLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  observedVal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803D",
  },
  reasonBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#991B1B",
  },
  reasonText: {
    fontSize: 12,
    color: "#7F1D1D",
    lineHeight: 16,
  },

  // Paid details
  paidDetailsBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  paidDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  paidLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  paidValMono: {
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "800",
    color: "#15803D",
  },
  paidSubtext: {
    fontSize: 11,
    color: "#166534",
  },

  // Claimed banner
  claimedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    padding: 8,
    borderRadius: 8,
  },
  claimedBannerText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
  },

  dateText: {
    fontSize: 11,
    color: adminPalette.textMuted,
  },

  // Action Buttons
  cardActions: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: adminPalette.border,
    paddingTop: 10,
  },
  actionButtonGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnApprove: {
    backgroundColor: "#16A34A",
  },
  btnApproveText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  btnReject: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  btnRejectText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
  },
  btnClaim: {
    backgroundColor: "#2563EB",
  },
  btnClaimText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  btnPay: {
    backgroundColor: "#16A34A",
  },
  btnPayText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
  },
  btnPending: {
    backgroundColor: "#FFEDD5",
  },
  btnPendingText: {
    color: "#EA580C",
    fontSize: 11,
    fontWeight: "700",
  },
  btnRelease: {
    backgroundColor: adminPalette.surfaceSubtle,
    borderWidth: 1,
    borderColor: adminPalette.border,
  },
  btnReleaseText: {
    color: adminPalette.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  btnRejectSmall: {
    backgroundColor: "#FEE2E2",
  },
  btnRejectSmallText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "700",
  },
  btnReconcile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  btnReconcileText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
    textDecorationLine: "underline",
  },
  reviewCompletedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewedNotice: {
    fontSize: 11,
    color: adminPalette.textMuted,
  },
  btnReevaluate: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  btnReevaluateText: {
    fontSize: 11,
    fontWeight: "700",
    color: pink,
  },

  // Ledger Specific Styles
  ticketPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  ticketPillText: {
    color: "#7E22CE",
    fontSize: 11,
    fontWeight: "800",
  },
  partiesRow: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: adminPalette.border,
    paddingTop: 8,
  },
  partyLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: adminPalette.textMuted,
    textTransform: "uppercase",
  },
  partyName: {
    fontSize: 13,
    fontWeight: "700",
    color: adminPalette.text,
    marginTop: 2,
  },
  partyContact: {
    fontSize: 11,
    color: adminPalette.textSecondary,
    marginTop: 1,
  },
  finGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  finCell: {
    flex: 1,
    minWidth: 100,
    backgroundColor: adminPalette.surfaceSubtle,
    padding: 8,
    borderRadius: 8,
  },
  finCellReward: {
    backgroundColor: "#DCFCE7",
  },
  finCellLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: adminPalette.textMuted,
    textTransform: "uppercase",
  },
  finCellLabelReward: {
    fontSize: 9,
    fontWeight: "800",
    color: "#166534",
    textTransform: "uppercase",
  },
  finCellVal: {
    fontSize: 13,
    fontWeight: "800",
    color: adminPalette.text,
    marginTop: 2,
  },
  finCellValReward: {
    fontSize: 14,
    fontWeight: "900",
    color: "#166534",
    marginTop: 2,
  },
  ledgerCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slabTag: {
    fontSize: 11,
    fontWeight: "700",
    color: pink,
  },

  // Modal Dialogs
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalDialog: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: adminPalette.surface,
    borderRadius: 20,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: adminPalette.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: adminPalette.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: adminPalette.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalHelpText: {
    fontSize: 12,
    color: adminPalette.textSecondary,
    lineHeight: 18,
  },
  modalFieldWrap: {
    gap: 6,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: adminPalette.text,
  },
  readOnlyText: {
    fontSize: 13,
    fontWeight: "600",
    color: adminPalette.text,
    backgroundColor: adminPalette.surfaceSubtle,
    padding: 10,
    borderRadius: 10,
  },
  textInput: {
    backgroundColor: adminPalette.surfaceSubtle,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: adminPalette.text,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnSecondary: {
    backgroundColor: adminPalette.surfaceSubtle,
    borderWidth: 1,
    borderColor: adminPalette.border,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 10,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: adminPalette.textSecondary,
  },
  btnApproveConfirm: {
    backgroundColor: "#16A34A",
  },
  btnApproveConfirmText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFF",
  },
  btnRejectConfirm: {
    backgroundColor: "#DC2626",
  },
  btnRejectConfirmText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFF",
  },

  // QR Modal Display
  qrDisplayBox: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminPalette.border,
  },
  qrFullImage: {
    width: 240,
    height: 240,
  },
  qrModalFooter: {
    gap: 4,
  },

  // Payout Summary Box
  payoutSummaryBox: {
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FBCFE8",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    gap: 2,
  },
  payoutSummaryAmount: {
    fontSize: 24,
    fontWeight: "900",
    color: pink,
  },
  payoutSummaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: adminPalette.text,
  },
  payoutSummaryMono: {
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "700",
    color: adminPalette.textSecondary,
  },

  warningNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    padding: 12,
    borderRadius: 10,
  },
  warningNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#991B1B",
    lineHeight: 16,
  },

  radioRow: {
    flexDirection: "row",
    gap: 8,
  },
  radioBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminPalette.border,
    backgroundColor: adminPalette.surfaceSubtle,
    alignItems: "center",
  },
  radioBtnActive: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  radioBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: adminPalette.textSecondary,
  },
  radioBtnTextActive: {
    color: "#DC2626",
    fontWeight: "800",
  },

  // Prefetch & Status Tabs Styles
  prefetchContainer: {
    backgroundColor: adminPalette.surfaceSubtle,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  prefetchSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: adminPalette.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  prefetchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  prefetchLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: adminPalette.textMuted,
    textTransform: "uppercase",
  },
  prefetchValMono: {
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "700",
    color: adminPalette.text,
    marginTop: 1,
  },
  prefetchCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FBCFE8",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  prefetchCopyBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: pink,
  },
  qrContainerBox: {
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderColor: adminPalette.border,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    gap: 6,
  },
  qrContainerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  openFullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: adminPalette.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qrWhiteBox: {
    padding: 8,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminPalette.border,
    marginTop: 4,
  },
  qrScanPrompt: {
    fontSize: 10,
    fontWeight: "600",
    color: adminPalette.textMuted,
    textAlign: "center",
  },
  noQrBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: adminPalette.surface,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: adminPalette.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  statusTabsWrap: {
    gap: 6,
  },
  statusTabsLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: adminPalette.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusTabsRow: {
    flexDirection: "row",
    backgroundColor: adminPalette.surfaceSubtle,
    borderWidth: 1,
    borderColor: adminPalette.border,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  statusTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9,
  },
  statusTabActiveProcessing: {
    backgroundColor: "#2563EB",
  },
  statusTabActivePending: {
    backgroundColor: "#D97706",
  },
  statusTabActivePaid: {
    backgroundColor: "#059669",
  },
  statusTabText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusHelpText: {
    fontSize: 11,
    color: adminPalette.textMuted,
    lineHeight: 15,
    paddingHorizontal: 4,
  },
});
