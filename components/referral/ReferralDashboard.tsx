import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabase";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Ban,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Gift,
  History,
  Info,
  Link2,
  Mail,
  Pencil,
  Phone,
  QrCode,
  RotateCcw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  User,
  UserRound,
  Wallet,
  XCircle,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { useAppTheme } from "@/components/ThemeProvider";
import {
  OFFICIAL_COMMISSION_SLABS,
  ReferralCommissionService,
  type CustomerPaymentDestination,
  type ReferralDashboardData,
  type ReferralPayoutRequest,
} from "@/services/referralCommission";
import {
  decodeQrFromImageUri,
  doUpiIdsMatch,
  normalizeUpiId,
  parseUpiString,
  validateUpiId,
} from "@/services/qrCodeParser";
import { pickImage, uploadImage } from "@/services/media";

const HERO_BG = require("@/assets/images/referral-hero-bg.jpg");

export type DashTab = "payouts" | "history" | "stats" | "share";

const TABS: Array<{
  id: DashTab;
  label: string;
  Icon: React.ComponentType<any>;
}> = [
  { id: "payouts", label: "Withdrawals", Icon: Wallet },
  { id: "history", label: "History", Icon: History },
  { id: "stats", label: "Earnings", Icon: BarChart3 },
  { id: "share", label: "Share & Earn", Icon: Share2 },
];

/**
 * 3D-styled pink wallet with floating gold coins and sparkles
 */
function WalletArt({
  isDark,
  isSmall,
}: {
  isDark?: boolean;
  isSmall?: boolean;
} = {}) {
  return (
    <View style={[styles.walletArt, isSmall && styles.walletArtSmall]}>
      <View style={[styles.coin, styles.coin1, isSmall && styles.coin1Small]}>
        <Text style={[styles.coinSymbol, isSmall && styles.coinSymbolSmall]}>₹</Text>
      </View>
      <View style={[styles.coin, styles.coin2, isSmall && styles.coin2Small]}>
        <Text style={[styles.coinSymbol, isSmall && styles.coinSymbolSmall]}>₹</Text>
      </View>
      <View style={[styles.walletBody, isSmall && styles.walletBodySmall]}>
        <View style={styles.walletCardSlot} />
        <View style={[styles.walletFlap, isSmall && styles.walletFlapSmall]}>
          <View style={styles.walletButton} />
        </View>
      </View>
      <Text style={styles.walletSparkle1}>✦</Text>
      <Text style={styles.walletSparkle2}>✦</Text>
    </View>
  );
}

/**
 * 3D-styled promotional gift box illustration with gold ribbons, floating coin, and sparkles
 */
function PromoGiftArt({
  isDark,
  isSmall,
}: {
  isDark?: boolean;
  isSmall?: boolean;
} = {}) {
  return (
    <View style={[styles.promoGiftContainer, isSmall && styles.promoGiftContainerSmall]}>
      {/* Floating Gold Coin */}
      <View style={[styles.promoCoin, isSmall && styles.promoCoinSmall]}>
        <Text style={[styles.promoCoinText, isSmall && styles.promoCoinTextSmall]}>₹</Text>
      </View>

      {/* 3D Gift Box */}
      <View style={[styles.promoGiftBox, isSmall && styles.promoGiftBoxSmall]}>
        <View style={styles.promoGiftRibbonV} />
        <View style={styles.promoGiftRibbonH} />
        <View style={styles.promoGiftBowLeft} />
        <View style={styles.promoGiftBowRight} />
        <View style={styles.promoGiftBowCenter} />
      </View>

      {/* Sparkles and Confetti */}
      <Text style={styles.promoGiftSparkle1}>✦</Text>
      <Text style={styles.promoGiftSparkle2}>✦</Text>
      <View style={styles.promoGiftConfetti1} />
      <View style={styles.promoGiftConfetti2} />
    </View>
  );
}

export default function ReferralDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile } = usePublicAuth();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 768;
  const isSmall = width < 375;
  const isCompact = width < 360;

  // Active Tab - default to Withdrawals
  const [tab, setTab] = useState<DashTab>("payouts");
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<ReferralDashboardData | null>(null);

  // Payment Destination Form State
  const [beneficiary, setBeneficiary] = useState("");
  const [upiId, setUpiId] = useState("");
  const [mobile, setMobile] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [destExpanded, setDestExpanded] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [extractedUpiId, setExtractedUpiId] = useState<string | null>(null);
  const [savingDestination, setSavingDestination] = useState(false);

  // Withdrawal Request State
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [cancellingWithdrawal, setCancellingWithdrawal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "commissions" | "withdrawals">("all");
  const [showAllSlabs, setShowAllSlabs] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    try {
      const data = await ReferralCommissionService.getReferralDashboardData(profile.id);
      if (data) {
        setDashboardData(data);
        const dest = data.paymentDestination;
        if (dest) {
          setBeneficiary(dest.beneficiaryName);
          setUpiId(dest.upiId);
          setMobile(dest.mobile || "");
          setQrCodeUrl(dest.qrCodeUrl || null);
          setOwnershipConfirmed(dest.ownershipConfirmed);
          if (dest.status === "changes_required") {
            setIsEditingDestination(true);
          } else if (dest.status === "pending" || dest.status === "under_review") {
            setIsEditingDestination(false);
          }
        } else {
          setBeneficiary(profile.full_name || "");
          setMobile(profile.phone || "");
          setIsEditingDestination(true);
        }
      }
    } catch {
      // Keep the current screen stable when the dashboard is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.full_name, profile?.phone]);

  useEffect(() => {
    void loadData();

    if (!profile?.id) return;
    const channelId = `cust-referral-rt-${profile.id}-${Date.now()}`;
    const channel = supabase.channel(channelId);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadData();
      }, 120);
    };

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_payment_destinations" }, handleUpdate)
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_payout_requests" }, handleUpdate)
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_commissions" }, handleUpdate)
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_profiles" }, handleUpdate);

    channel.subscribe();

    // Window focus sync on web
    const onFocus = () => void loadData();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    // Interval fallback to guarantee instantaneous synchronization
    const interval = setInterval(() => {
      void loadData();
    }, 4000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, loadData]);

  const displayName = profile?.full_name || dashboardData?.profile.payoutBeneficiary || "Valued Partner";
  const referralCode = dashboardData?.profile.referralCode || (profile as any)?.referral_code || "RLROYAL";
  const referralLink = dashboardData?.profile.referralUrl || `https://royallagn.com/?ref=${referralCode}`;
  const qrUri = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(referralLink)}`;

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const handleCopy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    showToast(`${label} copied to clipboard!`);
  };

  const handleWhatsAppShare = () => {
    const text = `Plan your dream wedding with verified vendors on RoyalLagn! Use my referral code ${referralCode} to get verified booking protection: ${referralLink}`;
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) return Linking.openURL(url);
        return Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`);
      })
      .catch(() => {
        void Share.share({ message: text });
      });
  };

  const handleDownloadQr = () => {
    if (Platform.OS === "web") {
      window.open(qrUri, "_blank");
    } else {
      showToast("Referral QR Code ready to scan!");
    }
  };

  // Safe QR Picker & Decoder
  const handlePickQrImage = async () => {
    try {
      const asset = await pickImage({ allowsEditing: false });
      if (!asset) return;

      setQrScanning(true);

      // Safe in-memory decoding of QR code
      const decodeResult = await decodeQrFromImageUri(asset.uri);
      if (decodeResult.success && decodeResult.data) {
        const upiResult = parseUpiString(decodeResult.data);
        if (upiResult.valid && upiResult.upiId) {
          const normExtracted = normalizeUpiId(upiResult.upiId);
          setExtractedUpiId(normExtracted);
          if (!upiId) {
            setUpiId(normExtracted);
          } else if (!doUpiIdsMatch(upiId, normExtracted)) {
            showToast("QR code extracted: " + normExtracted + ". Updating entered UPI ID to match.");
            setUpiId(normExtracted);
          }
          if (upiResult.payeeName && !beneficiary) {
            setBeneficiary(upiResult.payeeName);
          }
          showToast(`QR verified: ${normExtracted}`);
        } else {
          Alert.alert("Invalid QR", upiResult.error || "The uploaded image does not contain a valid UPI payment destination.");
        }
      } else {
        showToast("QR image selected. Please enter your UPI ID manually below.");
      }

      // Upload QR image securely to cloud
      setUploadingQr(true);
      const remoteUrl = await uploadImage(asset, { folder: "royallagn/payout_destinations" });
      setQrCodeUrl(remoteUrl);
    } catch (err: any) {
      Alert.alert("QR Upload", err.message || "Failed to process QR code image.");
    } finally {
      setQrScanning(false);
      setUploadingQr(false);
    }
  };

  const handleSaveDestination = async () => {
    if (!profile?.id) {
      Alert.alert("Sign In Required", "Please sign in to save payment details.");
      return;
    }
    if (dashboardData?.activeWithdrawal) {
      Alert.alert(
        "Active Withdrawal Exists",
        "Cannot update payment details while a withdrawal request is currently in progress. Cancel the active request first or wait for completion."
      );
      return;
    }
    if (!beneficiary.trim()) {
      Alert.alert("Beneficiary Name Required", "Please enter the account-holder name as recorded with your bank.");
      return;
    }
    const cleanUpi = normalizeUpiId(upiId);
    if (!cleanUpi || !validateUpiId(cleanUpi)) {
      Alert.alert("Valid UPI ID Required", "Please enter a valid UPI ID (e.g. yourname@bank).");
      return;
    }
    if (extractedUpiId && !doUpiIdsMatch(cleanUpi, extractedUpiId)) {
      Alert.alert("Mismatch Detected", "Entered UPI ID does not match the uploaded QR code. Please ensure both destinations are identical.");
      return;
    }
    if (!ownershipConfirmed) {
      Alert.alert("Ownership Confirmation", "Please confirm that the receiving payment account belongs to you.");
      return;
    }

    setSavingDestination(true);
    try {
      const res = await ReferralCommissionService.submitPaymentDestination({
        beneficiaryName: beneficiary.trim(),
        upiId: cleanUpi,
        qrCodeUrl: qrCodeUrl || null,
        mobile: mobile.trim() || null,
        ownershipConfirmed,
      });

      if (res.success) {
        Alert.alert(
          "Submitted for Review",
          "Your payment destination has been submitted for review. Our team will verify the beneficiary name and UPI destination in our business payment app."
        );
        setIsEditingDestination(false);
        const updated = await ReferralCommissionService.getReferralDashboardData(profile.id);
        if (updated) setDashboardData(updated);
      } else {
        Alert.alert("Error", res.message || "Failed to submit payment details.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save payment details.");
    } finally {
      setSavingDestination(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    if (!profile?.id) {
      Alert.alert("Sign In Required", "Please sign in to request a withdrawal.");
      return;
    }
    const dest = dashboardData?.paymentDestination;
    if (!dest || dest.status !== "approved") {
      Alert.alert(
        "Verification Required",
        "Your payment details must be reviewed and approved by the RoyalLagn team before requesting a withdrawal."
      );
      return;
    }
    if (dashboardData?.activeWithdrawal) {
      Alert.alert(
        "Active Withdrawal",
        "You already have an active withdrawal request in progress. Only one request is allowed at a time."
      );
      return;
    }
    const val = Number(withdrawAmount);
    if (!val || val < 500) {
      Alert.alert("Minimum Required", "Minimum withdrawal amount is ₹500.");
      return;
    }
    const available = dashboardData?.profile.earnedBalance || 0;
    if (val > available) {
      Alert.alert("Insufficient Balance", `Your available balance is ₹${available.toLocaleString("en-IN")}.`);
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const res = await ReferralCommissionService.requestWithdrawal(val);
      if (res.success) {
        Alert.alert(
          "Withdrawal Requested",
          `₹${val.toLocaleString("en-IN")} has been reserved. Our team will manually transfer funds from RoyalLagn's business account and update the bank UTR reference.`
        );
        setWithdrawAmount("");
        const updated = await ReferralCommissionService.getReferralDashboardData(profile.id);
        if (updated) setDashboardData(updated);
      } else {
        Alert.alert("Error", res.message || "Failed to submit withdrawal request.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit withdrawal request.");
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const handleCancelWithdrawal = (requestId: string) => {
    Alert.alert(
      "Cancel Withdrawal?",
      "Are you sure you want to cancel this withdrawal request? The reserved funds will be returned to your available balance immediately.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancellingWithdrawal(true);
            try {
              const res = await ReferralCommissionService.cancelWithdrawal(requestId);
              if (res.success) {
                showToast("Withdrawal cancelled. Funds restored to available balance.");
                const updated = await ReferralCommissionService.getReferralDashboardData(profile?.id || "");
                if (updated) setDashboardData(updated);
              } else {
                Alert.alert("Error", res.message || "Failed to cancel withdrawal.");
              }
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to cancel withdrawal.");
            } finally {
              setCancellingWithdrawal(false);
            }
          },
        },
      ]
    );
  };

  const paymentDest = dashboardData?.paymentDestination;
  const isDestApproved = paymentDest?.status === "approved";
  const isDestPending = paymentDest?.status === "pending" || paymentDest?.status === "under_review";
  const isDestChangesRequired = paymentDest?.status === "changes_required";
  const activeWithdrawal = dashboardData?.activeWithdrawal;

  // =========================================================================
  // =========================================================================
  // SUB-COMPONENT: HERO EARNINGS CARD
  // =========================================================================
  const renderHeroCard = () => {
    return (
      <View style={styles.heroCardShadowWrap}>
        <ImageBackground
          source={HERO_BG}
          resizeMode="cover"
          imageStyle={styles.heroBgImage}
          style={styles.heroCard}
        >
          {/* Soft luxury overlay keeping artwork visible while maximizing contrast */}
          <View style={[styles.heroCardOverlay, isSmall && styles.heroCardOverlaySmall]}>
            <View style={styles.heroTopContent}>
              <View style={styles.heroLeftCol}>
                <View style={styles.userRow}>
                  <View style={[styles.avatarCircle, isSmall && styles.avatarCircleSmall]}>
                    <UserRound size={isSmall ? 17 : 20} color="#E91E63" strokeWidth={2.2} />
                  </View>
                  <View style={styles.userMeta}>
                    <Text style={[styles.welcomeText, isSmall && styles.welcomeTextSmall]}>WELCOME BACK</Text>
                    <Text numberOfLines={1} style={[styles.userName, isSmall && styles.userNameSmall]}>
                      {displayName}
                    </Text>
                  </View>
                </View>

                <View style={styles.badgeRow}>
                  <View style={styles.ownerBadge}>
                    <Text style={styles.crownIcon}>♛</Text>
                    <Text style={styles.ownerBadgeText}>ROYALLAGN REFERRAL</Text>
                  </View>
                  <Text style={styles.commissionText}>Up to ₹6,000 / booking</Text>
                </View>

                {/* Primary Available Earnings */}
                <View style={styles.earningsBlock}>
                  <Text style={[styles.earningsLabel, isSmall && styles.earningsLabelSmall]}>Available for Withdrawal</Text>
                  <Text style={[styles.earningsAmount, isSmall && styles.earningsAmountSmall]}>
                    ₹ {Number(dashboardData?.profile.earnedBalance || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>
            </View>

            {/* 3 Secondary Metric Pills in Frosted Glass Panel */}
            <View style={[styles.secondaryMetricsRow, isSmall && styles.secondaryMetricsRowSmall]}>
              <View style={styles.secMetricItem}>
                <View style={styles.secMetricHeader}>
                  <Clock size={11} color="#2563EB" strokeWidth={2.2} />
                  <Text style={styles.secMetricLabel}>In Progress</Text>
                </View>
                <Text style={[styles.secMetricVal, { color: "#2563EB" }]}>
                  ₹ {Number(dashboardData?.profile.reservedBalance || 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.secMetricDivider} />
              <View style={styles.secMetricItem}>
                <View style={styles.secMetricHeader}>
                  <Clock size={11} color="#D97706" strokeWidth={2.2} />
                  <Text style={styles.secMetricLabel}>Pending Confirm</Text>
                </View>
                <Text style={[styles.secMetricVal, { color: "#D97706" }]}>
                  ₹ {Number(dashboardData?.profile.pendingEarnings || 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.secMetricDivider} />
              <View style={styles.secMetricItem}>
                <View style={styles.secMetricHeader}>
                  <CreditCard size={11} color="#059669" strokeWidth={2.2} />
                  <Text style={styles.secMetricLabel}>Total Withdrawn</Text>
                </View>
                <Text style={[styles.secMetricVal, { color: "#059669" }]}>
                  ₹ {Number(dashboardData?.profile.totalPaidOut || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>
        </ImageBackground>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: 4 SEGMENTED TABS BAR
  // =========================================================================
  const renderTabsBar = () => {
    return (
      <View style={styles.tabsTrackContainer}>
        <View style={[styles.tabsBar, isSmall && styles.tabsBarSmall]}>
          {TABS.map(({ id, label }) => {
            const active = tab === id;

            return (
              <View key={id} style={styles.tabSlot}>
                <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label}${active ? ", selected" : ""}`}
                onPress={() => setTab(id)}
                style={({ pressed }) => [
                  styles.tabButton,
                  isSmall && styles.tabButtonSmall,
                  pressed && styles.tabButtonPressed,
                ]}
                >
                  <View
                    style={[
                      styles.tabButtonSurface,
                      isSmall && styles.tabButtonSurfaceSmall,
                      active && styles.tabButtonSurfaceActive,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabText,
                        isSmall && styles.tabTextSmall,
                        active ? styles.tabTextActive : styles.tabTextInactive,
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: VERIFIED DESTINATION CARD
  // =========================================================================
  const renderVerifiedDestinationCard = () => {
    if (isDestApproved && !isEditingDestination) {
      return (
        <View style={styles.minimizedVerifiedCard}>
          <View style={styles.minimizedVerifiedRow}>
            <View style={styles.minimizedBadgeCircle}>
              <CheckCircle2 size={16} color="#059669" strokeWidth={2.4} />
            </View>

            <Pressable
              onPress={() => setDestExpanded(!destExpanded)}
              style={styles.minimizedInfoCol}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.minimizedTitle}>Verified Destination</Text>
                <View style={styles.minimizedEligiblePill}>
                  <Text style={styles.minimizedEligiblePillText}>ELIGIBLE</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.minimizedSubtitle}>
                {paymentDest.beneficiaryName} · <Text style={{ color: "#059669", fontWeight: "700" }}>{paymentDest.upiId}</Text>
              </Text>
            </Pressable>

            <View style={styles.minimizedActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit payment details"
                onPress={() => {
                  if (activeWithdrawal) {
                    Alert.alert("Locked", "Payment details cannot be edited while a withdrawal request is active.");
                    return;
                  }
                  setIsEditingDestination(true);
                }}
                style={({ pressed }) => [
                  styles.minimizedEditBtn,
                  pressed && { opacity: 0.7 },
                  Boolean(activeWithdrawal) && { opacity: 0.5 },
                ]}
              >
                <Pencil size={11} color="#E91E63" strokeWidth={2.2} />
                <Text style={styles.minimizedEditBtnText}>Edit</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={destExpanded ? "Collapse details" : "Expand details"}
                onPress={() => setDestExpanded(!destExpanded)}
                style={styles.minimizedChevronBtn}
              >
                {destExpanded ? (
                  <ChevronUp size={15} color="#6B7280" />
                ) : (
                  <ChevronDown size={15} color="#6B7280" />
                )}
              </Pressable>
            </View>
          </View>

          {/* Expandable Details Box */}
          {destExpanded ? (
            <View style={styles.minimizedExpandedDetailsBox}>
              <View style={styles.destDetailRow}>
                <User size={14} color="#9CA3AF" />
                <Text style={styles.destDetailText}>{paymentDest.beneficiaryName}</Text>
              </View>
              <View style={styles.destDetailRow}>
                <Mail size={14} color="#9CA3AF" />
                <Text style={styles.destDetailText}>{paymentDest.upiId}</Text>
              </View>
              {paymentDest.mobile ? (
                <View style={styles.destDetailRow}>
                  <Phone size={14} color="#9CA3AF" />
                  <Text style={styles.destDetailText}>{paymentDest.mobile}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    }

    // EXPANDED PAYMENT DESTINATION EDITOR
    return (
      <View style={[styles.sectionCard, isDark && styles.sectionCardDark]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={16} color="#E91E63" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Receiving Payment Destination
            </Text>
            <Text style={styles.sectionSub}>
              One active UPI account for receiving manual transfers
            </Text>
          </View>

          {/* Status Badge */}
          {paymentDest ? (
            <View
              style={[
                styles.statusBadge,
                paymentDest.status === "approved" && styles.statusBadgeApproved,
                isDestPending && styles.statusBadgePending,
                isDestChangesRequired && styles.statusBadgeRejected,
              ]}
            >
              {paymentDest.status === "approved" ? (
                <CheckCircle2 size={12} color="#059669" />
              ) : isDestPending ? (
                <Clock size={12} color="#D97706" />
              ) : (
                <XCircle size={12} color="#DC2626" />
              )}
              <Text
                style={[
                  styles.statusBadgeText,
                  paymentDest.status === "approved" && { color: "#059669" },
                  isDestPending && { color: "#D97706" },
                  isDestChangesRequired && { color: "#DC2626" },
                ]}
              >
                {isEditingDestination && paymentDest.status === "approved"
                  ? "EDITING"
                  : paymentDest.status === "approved"
                  ? "APPROVED"
                  : isDestPending
                  ? "UNDER REVIEW"
                  : "CHANGES REQUIRED"}
              </Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.statusBadgeNotSubmitted]}>
              <Text style={[styles.statusBadgeText, { color: "#6B7280" }]}>NOT SUBMITTED</Text>
            </View>
          )}
        </View>

        {/* Changes Required Notice */}
        {isDestChangesRequired && paymentDest?.rejectionReason ? (
          <View style={styles.rejectedBanner}>
            <AlertTriangle size={16} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedBannerTitle}>Changes Required by Team:</Text>
              <Text style={styles.rejectedBannerBody}>{paymentDest.rejectionReason}</Text>
            </View>
          </View>
        ) : null}

        {/* Under Review Notice */}
        {isDestPending && !isEditingDestination ? (
          <View style={styles.pendingBanner}>
            <Clock size={16} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingBannerTitle}>Verification Request Sent</Text>
              <Text style={styles.pendingBannerBody}>
                Your payment destination was submitted and is currently being verified by our team.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Form Inputs */}
        <View style={styles.destForm}>
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
              Beneficiary Full Name <Text style={{ color: "#E91E63" }}>*</Text>
            </Text>
            <TextInput
              value={beneficiary}
              onChangeText={setBeneficiary}
              placeholder="As per bank / PAN record"
              placeholderTextColor="#A0989D"
              editable={!isDestPending || isEditingDestination}
              style={[styles.inputField, isDark && styles.inputFieldDark]}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
              UPI ID / VPA <Text style={{ color: "#E91E63" }}>*</Text>
            </Text>
            <TextInput
              value={upiId}
              onChangeText={(txt) => setUpiId(txt.trim().toLowerCase())}
              placeholder="e.g. yourname@icici or mobile@upi"
              placeholderTextColor="#A0989D"
              autoCapitalize="none"
              editable={!isDestPending || isEditingDestination}
              style={[styles.inputField, isDark && styles.inputFieldDark]}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
              Linked Mobile Number (Optional)
            </Text>
            <TextInput
              value={mobile}
              onChangeText={setMobile}
              placeholder="10-digit mobile number"
              placeholderTextColor="#A0989D"
              keyboardType="phone-pad"
              editable={!isDestPending || isEditingDestination}
              style={[styles.inputField, isDark && styles.inputFieldDark]}
            />
          </View>

          {/* QR Code Upload / Scan */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
              UPI QR Code (Optional)
            </Text>
            <Pressable
              onPress={handlePickQrImage}
              disabled={qrScanning || uploadingQr || (isDestPending && !isEditingDestination)}
              style={styles.qrUploadBtn}
            >
              {qrScanning || uploadingQr ? (
                <ActivityIndicator size="small" color="#E91E63" />
              ) : (
                <>
                  <Upload size={14} color="#E91E63" />
                  <Text style={styles.qrUploadBtnText}>
                    {qrCodeUrl ? "QR Code Attached (Tap to change)" : "Upload / Scan QR Screenshot"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Ownership Confirmation Checkbox */}
          <Pressable
            onPress={() => setOwnershipConfirmed(!ownershipConfirmed)}
            disabled={isDestPending && !isEditingDestination}
            style={styles.ownershipRow}
          >
            <View style={[styles.ownershipBox, ownershipConfirmed && styles.ownershipBoxChecked]}>
              {ownershipConfirmed ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <Text style={[styles.ownershipText, isDark && styles.subtitleDark]}>
              I confirm that this receiving payment destination belongs to me and matches my legal name.
            </Text>
          </Pressable>

          {/* Save Button */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {isEditingDestination && isDestApproved ? (
              <Pressable
                onPress={() => setIsEditingDestination(false)}
                style={styles.cancelEditBtn}
              >
                <Text style={styles.cancelEditBtnText}>Cancel</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleSaveDestination}
              disabled={Boolean(activeWithdrawal) || savingDestination}
              style={[
                styles.primaryPillBtn,
                { flex: 1 },
                (Boolean(activeWithdrawal) || savingDestination) && { opacity: 0.6 },
              ]}
            >
              {savingDestination ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryPillBtnText}>
                  {isDestChangesRequired || (isEditingDestination && isDestApproved)
                    ? "Submit for Reverification"
                    : "Save & Submit for Verification"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: REQUEST WITHDRAWAL CARD
  // =========================================================================
  const renderRequestWithdrawalCard = () => {
    return (
      <View style={[styles.requestWithdrawalCard, isDark && styles.requestWithdrawalCardDark]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.iconCircle}>
            <Wallet size={16} color="#E91E63" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
              Request Withdrawal <Text style={styles.minAmountTag}>(Min ₹500)</Text>
            </Text>
            <Text style={styles.sectionSub}>
              Manual transfer from RoyalLagn business payment account
            </Text>
          </View>
        </View>

        {/* State A: Active Withdrawal in progress */}
        {activeWithdrawal ? (
          <View style={styles.activeWithdrawalCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.activeWithdrawalTitle}>Active Withdrawal in Progress</Text>
              <View style={styles.activeStatusPill}>
                <Clock size={12} color="#D97706" />
                <Text style={styles.activeStatusPillText}>{activeWithdrawal.status.toUpperCase()}</Text>
              </View>
            </View>

            <Text style={styles.activeWithdrawalAmount}>
              ₹ {activeWithdrawal.amount.toLocaleString("en-IN")}
            </Text>

            <Text style={styles.activeWithdrawalDest}>
              Destination: {activeWithdrawal.beneficiaryName} ({activeWithdrawal.destinationSnapshot?.upi_id || activeWithdrawal.mobile})
            </Text>
            <Text style={styles.activeWithdrawalDate}>
              Submitted: {new Date(activeWithdrawal.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>

            {["requested", "under_review", "approved"].includes(activeWithdrawal.status) ? (
              <Pressable
                onPress={() => handleCancelWithdrawal(activeWithdrawal.id)}
                disabled={cancellingWithdrawal}
                style={styles.cancelWithdrawalBtn}
              >
                {cancellingWithdrawal ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <RotateCcw size={13} color="#DC2626" />
                    <Text style={styles.cancelWithdrawalBtnText}>Cancel Request & Release Funds</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={styles.processingNote}>
                <Info size={13} color="#2563EB" />
                <Text style={styles.processingNoteText}>
                  Finance team is currently processing your payment. It cannot be cancelled.
                </Text>
              </View>
            )}
          </View>
        ) : !isDestApproved ? (
          /* State B: Destination not approved */
          <View style={styles.notApprovedBox}>
            <ShieldAlert size={20} color="#D97706" />
            <Text style={[styles.notApprovedTitle, isDark && styles.textDark]}>
              Payment Destination Required
            </Text>
            <Text style={styles.notApprovedBody}>
              {paymentDest?.status === "pending" || paymentDest?.status === "under_review"
                ? "Your payment details are currently under manual review. Withdrawals will unlock once approved."
                : paymentDest?.status === "changes_required"
                ? "Your payment details need corrections. Please edit and resubmit your payment destination."
                : "Submit and verify your receiving UPI payment details to unlock withdrawals."}
            </Text>
          </View>
        ) : (
          /* State C: Ready to request */
          <View style={{ gap: 12 }}>
            {/* Input Row: Amount input with ₹ prefix & inline CTA button on Desktop */}
            <View style={[styles.payoutInputRow, isDesktop ? styles.payoutInputRowDesktop : styles.payoutInputRowMobile]}>
              <View style={[styles.payoutInputWrap, isDark && styles.payoutInputWrapDark]}>
                <Text style={styles.rupeePrefix}>₹</Text>
                <TextInput
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  placeholder="Enter amount (Min ₹500)"
                  placeholderTextColor="#A0989D"
                  keyboardType="numeric"
                  editable={!submittingWithdrawal}
                  style={[styles.payoutInputField, isDark && styles.inputFieldDark]}
                />
              </View>

              {/* Action Button: Inline on Desktop, or below chips on mobile */}
              {isDesktop ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleRequestWithdrawal}
                  disabled={submittingWithdrawal}
                  style={({ pressed }) => [
                    styles.payoutSubmitBtn,
                    pressed && styles.btnPressed,
                    submittingWithdrawal && { opacity: 0.6 },
                  ]}
                >
                  {submittingWithdrawal ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.payoutSubmitBtnText}>Request Withdrawal</Text>
                      <ArrowRight size={15} color="#FFFFFF" strokeWidth={2.4} />
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            {/* Quick Amount Chips */}
            <View style={styles.chipsRow}>
              {[500, 1000, 2000].map((amt) => (
                <Pressable
                  key={amt}
                  onPress={() => setWithdrawAmount(String(amt))}
                  style={[styles.chip, isDark && styles.chipDark]}
                >
                  <Text style={[styles.chipText, isDark && styles.textDark]}>₹{amt}</Text>
                </Pressable>
              ))}
              {dashboardData?.profile.earnedBalance ? (
                <Pressable
                  onPress={() => setWithdrawAmount(String(dashboardData.profile.earnedBalance))}
                  style={[styles.chip, styles.chipAll]}
                >
                  <Text style={[styles.chipText, { color: "#E91E63", fontWeight: "700" }]}>All Available</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Mobile Full-width CTA Button */}
            {!isDesktop ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleRequestWithdrawal}
                disabled={submittingWithdrawal}
                style={({ pressed }) => [
                  styles.payoutSubmitBtnMobile,
                  pressed && styles.btnPressed,
                  submittingWithdrawal && { opacity: 0.6 },
                ]}
              >
                {submittingWithdrawal ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.payoutSubmitBtnText}>Request Withdrawal</Text>
                    <ArrowRight size={15} color="#FFFFFF" strokeWidth={2.4} />
                  </>
                )}
              </Pressable>
            ) : null}

            {/* Destination Confirmation Notice */}
            <View style={[styles.destinationNoticeBox, isDark && styles.destinationNoticeBoxDark]}>
              <Info size={15} color="#2563EB" style={{ marginTop: 1 }} />
              <Text style={[styles.destinationNoticeText, isDark && styles.destinationNoticeTextDark]}>
                Transfers will be sent to: <Text style={{ fontWeight: "700" }}>{paymentDest.beneficiaryName}</Text> ({paymentDest.upiId}). Expected turnaround: 24-48 business hours.
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: ROYALLAGN REFERRAL PROMO CARD & COMMISSION SLABS TABLE
  // =========================================================================
  const renderPromoCard = () => {
    return (
      <View style={[styles.promoCard, isDark && styles.promoCardDark]}>
        {/* Top Summary Row with 3D Gift Box Art */}
        <View style={styles.promoTopRow}>
          <View style={styles.promoLeft}>
            <View style={styles.promoHeaderRow}>
              <View style={styles.promoGiftIconCircle}>
                <Gift size={16} color="#E91E63" strokeWidth={2.2} />
              </View>
              <View>
                <Text style={[styles.promoTitle, isDark && styles.textDark]}>
                  RoyalLagn Referral
                </Text>
                <Text style={styles.promoSubtitle}>
                  Earn up to <Text style={{ color: "#E91E63", fontWeight: "800" }}>₹6,000</Text> per booking
                </Text>
              </View>
            </View>

            <View style={styles.promoCheckList}>
              <View style={styles.promoCheckRow}>
                <Check size={14} color="#E91E63" strokeWidth={2.5} />
                <Text style={[styles.promoCheckText, isDark && styles.subtitleDark]}>
                  Refer vendors & businesses
                </Text>
              </View>
              <View style={styles.promoCheckRow}>
                <Check size={14} color="#E91E63" strokeWidth={2.5} />
                <Text style={[styles.promoCheckText, isDark && styles.subtitleDark]}>
                  Earn commission per booking
                </Text>
              </View>
              <View style={styles.promoCheckRow}>
                <Check size={14} color="#E91E63" strokeWidth={2.5} />
                <Text style={[styles.promoCheckText, isDark && styles.subtitleDark]}>
                  Withdraw anytime (Min ₹500)
                </Text>
              </View>
            </View>
          </View>

          {/* 3D Gift Box Art on the right */}
          <PromoGiftArt isDark={isDark} isSmall={isSmall} />
        </View>

        {/* Divider */}
        <View style={[styles.slabDivider, isDark && styles.slabDividerDark]} />

        {/* Slabs Section Header */}
        <View style={styles.slabsHeaderRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <View style={styles.slabAwardCircle}>
              <Award size={14} color="#E91E63" strokeWidth={2.2} />
            </View>
            <View>
              <Text style={[styles.slabsSectionTitle, isDark && styles.textDark]}>
                Referral Earning Slabs
              </Text>
              <Text style={styles.slabsSectionSub}>
                Calculated on confirmed total booking amount
              </Text>
            </View>
          </View>
        </View>

        {/* Slabs Table */}
        <View style={[styles.slabsTableContainer, isDark && styles.slabsTableContainerDark]}>
          {/* Table Column Headers */}
          <View style={[styles.slabTableRow, styles.slabTableHeaderRow, isDark && styles.slabTableHeaderRowDark]}>
            <Text style={[styles.slabHeaderColText, { flex: 1.3 }]}>BOOKING AMOUNT</Text>
            <Text style={[styles.slabHeaderColText, { textAlign: "right", flex: 1 }]}>REFERRAL EARNING</Text>
          </View>

          {/* Table Data Rows */}
          {(showAllSlabs ? OFFICIAL_COMMISSION_SLABS : OFFICIAL_COMMISSION_SLABS.slice(0, 5)).map((slab, idx) => {
            const isTopTier = slab.referrerReward >= 5000;
            const isZero = slab.referrerReward === 0;
            const isEven = idx % 2 === 0;

            const formatRange = (min: number, max: number | null) => {
              if (max === null) return `₹${min.toLocaleString("en-IN")} & above`;
              return `₹${min.toLocaleString("en-IN")} to ₹${max.toLocaleString("en-IN")}`;
            };

            return (
              <View
                key={slab.label}
                style={[
                  styles.slabTableRow,
                  isEven && styles.slabTableRowEven,
                  isEven && isDark && styles.slabTableRowEvenDark,
                  isTopTier && styles.slabTableRowTopTier,
                  isTopTier && isDark && styles.slabTableRowTopTierDark,
                ]}
              >
                <View style={{ flex: 1.3, flexDirection: "row", alignItems: "center", gap: 5 }}>
                  {isTopTier ? <Sparkles size={11} color="#E91E63" /> : null}
                  <Text style={[styles.slabRangeText, isDark && styles.textDark, isTopTier && { fontWeight: "700", color: "#E91E63" }]}>
                    {formatRange(slab.min, slab.max)}
                  </Text>
                </View>

                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <View
                    style={[
                      styles.slabRewardBadge,
                      isZero && styles.slabRewardBadgeZero,
                      isZero && isDark && styles.slabRewardBadgeZeroDark,
                      isTopTier && styles.slabRewardBadgeTopTier,
                    ]}
                  >
                    <Text
                      style={[
                        styles.slabRewardText,
                        isZero && styles.slabRewardTextZero,
                        isTopTier && styles.slabRewardTextTopTier,
                      ]}
                    >
                      {isZero ? "Rs. 0" : `Rs. ${slab.referrerReward.toLocaleString("en-IN")}`}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* View All (9) / Show Less Toggle Row below ₹50,000 to ₹69,999 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showAllSlabs ? "Show fewer slabs" : "View all 9 slabs"}
            onPress={() => setShowAllSlabs(!showAllSlabs)}
            style={({ pressed }) => [
              styles.slabTableFooterRow,
              isDark && styles.slabTableFooterRowDark,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.slabTableFooterText}>
              {showAllSlabs ? "Show Less" : "View All (9)"}
            </Text>
            {showAllSlabs ? (
              <ChevronUp size={13} color="#E91E63" strokeWidth={2.4} />
            ) : (
              <ChevronDown size={13} color="#E91E63" strokeWidth={2.4} />
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: HOW WITHDRAWALS WORK CARD
  // =========================================================================
  const renderHowWithdrawalsWorkCard = () => {
    return (
      <View style={[styles.sectionCard, isDark && styles.sectionCardDark]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.iconCircle}>
            <FileText size={16} color="#E91E63" strokeWidth={2.2} />
          </View>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            How withdrawals work
          </Text>
        </View>

        <View style={styles.howStepsList}>
          <View style={styles.howStepRow}>
            <View style={styles.howStepNumber}>
              <Text style={styles.howStepNumberText}>1</Text>
            </View>
            <Text style={[styles.howStepText, isDark && styles.subtitleDark]}>
              Minimum withdrawal amount is ₹500
            </Text>
          </View>

          <View style={styles.howStepRow}>
            <View style={styles.howStepNumber}>
              <Text style={styles.howStepNumberText}>2</Text>
            </View>
            <Text style={[styles.howStepText, isDark && styles.subtitleDark]}>
              Enter the amount and request withdrawal
            </Text>
          </View>

          <View style={styles.howStepRow}>
            <View style={styles.howStepNumber}>
              <Text style={styles.howStepNumberText}>3</Text>
            </View>
            <Text style={[styles.howStepText, isDark && styles.subtitleDark]}>
              Amount will be transferred to your verified bank account
            </Text>
          </View>

          <View style={styles.howStepRow}>
            <View style={styles.howStepNumber}>
              <Text style={styles.howStepNumberText}>4</Text>
            </View>
            <Text style={[styles.howStepText, isDark && styles.subtitleDark]}>
              Expected turnaround time: <Text style={{ fontWeight: "700", color: isDark ? "#F9FAFB" : "#111827" }}>24-48 business hours</Text>
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: HISTORY TAB CARD
  // =========================================================================
  const renderHistoryCard = () => {
    return (
      <View style={[styles.sectionCard, isSmall && styles.sectionCardSmall, isDark && styles.sectionCardDark]}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
            <History size={isSmall ? 15 : 16} color="#E91E63" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, isSmall && styles.sectionTitleSmall, isDark && styles.textDark]}>
              Activity & Payout History
            </Text>
            <Text style={[styles.sectionSub, isSmall && styles.sectionSubSmall]}>
              Track your earned commissions and manual withdrawal status
            </Text>
          </View>
        </View>

        {/* Filter Chips */}
        <View style={styles.historyFilterChipsRow}>
          <Pressable
            onPress={() => setHistoryFilter("all")}
            style={[styles.historyFilterChip, historyFilter === "all" && styles.historyFilterChipActive]}
          >
            <Text style={[styles.historyFilterChipText, historyFilter === "all" && styles.historyFilterChipTextActive]}>
              All ({((dashboardData?.commissions?.length || 0) + (dashboardData?.payoutRequests?.length || 0))})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setHistoryFilter("withdrawals")}
            style={[styles.historyFilterChip, historyFilter === "withdrawals" && styles.historyFilterChipActive]}
          >
            <Text style={[styles.historyFilterChipText, historyFilter === "withdrawals" && styles.historyFilterChipTextActive]}>
              Withdrawals ({dashboardData?.payoutRequests?.length || 0})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setHistoryFilter("commissions")}
            style={[styles.historyFilterChip, historyFilter === "commissions" && styles.historyFilterChipActive]}
          >
            <Text style={[styles.historyFilterChipText, historyFilter === "commissions" && styles.historyFilterChipTextActive]}>
              Commissions ({dashboardData?.commissions?.length || 0})
            </Text>
          </Pressable>
        </View>

        {/* 1. WITHDRAWALS SECTION */}
        {(historyFilter === "all" || historyFilter === "withdrawals") && dashboardData?.payoutRequests && dashboardData.payoutRequests.length > 0 ? (
          <View style={{ gap: 10 }}>
            {historyFilter === "all" ? (
              <Text style={[styles.historySectionHeading, isDark && styles.textDark]}>
                Withdrawal Requests ({dashboardData.payoutRequests.length})
              </Text>
            ) : null}
            {dashboardData.payoutRequests.map((req) => {
              const isPaid = req.status === "paid" || req.status === "processed";
              const isProcessing = req.status === "processing";
              const isRejected = req.status === "rejected";
              const isCancelled = req.status === "cancelled";
              const isPendingState = ["requested", "under_review", "payment_pending"].includes(req.status);

              return (
                <View
                  key={req.id}
                  style={[styles.historyRowCard, isDark && styles.historyRowCardDark]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.historyAmount, isDark && styles.textDark]}>
                      ₹ {req.amount.toLocaleString("en-IN")}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        isPaid && styles.statusBadgeApproved,
                        isProcessing && { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" },
                        isPendingState && styles.statusBadgePending,
                        (isRejected || isCancelled) && { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isPaid && { color: "#059669" },
                          isProcessing && { color: "#1D4ED8" },
                          isPendingState && { color: "#D97706" },
                          (isRejected || isCancelled) && { color: "#6B7280" },
                        ]}
                      >
                        {req.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.historyMeta}>
                    Destination: {req.beneficiaryName} ({req.destinationSnapshot?.upi_id || req.mobile})
                  </Text>
                  <Text style={styles.historyMeta}>
                    Requested: {new Date(req.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>

                  {req.transactionRef ? (
                    <View style={styles.utrBadgeBox}>
                      <Text style={styles.utrBadgeLabel}>Bank Ref / UTR:</Text>
                      <Text selectable style={styles.utrBadgeValue}>{req.transactionRef}</Text>
                    </View>
                  ) : null}

                  {req.rejectionReason ? (
                    <Text style={styles.historyRejection}>Reason: {req.rejectionReason}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* 2. COMMISSIONS SECTION */}
        {(historyFilter === "all" || historyFilter === "commissions") && dashboardData?.commissions && dashboardData.commissions.length > 0 ? (
          <View style={{ gap: 10, marginTop: historyFilter === "all" && dashboardData?.payoutRequests?.length ? 12 : 0 }}>
            {historyFilter === "all" ? (
              <Text style={[styles.historySectionHeading, isDark && styles.textDark]}>
                Booking Commissions ({dashboardData.commissions.length})
              </Text>
            ) : null}
            {dashboardData.commissions.map((comm) => {
              const isPending = comm.status === "pending";
              const isEarned = comm.status === "earned";
              const isCancelled = comm.status === "cancelled";

              const badgeBg = isEarned ? (isDark ? "#064E3B" : "#ECFDF5") : isPending ? (isDark ? "#78350F" : "#FFFBEB") : (isDark ? "#450A0A" : "#FEF2F2");
              const badgeBorder = isEarned ? "#10B981" : isPending ? "#F59E0B" : "#EF4444";
              const badgeText = isEarned ? "#059669" : isPending ? "#D97706" : "#DC2626";
              const statusLabel = isEarned ? "EARNED" : isPending ? "PENDING" : isCancelled ? "CANCELLED" : "REVERSED";

              const dateStr = comm.createdAt ? new Date(comm.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

              return (
                <View
                  key={comm.id}
                  style={[styles.historyRowCard, isDark && styles.historyRowCardDark]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: isDark ? "#FFFFFF" : "#111827" }}>
                        #{comm.ticketId || comm.bookingId}
                      </Text>
                      <Text style={{ fontSize: 11, color: isDark ? "#9CA3AF" : "#6B7280" }}>
                        {dateStr}
                      </Text>
                    </View>

                    <View style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 12,
                      backgroundColor: badgeBg,
                      borderWidth: 1,
                      borderColor: badgeBorder,
                    }}>
                      <Text style={{ fontSize: 10.5, fontWeight: "800", color: badgeText, letterSpacing: 0.5 }}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 0.5, borderTopColor: isDark ? "#374151" : "#F3E8EC" }}>
                    <Text style={{ fontSize: 12, color: isDark ? "#9CA3AF" : "#6B7280" }}>Total Booking Value</Text>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isDark ? "#E5E7EB" : "#374151" }}>
                      ₹{comm.bookingTotal.toLocaleString("en-IN")}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, color: isDark ? "#9CA3AF" : "#6B7280" }}>Slab</Text>
                    <Text style={{ fontSize: 12, color: isDark ? "#E5E7EB" : "#374151" }}>
                      {comm.commissionSlab}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: 2, borderTopWidth: 0.5, borderTopColor: isDark ? "#374151" : "#F3E8EC" }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: isDark ? "#FFFFFF" : "#111827" }}>Referrer Reward</Text>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#E91E63" }}>
                      ₹{comm.referrerReward.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Empty State */}
        {(!dashboardData?.commissions?.length && !dashboardData?.payoutRequests?.length) ? (
          <View style={[styles.emptyHistoryBox, isSmall && styles.emptyHistoryBoxSmall]}>
            <View style={styles.emptyHistoryIcon}>
              <Gift size={26} color="#E91E63" strokeWidth={1.8} />
            </View>
            <Text style={[styles.emptyHistoryTitle, isDark && styles.textDark]}>
              No Activity Recorded Yet
            </Text>
            <Text style={styles.emptyHistorySub}>
              Share your referral code with couples planning weddings. When their bookings are confirmed and payouts are made, records appear here.
            </Text>
            <Pressable
              onPress={() => setTab("share")}
              style={styles.historyShareCta}
            >
              <Text style={styles.historyShareCtaText}>Go to Share & Earn →</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: STATS TAB CARD
  // =========================================================================
  const renderStatsCard = () => {
    return (
      <View style={{ gap: 14 }}>
        <View style={[styles.statsGrid, isSmall && styles.statsGridSmall]}>
          {/* 1. AVAILABLE EARNINGS */}
          <View style={[styles.statCard, isSmall && styles.statCardSmall, isDark && styles.sectionCardDark]}>
            <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
              <Wallet size={16} color="#059669" strokeWidth={2.2} />
            </View>
            <Text style={[styles.statLabel, isSmall && styles.statLabelSmall]}>AVAILABLE FOR WITHDRAWAL</Text>
            <Text style={[styles.statValue, isSmall && styles.statValueSmall, { color: "#059669" }]}>
              ₹ {Number(dashboardData?.profile.earnedBalance || 0).toLocaleString("en-IN")}
            </Text>
            <Text style={[styles.statSub, isSmall && styles.statSubSmall]}>Ready to cash out</Text>
          </View>

          {/* 2. IN PROGRESS */}
          <View style={[styles.statCard, isSmall && styles.statCardSmall, isDark && styles.sectionCardDark]}>
            <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
              <Clock size={16} color="#2563EB" strokeWidth={2.2} />
            </View>
            <Text style={[styles.statLabel, isSmall && styles.statLabelSmall]}>IN PROGRESS (RESERVED)</Text>
            <Text style={[styles.statValue, isSmall && styles.statValueSmall, { color: "#2563EB" }]}>
              ₹ {Number(dashboardData?.profile.reservedBalance || 0).toLocaleString("en-IN")}
            </Text>
            <Text style={[styles.statSub, isSmall && styles.statSubSmall]}>Locked in active request</Text>
          </View>

          {/* 3. PENDING COMMISSIONS */}
          <View style={[styles.statCard, isSmall && styles.statCardSmall, isDark && styles.sectionCardDark]}>
            <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
              <Calendar size={16} color="#D97706" strokeWidth={2.2} />
            </View>
            <Text style={[styles.statLabel, isSmall && styles.statLabelSmall]}>PENDING CONFIRMATION</Text>
            <Text style={[styles.statValue, isSmall && styles.statValueSmall, { color: "#D97706" }]}>
              ₹ {Number(dashboardData?.profile.pendingEarnings || 0).toLocaleString("en-IN")}
            </Text>
            <Text style={[styles.statSub, isSmall && styles.statSubSmall]}>Awaiting vendor confirmation</Text>
          </View>

          {/* 4. TOTAL DISBURSED */}
          <View style={[styles.statCard, isSmall && styles.statCardSmall, isDark && styles.sectionCardDark]}>
            <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
              <CreditCard size={16} color="#7C3AED" strokeWidth={2.2} />
            </View>
            <Text style={[styles.statLabel, isSmall && styles.statLabelSmall]}>TOTAL TRANSFERRED</Text>
            <Text style={[styles.statValue, isSmall && styles.statValueSmall, { color: "#7C3AED" }]}>
              ₹ {Number(dashboardData?.profile.totalPaidOut || 0).toLocaleString("en-IN")}
            </Text>
            <Text style={[styles.statSub, isSmall && styles.statSubSmall]}>Successfully paid out</Text>
          </View>
        </View>

        <Pressable
          onPress={() => setTab("share")}
          style={[styles.incentiveBanner, isSmall && styles.incentiveBannerSmall, isDark && styles.sectionCardDark]}
        >
          <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
            <TrendingUp size={16} color="#E91E63" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.incentiveTitle, isSmall && styles.incentiveTitleSmall, isDark && styles.textDark]}>
              Keep Sharing & Earning!
            </Text>
            <Text style={[styles.incentiveSub, isSmall && styles.incentiveSubSmall]}>
              Invite more friends and get rewarded with every successful wedding booking.
            </Text>
          </View>
          <View style={[styles.incentiveArrowBtn, isSmall && styles.incentiveArrowBtnSmall]}>
            <ArrowRight size={14} color="#FFFFFF" />
          </View>
        </Pressable>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: SHARE TAB CARD
  // =========================================================================
  const renderShareCard = () => {
    return (
      <View style={[styles.sectionCard, isSmall && styles.sectionCardSmall, isDark && styles.sectionCardDark]}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.iconCircle, isSmall && styles.iconCircleSmall]}>
            <Share2 size={16} color="#E91E63" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, isSmall && styles.sectionTitleSmall, isDark && styles.textDark]}>
              Share & Earn Rewards
            </Text>
            <Text style={[styles.sectionSub, isSmall && styles.sectionSubSmall]}>
              Friends get priority booking and you earn fixed cash rewards
            </Text>
          </View>
        </View>

        {/* 1. Referral Link Box */}
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Link2 size={14} color="#E91E63" />
            <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
              Your Unique Referral Link
            </Text>
          </View>
          <Text style={[styles.sectionSub, { marginTop: 0 }]}>
            Couples booking via this link get verified protection and your code is applied automatically.
          </Text>
          <View style={[styles.copyBox, isSmall && styles.copyBoxSmall]}>
            <View style={[styles.copyBoxLeft, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.codeIconSymbol}>🔗</Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[styles.linkUrlText, isSmall && styles.linkUrlTextSmall]}
              >
                {referralLink}
              </Text>
            </View>
            <Pressable
              onPress={() => handleCopy(referralLink, "Referral Link")}
              style={styles.copyPillBtn}
            >
              <Copy size={13} color="#E91E63" />
              <Text style={styles.copyPillBtnText}>Copy Link</Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Referral Code Box */}
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
            Your Referral Code
          </Text>
          <Text style={[styles.sectionSub, { marginTop: 0 }]}>
            Couples can also enter this code manually during booking checkout.
          </Text>
          <View style={[styles.copyBox, isSmall && styles.copyBoxSmall]}>
            <View style={styles.copyBoxLeft}>
              <Text style={styles.codeIconSymbol}>🎟</Text>
              <Text style={[styles.codeLargeText, isSmall && styles.codeLargeTextSmall]}>
                {referralCode}
              </Text>
            </View>
            <Pressable
              onPress={() => handleCopy(referralCode, "Referral Code")}
              style={styles.copyPillBtn}
            >
              <Copy size={13} color="#E91E63" />
              <Text style={styles.copyPillBtnText}>Copy Code</Text>
            </Pressable>
          </View>
        </View>

        {/* Share on WhatsApp CTA */}
        <Pressable
          onPress={handleWhatsAppShare}
          style={styles.whatsAppPillBtn}
        >
          <Share2 size={16} color="#FFFFFF" />
          <Text style={styles.whatsAppPillBtnText}>Share Link & Code on WhatsApp</Text>
        </Pressable>

        {/* QR Code Container */}
        <View style={styles.qrCardContainer}>
          <Image source={{ uri: qrUri }} style={[styles.qrImage, isSmall && styles.qrImageSmall]} />
          <Pressable onPress={handleDownloadQr} style={styles.qrDownloadBtn}>
            <Text style={styles.qrDownloadBtnText}>Open QR Code</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: isDesktop ? 20 : Math.max(16, insets.top + 8),
            paddingBottom: isDesktop
              ? 40
              : Platform.OS === "web"
              ? 16
              : Math.max(20, insets.bottom + 16),
          },
        ]}
        stickyHeaderIndices={!isDesktop ? [1] : undefined}
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          /* Desktop Layout */
          <View style={[styles.contentWrapper, styles.contentWrapperDesktop]}>
            {/* Desktop Header */}
            <View style={styles.desktopHeader}>
              <View style={styles.desktopHeaderLeft}>
                <View style={styles.headerIconBadge}>
                  <Wallet size={20} color="#E91E63" strokeWidth={2.4} />
                </View>
                <View>
                  <Text style={[styles.headerTitle, isDark && styles.textDark]}>
                    Referral <Text style={styles.primaryHighlight}>Wallet</Text>
                  </Text>
                  <Text style={[styles.headerSubtitle, isDark && styles.subtitleDark]}>
                    Track commissions, manage withdrawals, and share your unique referral code
                  </Text>
                </View>
              </View>

              {/* Decorative Tagline */}
              <Text style={styles.scriptTagline}>
                Refer · Earn · Grow Together 💖
              </Text>
            </View>

            {/* Toast Notification */}
            {notice ? (
              <View style={styles.toastCard}>
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.toastText}>{notice}</Text>
              </View>
            ) : null}

            <View style={styles.mainLayoutDesktop}>
              {/* Left Column (Desktop) */}
              <View style={styles.leftColumnDesktop}>
                {renderHeroCard()}
                {renderTabsBar()}
                {tab === "payouts" ? (
                  renderRequestWithdrawalCard()
                ) : tab === "history" ? (
                  renderHistoryCard()
                ) : tab === "stats" ? (
                  renderStatsCard()
                ) : tab === "share" ? (
                  renderShareCard()
                ) : null}
              </View>

              {/* Right Column (Desktop Only) */}
              <View style={styles.rightColumnDesktop}>
                {renderVerifiedDestinationCard()}
                {renderPromoCard()}
                {renderHowWithdrawalsWorkCard()}
              </View>
            </View>
          </View>
        ) : (
          /* Mobile Layout with Sticky Highlighted Segmented Toggle */
          <>
            {/* Child 0: Mobile Header + Notice + Hero Card */}
            <View style={[styles.contentWrapper, isSmall && styles.contentWrapperSmall]}>
              <View style={[styles.topBar, isSmall && styles.topBarSmall]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={() => {
                    if (router.canGoBack()) router.back();
                    else router.push("/(tabs)");
                  }}
                  style={[styles.backButton, isSmall && styles.backButtonSmall, isDark && styles.backButtonDark]}
                >
                  <ArrowLeft size={isSmall ? 16 : 18} color={isDark ? "#FCE7F3" : "#E91E63"} />
                </Pressable>

                <View style={styles.titleBlock}>
                  <Text style={[styles.headerTitle, isSmall && styles.headerTitleSmall, isDark && styles.textDark]}>
                    Referral <Text style={styles.primaryHighlight}>Wallet</Text>
                  </Text>
                  <Text style={[styles.headerSubtitle, isSmall && styles.headerSubtitleSmall, isDark && styles.subtitleDark]}>
                    Track commissions and manage manual withdrawals
                  </Text>
                </View>

                <View style={styles.headerGiftBadge}>
                  <Gift size={isSmall ? 16 : 18} color="#E91E63" strokeWidth={2.2} />
                </View>
              </View>

              {/* Toast Notification */}
              {notice ? (
                <View style={styles.toastCard}>
                  <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.toastText}>{notice}</Text>
                </View>
              ) : null}

              {renderHeroCard()}
            </View>

            {/* Child 1: Sticky Tabs Bar Container (Becomes static at top when scrolled) */}
            <View
              style={[
                styles.stickyTabsWrapper,
                isDark && styles.stickyTabsWrapperDark,
                Platform.select({
                  web: {
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                  } as any,
                }),
              ]}
            >
              <View style={[styles.contentWrapper, isSmall && styles.contentWrapperSmall]}>
                {renderTabsBar()}
              </View>
            </View>

            {/* Child 2: Tab Content (Scrolls underneath sticky bar) */}
            <View style={[styles.contentWrapper, isSmall && styles.contentWrapperSmall, { marginTop: 10 }]}>
              <View style={styles.leftColumn}>
                {tab === "payouts" ? (
                  <>
                    {renderVerifiedDestinationCard()}
                    {renderRequestWithdrawalCard()}
                    {renderPromoCard()}
                    {renderHowWithdrawalsWorkCard()}
                  </>
                ) : tab === "history" ? (
                  renderHistoryCard()
                ) : tab === "stats" ? (
                  renderStatsCard()
                ) : tab === "share" ? (
                  renderShareCard()
                ) : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFF5F8",
  },
  rootDark: {
    backgroundColor: "#111827",
  },
  scrollContainer: {
    paddingHorizontal: 16,
  },
  contentWrapper: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  contentWrapperSmall: {
    paddingHorizontal: 0,
  },
  contentWrapperDesktop: {
    maxWidth: 1200,
    paddingHorizontal: 12,
  },
  // Desktop Header
  desktopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  desktopHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FCE7F3",
    alignItems: "center",
    justifyContent: "center",
  },
  scriptTagline: {
    fontSize: 17,
    color: "#E91E63",
    fontWeight: "700",
    fontStyle: "italic",
    letterSpacing: 0.3,
  },
  // Mobile Top Bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  topBarSmall: {
    marginBottom: 12,
    gap: 8,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  backButtonSmall: {
    width: 44,
    height: 44,
  },
  backButtonDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  titleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#111827",
  },
  headerTitleSmall: {
    fontSize: 18,
  },
  primaryHighlight: {
    color: "#E91E63",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 3,
    lineHeight: 18,
  },
  headerSubtitleSmall: {
    fontSize: 11,
  },
  headerGiftBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  subtitleDark: {
    color: "#9CA3AF",
  },
  textDark: {
    color: "#F9FAFB",
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  toastText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },
  // Main Layout Grid
  mainLayout: {
    flexDirection: "column",
    gap: 16,
  },
  mainLayoutDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
  },
  leftColumn: {
    flex: 1,
    gap: 16,
  },
  leftColumnDesktop: {
    flex: 1.35,
    minWidth: 0,
    gap: 16,
  },
  rightColumnDesktop: {
    width: 400,
    gap: 16,
  },
  // Hero Card with ImageBackground & Frosted Glass Panel
  heroCardShadowWrap: {
    borderRadius: 24,
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  heroCard: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#FCE7F3",
  },
  heroBgImage: {
    borderRadius: 24,
    opacity: 0.95,
  },
  heroCardOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    padding: 16,
    borderRadius: 24,
  },
  heroCardOverlaySmall: {
    padding: 12,
  },
  heroTopContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLeftCol: {
    flex: 1,
    minWidth: 0,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarCircleSmall: {
    width: 32,
    height: 32,
  },
  userMeta: {
    flex: 1,
    justifyContent: "center",
  },
  welcomeText: {
    fontSize: 10,
    color: "#6B7280",
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.6,
    lineHeight: 13,
    marginBottom: 2,
  },
  welcomeTextSmall: {
    fontSize: 9,
    lineHeight: 12,
  },
  userName: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#111827",
    lineHeight: 19,
  },
  userNameSmall: {
    fontSize: 14,
    lineHeight: 17,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(253, 242, 248, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    gap: 4,
  },
  crownIcon: {
    fontSize: 11,
    color: "#E91E63",
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#E91E63",
    letterSpacing: 0.5,
  },
  commissionText: {
    flexShrink: 1,
    fontSize: 11.5,
    color: "#059669",
    fontWeight: "700",
  },
  earningsBlock: {
    marginTop: 14,
  },
  earningsLabel: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },
  earningsLabelSmall: {
    fontSize: 11,
  },
  earningsAmount: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginTop: 2,
    letterSpacing: -0.5,
  },
  earningsAmountSmall: {
    fontSize: 24,
  },
  secondaryMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 10,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#F3E8EE",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  secondaryMetricsRowSmall: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  secMetricItem: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
    paddingHorizontal: 4,
  },
  secMetricHeader: {
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    marginBottom: 4,
  },
  secMetricLabel: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 12,
    color: "#4B5563",
    fontWeight: "600",
    textAlign: "center",
  },
  secMetricVal: {
    fontSize: 13.5,
    fontWeight: "800",
  },
  secMetricDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E5E7EB",
  },
  // Sticky Tabs Bar & Highlighted Segmented Toggle Bar
  stickyTabsWrapper: {
    backgroundColor: "#FFF5F8",
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 50,
  },
  stickyTabsWrapperDark: {},
  tabsTrackContainer: {
    width: "100%",
  },
  tabsBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 14,
    padding: 4,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  tabsBarSmall: {
    padding: 2,
    borderRadius: 14,
  },
  tabButton: {
    width: "100%",
    minWidth: 0,
    borderRadius: 10,
    overflow: "hidden",
  },
  tabButtonSmall: {
    borderRadius: 9,
  },
  tabSlot: {
    flex: 1,
    minWidth: 0,
  },
  tabButtonSurface: {
    minHeight: 44,
    width: "100%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  tabButtonSurfaceSmall: {
    minHeight: 42,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 9,
  },
  tabButtonSurfaceActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonPressed: {
    backgroundColor: "#FDF2F8",
  },
  tabText: {
    maxWidth: "100%",
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  tabTextSmall: {
    fontSize: 10.5,
    letterSpacing: -0.1,
  },
  tabTextActive: {
    color: "#C2185B",
    fontWeight: "800",
  },
  tabTextInactive: {
    color: "#4B5563",
    fontWeight: "700",
  },
  // Section Cards
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 16,
    gap: 14,
  },
  sectionCardSmall: {
    padding: 13,
  },
  sectionCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  // Request Withdrawal Card with Royal Pink Thin Border
  requestWithdrawalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#F472B6", // Royal Pink thin border
    padding: 16,
    gap: 14,
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  requestWithdrawalCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#BE185D",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  iconCircleSmall: {
    width: 30,
    height: 30,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  sectionTitleSmall: {
    fontSize: 14,
  },
  sectionSub: {
    fontSize: 11.5,
    color: "#6B7280",
    marginTop: 2,
  },
  sectionSubSmall: {
    fontSize: 11,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
  },
  statusBadgeApproved: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  statusBadgePending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  statusBadgeRejected: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  statusBadgeNotSubmitted: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  rejectedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  rejectedBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#DC2626",
  },
  rejectedBannerBody: {
    fontSize: 12,
    color: "#991B1B",
    marginTop: 2,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  pendingBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B45309",
  },
  pendingBannerBody: {
    fontSize: 11.5,
    color: "#92400E",
    marginTop: 2,
    lineHeight: 16,
  },
  // Verified Destination Card (Right Column / Compact)
  // Minimized Verified Destination Card (When Approved)
  minimizedVerifiedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 4,
  },
  minimizedVerifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  minimizedBadgeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  minimizedInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  minimizedTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#065F46",
  },
  minimizedEligiblePill: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  minimizedEligiblePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 0.4,
  },
  minimizedSubtitle: {
    fontSize: 11.5,
    color: "#4B5563",
    fontWeight: "500",
  },
  minimizedActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  minimizedEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FDF2F8",
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  minimizedEditBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#E91E63",
  },
  minimizedChevronBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#F9FAFB",
  },
  minimizedExpandedDetailsBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  // Full Verified Destination Card
  verifiedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    padding: 16,
    gap: 12,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  verifiedCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#065F46",
  },
  verifiedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  verifiedHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  verifiedBadgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#065F46",
  },
  eligiblePill: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  eligiblePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 0.5,
  },
  verifiedSubtitle: {
    fontSize: 11.5,
    color: "#6B7280",
    marginTop: 2,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FDF2F8",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E91E63",
  },
  verifiedDetailsBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  destDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  destDetailText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  // Destination Form Editor
  destForm: {
    gap: 10,
    marginTop: 4,
  },
  inputGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  inputField: {
    borderWidth: 1,
    borderColor: "#FCE7F3",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
    color: "#111827",
  },
  inputFieldDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
    color: "#F9FAFB",
  },
  qrUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FCE7F3",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  qrUploadBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E91E63",
  },
  ownershipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  ownershipBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
  },
  ownershipBoxChecked: {
    backgroundColor: "#E91E63",
  },
  ownershipText: {
    fontSize: 11.5,
    color: "#4B5563",
    flex: 1,
    lineHeight: 16,
  },
  primaryPillBtn: {
    backgroundColor: "#E91E63",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryPillBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cancelEditBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelEditBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  // Request Withdrawal Card
  minAmountTag: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#E91E63",
  },
  activeWithdrawalCard: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  activeWithdrawalTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1E40AF",
  },
  activeStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  activeStatusPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  activeWithdrawalAmount: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1E3A8A",
  },
  activeWithdrawalDest: {
    fontSize: 12,
    color: "#3B82F6",
  },
  activeWithdrawalDate: {
    fontSize: 11,
    color: "#60A5FA",
  },
  cancelWithdrawalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 6,
    gap: 6,
  },
  cancelWithdrawalBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  processingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  processingNoteText: {
    fontSize: 11,
    color: "#2563EB",
    flex: 1,
  },
  notApprovedBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    textAlign: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  notApprovedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  notApprovedBody: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 16,
  },
  payoutInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payoutInputRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payoutInputRowMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payoutInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  payoutInputWrapDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  rupeePrefix: {
    fontSize: 16,
    fontWeight: "800",
    color: "#6B7280",
    marginRight: 6,
  },
  payoutInputField: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
  },
  payoutSubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E91E63",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 6,
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  payoutSubmitBtnMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E91E63",
    borderRadius: 14,
    paddingVertical: 13,
    gap: 8,
    marginTop: 4,
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  payoutSubmitBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipDark: {
    backgroundColor: "#374151",
  },
  chipAll: {
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#4B5563",
  },
  destinationNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  destinationNoticeBoxDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  destinationNoticeText: {
    fontSize: 11.5,
    color: "#4B5563",
    lineHeight: 16,
    flex: 1,
  },
  destinationNoticeTextDark: {
    color: "#9CA3AF",
  },
  // RoyalLagn Referral Promo Card
  promoCard: {
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 16,
    overflow: "hidden",
  },
  promoCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  promoTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slabDivider: {
    height: 1,
    backgroundColor: "#FCE7F3",
    marginVertical: 14,
  },
  slabDividerDark: {
    backgroundColor: "#374151",
  },
  slabsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  slabAwardCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  slabsSectionTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#111827",
  },
  slabsSectionSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
  slabToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FDF2F8",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  slabToggleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#E91E63",
  },
  slabsTableContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  slabsTableContainerDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  slabTableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#FCE7F3",
  },
  slabTableHeaderRow: {
    backgroundColor: "#FDF2F8",
    paddingVertical: 7,
    borderBottomColor: "#FCE7F3",
  },
  slabTableHeaderRowDark: {
    backgroundColor: "#1F2937",
    borderBottomColor: "#374151",
  },
  slabHeaderColText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  slabTableRowEven: {
    backgroundColor: "#FFFDFC",
  },
  slabTableRowEvenDark: {
    backgroundColor: "#192231",
  },
  slabTableRowTopTier: {
    backgroundColor: "#FDF2F8",
  },
  slabTableRowTopTierDark: {
    backgroundColor: "#2A1B28",
  },
  slabRangeText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
  },
  slabRewardBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  slabRewardBadgeZero: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  slabRewardBadgeZeroDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  slabRewardBadgeTopTier: {
    backgroundColor: "#FDF2F8",
    borderColor: "#FCE7F3",
  },
  slabRewardText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#059669",
  },
  slabRewardTextZero: {
    color: "#9CA3AF",
  },
  slabRewardTextTopTier: {
    color: "#E91E63",
  },
  slabTableFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#FDF2F8",
    borderTopWidth: 1,
    borderTopColor: "#FCE7F3",
  },
  slabTableFooterRowDark: {
    backgroundColor: "#1F2937",
    borderTopColor: "#374151",
  },
  slabTableFooterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E91E63",
  },
  promoLeft: {
    flex: 1,
    gap: 10,
    paddingRight: 10,
  },
  promoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  promoGiftIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  promoTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  promoSubtitle: {
    fontSize: 11.5,
    color: "#6B7280",
    marginTop: 1,
  },
  promoCheckList: {
    gap: 6,
  },
  promoCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  promoCheckText: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },
  // 3D Promo Gift Art
  promoGiftContainer: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  promoGiftContainerSmall: {
    width: 75,
    height: 75,
  },
  promoCoin: {
    position: "absolute",
    top: 2,
    left: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F59E0B",
    borderWidth: 1.5,
    borderColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  promoCoinSmall: {
    top: 0,
    left: 6,
    width: 18,
    height: 18,
  },
  promoCoinText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  promoCoinTextSmall: {
    fontSize: 9,
  },
  promoGiftBox: {
    width: 56,
    height: 50,
    backgroundColor: "#E91E63",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FF80AB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    zIndex: 2,
  },
  promoGiftBoxSmall: {
    width: 46,
    height: 42,
    marginTop: 12,
  },
  promoGiftRibbonV: {
    position: "absolute",
    width: 8,
    height: "100%",
    backgroundColor: "#FCD34D",
  },
  promoGiftRibbonH: {
    position: "absolute",
    height: 8,
    width: "100%",
    backgroundColor: "#FCD34D",
  },
  promoGiftBowLeft: {
    position: "absolute",
    top: -7,
    left: 16,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: "#FCD34D",
    backgroundColor: "#F59E0B",
  },
  promoGiftBowRight: {
    position: "absolute",
    top: -7,
    right: 16,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: "#FCD34D",
    backgroundColor: "#F59E0B",
  },
  promoGiftBowCenter: {
    position: "absolute",
    top: -5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FCD34D",
  },
  promoGiftSparkle1: {
    position: "absolute",
    top: 0,
    right: 8,
    fontSize: 13,
    color: "#F59E0B",
    zIndex: 4,
  },
  promoGiftSparkle2: {
    position: "absolute",
    bottom: 4,
    left: 2,
    fontSize: 11,
    color: "#F59E0B",
    zIndex: 4,
  },
  promoGiftConfetti1: {
    position: "absolute",
    top: 12,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E91E63",
  },
  promoGiftConfetti2: {
    position: "absolute",
    bottom: 12,
    right: 4,
    width: 5,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#3B82F6",
    transform: [{ rotate: "30deg" }],
  },
  // How Withdrawals Work Card
  howStepsList: {
    gap: 10,
    marginTop: 4,
  },
  howStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  howStepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FCE7F3",
    alignItems: "center",
    justifyContent: "center",
  },
  howStepNumberText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#E91E63",
  },
  howStepText: {
    fontSize: 12.5,
    color: "#4B5563",
    flex: 1,
    lineHeight: 17,
  },
  // History & Payouts styles
  historyFilterChipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  historyFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "transparent",
  },
  historyFilterChipActive: {
    backgroundColor: "#FDF2F8",
    borderColor: "#E91E63",
  },
  historyFilterChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#6B7280",
  },
  historyFilterChipTextActive: {
    color: "#E91E63",
    fontWeight: "800",
  },
  historySectionHeading: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#374151",
    marginTop: 4,
    marginBottom: 2,
  },
  historyRowCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    gap: 4,
  },
  historyRowCardDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  historyMeta: {
    fontSize: 11.5,
    color: "#6B7280",
  },
  utrBadgeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
    gap: 6,
  },
  utrBadgeLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#065F46",
  },
  utrBadgeValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
  },
  historyRejection: {
    fontSize: 11,
    color: "#DC2626",
    marginTop: 2,
    fontWeight: "500",
  },
  emptyHistoryBox: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 6,
  },
  emptyHistoryBoxSmall: {
    paddingVertical: 16,
  },
  emptyHistoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  emptyHistorySub: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    maxWidth: 280,
  },
  historyShareCta: {
    marginTop: 8,
    backgroundColor: "#FDF2F8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  historyShareCtaText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#E91E63",
  },
  // Stats Grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statsGridSmall: {
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    gap: 4,
  },
  statCardSmall: {
    padding: 10,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 0.4,
  },
  statLabelSmall: {
    fontSize: 9,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  statValueSmall: {
    fontSize: 18,
  },
  statSub: {
    fontSize: 10.5,
    color: "#6B7280",
  },
  statSubSmall: {
    fontSize: 9.5,
  },
  incentiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    gap: 10,
    marginTop: 6,
  },
  incentiveBannerSmall: {
    padding: 10,
  },
  incentiveTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  incentiveTitleSmall: {
    fontSize: 12.5,
  },
  incentiveSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
  incentiveSubSmall: {
    fontSize: 10,
  },
  incentiveArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
  },
  incentiveArrowBtnSmall: {
    width: 28,
    height: 28,
  },
  // Share & Earn
  copyBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FDF2F8",
    borderWidth: 1.5,
    borderColor: "#FCE7F3",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  copyBoxSmall: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  copyBoxLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeIconSymbol: {
    fontSize: 16,
  },
  linkUrlText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E91E63",
  },
  linkUrlTextSmall: {
    fontSize: 11.5,
  },
  codeLargeText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#E91E63",
    letterSpacing: 1,
  },
  codeLargeTextSmall: {
    fontSize: 15,
  },
  copyPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    gap: 4,
  },
  copyPillBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#E91E63",
  },
  whatsAppPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25D366",
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  whatsAppPillBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  qrCardContainer: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  qrImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
  },
  qrImageSmall: {
    width: 140,
    height: 140,
  },
  qrDownloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  qrDownloadBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  btnPressed: {
    opacity: 0.8,
  },
  // Wallet 3D Art
  walletArt: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  walletArtSmall: {
    width: 60,
    height: 60,
  },
  coin: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F59E0B",
    borderWidth: 1.5,
    borderColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
  },
  coin1: {
    top: 6,
    left: 10,
  },
  coin1Small: {
    top: 2,
    left: 6,
    width: 16,
    height: 16,
  },
  coin2: {
    top: 8,
    right: 10,
  },
  coin2Small: {
    top: 4,
    right: 6,
    width: 16,
    height: 16,
  },
  coinSymbol: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  coinSymbolSmall: {
    fontSize: 8.5,
  },
  walletBody: {
    width: 64,
    height: 48,
    backgroundColor: "#E91E63",
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: "#FF80AB",
    alignItems: "center",
  },
  walletBodySmall: {
    width: 52,
    height: 38,
    marginTop: 10,
  },
  walletCardSlot: {
    width: 44,
    height: 8,
    backgroundColor: "#BE185D",
    borderRadius: 4,
    marginTop: 4,
  },
  walletFlap: {
    position: "absolute",
    right: -4,
    top: 14,
    width: 18,
    height: 16,
    backgroundColor: "#BE185D",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  walletFlapSmall: {
    top: 10,
    width: 14,
    height: 12,
  },
  walletButton: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FCD34D",
  },
  walletSparkle1: {
    position: "absolute",
    top: 0,
    right: 4,
    fontSize: 12,
    color: "#F59E0B",
  },
  walletSparkle2: {
    position: "absolute",
    bottom: 2,
    left: 4,
    fontSize: 10,
    color: "#F59E0B",
  },
});
