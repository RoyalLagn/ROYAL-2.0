import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ShieldAlert } from "lucide-react-native";
import { VendorBookingService, type VendorBooking } from "@/services/vendorBookings";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { getMyFeaturedPlacements, type FeaturedPlacement } from "@/services/featuredVendorPlacements";
import { useVendorNotifications } from "@/context/VendorNotificationContext";
import PageLoader from "@/components/loading/PageLoader";
import Pressable from "@/components/InteropSafePressable";

// CRM Components
import VendorCrmHeroCard from "@/components/vendor/crm/VendorCrmHeroCard";
import VendorCrmPlanCard from "@/components/vendor/crm/VendorCrmPlanCard";
import VendorCrmMetricsGrid from "@/components/vendor/crm/VendorCrmMetricsGrid";
import VendorCrmBookingsChart from "@/components/vendor/crm/VendorCrmBookingsChart";
import VendorCrmStatusDonut from "@/components/vendor/crm/VendorCrmStatusDonut";
import VendorCrmPublicProfile from "@/components/vendor/crm/VendorCrmPublicProfile";
import VendorCrmQuickActions from "@/components/vendor/crm/VendorCrmQuickActions";

const DAY_MS = 86_400_000;

export default function VendorDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 900;

  const { data, loading, error, refresh } = useVendorWorkspace();
  const { notifications, markAsRead } = useVendorNotifications();

  // Live Bookings & Placements
  const [vendorBookings, setVendorBookings] = useState<VendorBooking[]>([]);
  const [featuredPlacements, setFeaturedPlacements] = useState<FeaturedPlacement[]>([]);

  useEffect(() => {
    if (!data.vendor?.id) return;
    const vendorId = data.vendor.id;
    const fetchBookings = () => {
      VendorBookingService.getVendorBookings(vendorId)
        .then(setVendorBookings)
        .catch(() => setVendorBookings([]));
    };

    fetchBookings();
    const unsubscribe = VendorBookingService.subscribeToBookings(fetchBookings, { vendorId });
    return unsubscribe;
  }, [data.vendor?.id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void getMyFeaturedPlacements()
        .then(setFeaturedPlacements)
        .catch(() => setFeaturedPlacements([]));
    }, [refresh])
  );

  const activeFeaturedPlacement = useMemo(
    () =>
      featuredPlacements.find(
        (placement) =>
          placement.status === "active" && new Date(placement.ends_at ?? 0).getTime() > Date.now()
      ),
    [featuredPlacements]
  );

  const featuredDaysRemaining = activeFeaturedPlacement?.ends_at
    ? Math.max(
        0,
        Math.min(
          30,
          Math.ceil((new Date(activeFeaturedPlacement.ends_at).getTime() - Date.now()) / DAY_MS)
        )
      )
    : null;

  const vendorName = data.vendor?.business_name || "Tejas Photography";
  const vendorAvatarUrl = data.vendor?.logo_url || data.vendor?.cover_image_url || null;
  const isVerified = Boolean(data.vendor?.is_verified ?? true);
  const pincode = data.vendor?.pincode || "410501";
  const featuredPincode = activeFeaturedPlacement?.pincode || null;
  const slug = data.vendor?.slug || "tejas-photography-pune";

  // Plan info
  const tier = data.vendor?.tier;
  const planName = tier === "premium" ? "Premium" : tier === "elite" ? "Elite" : "Free";
  const accessStatus = featuredDaysRemaining
    ? `${featuredDaysRemaining} days remaining`
    : "Access: Ongoing";

  // Computed Booking & Financial Metrics
  const pendingBookingsCount = useMemo(
    () =>
      vendorBookings.filter(
        (b) =>
          b.booking_status === "pending_vendor_confirmation" ||
          b.booking_status === "pending"
      ).length,
    [vendorBookings]
  );
  const confirmedBookingsCount = useMemo(
    () => vendorBookings.filter((b) => b.booking_status === "confirmed").length,
    [vendorBookings]
  );
  const cancelledBookingsCount = useMemo(
    () =>
      vendorBookings.filter(
        (b) =>
          b.booking_status === "cancelled_by_vendor" ||
          b.booking_status === "cancelled" ||
          b.booking_status === "cancelled_by_customer"
      ).length,
    [vendorBookings]
  );
  const recentBookingsCount = useMemo(
    () =>
      vendorBookings.filter((b) => {
        const createdTime = new Date(b.created_at || Date.now()).getTime();
        return Date.now() - createdTime <= 30 * DAY_MS;
      }).length,
    [vendorBookings]
  );
  const totalBookingsCount = vendorBookings.length;

  const calculatedEarnings = useMemo(() => {
    return vendorBookings
      .filter((b) => b.booking_status === "confirmed" || b.payment_status === "paid_advance")
      .reduce((sum, b) => sum + (Number(b.advance_amount) || Number(b.total_amount) || 0), 0);
  }, [vendorBookings]);

  // Real-time booking & financial metrics directly from live Supabase data
  const pendingBookings = pendingBookingsCount;
  const confirmedBookings = confirmedBookingsCount;
  const cancelledBookings = cancelledBookingsCount;
  const recentBookings = recentBookingsCount;
  const totalBookings = totalBookingsCount;
  const totalEarnings = calculatedEarnings;

  // Real-time booking status breakdown for Status Donut
  const statusSegments = useMemo(() => {
    const confirmed = confirmedBookingsCount;
    const pending = pendingBookingsCount;
    const completed = vendorBookings.filter((b) => b.booking_status === "completed").length;
    const cancelled = cancelledBookingsCount;
    const total = totalBookingsCount;

    return [
      {
        label: "Confirmed",
        count: confirmed,
        percentage: total > 0 ? Math.round((confirmed / total) * 100) : 0,
        color: "#E91E63",
      },
      {
        label: "Pending",
        count: pending,
        percentage: total > 0 ? Math.round((pending / total) * 100) : 0,
        color: "#FBCFE8",
      },
      {
        label: "Completed",
        count: completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        color: "#10B981",
      },
      {
        label: "Cancelled",
        count: cancelled,
        percentage: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        color: "#9CA3AF",
      },
    ];
  }, [
    confirmedBookingsCount,
    pendingBookingsCount,
    cancelledBookingsCount,
    totalBookingsCount,
    vendorBookings,
  ]);

  // Subscription Expiry Warning Modal
  const expiryWarning =
    notifications.find((item) => item.kind === "elite_expiry_warning" && !item.is_read) ?? null;
  const warningDays =
    typeof expiryWarning?.metadata.days_remaining === "number"
      ? expiryWarning.metadata.days_remaining
      : 5;

  const closeExpiryWarning = () => {
    if (expiryWarning) void markAsRead(expiryWarning.id);
  };

  const renewElite = () => {
    closeExpiryWarning();
    router.push({ pathname: "/VendorSubscription", params: { plan: "premium", source: "expiry-warning" } });
  };

  if (loading && !data.vendor) {
    return <PageLoader />;
  }

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      {/* Subscription Expiry Warning Modal */}
      <Modal
        visible={Boolean(expiryWarning)}
        transparent
        animationType="fade"
        onRequestClose={closeExpiryWarning}
        accessibilityViewIsModal
      >
        <View style={styles.warningBackdrop}>
          <View style={[styles.warningDialog, isDark && styles.dialogDark]}>
            <View style={styles.warningIcon}>
              <ShieldAlert size={28} color="#D97706" />
            </View>
            <Text style={[styles.warningTitle, isDark && styles.textDark]}>
              Your {planName} plan ends in {warningDays} {warningDays === 1 ? "day" : "days"}
            </Text>
            <Text style={styles.warningBody}>
              Renew before it ends to retain your verified listing priority ranking and unlimited portfolio images.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={renewElite}
              style={styles.warningPrimaryBtn}
            >
              <Text style={styles.warningPrimaryText}>Continue Plan</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={closeExpiryWarning}
              style={styles.warningSecondaryBtn}
            >
              <Text style={[styles.warningSecondaryText, isDark && styles.textDark]}>
                I understand
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Main Dashboard Content Area */}
      <View style={styles.mainColumn}>
        {/* Scrollable Dashboard Grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && styles.scrollContentDesktop,
          ]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#E91E63" />
          }
        >
          {/* Row 1: Hero Greeting Banner + Plan Card */}
          <View style={[styles.row, isDesktop ? styles.rowHeroDesktop : styles.rowStacked]}>
            <View style={[styles.col, isDesktop && { flex: 1.85 }]}>
              <VendorCrmHeroCard
                vendorName={vendorName}
                isVerified={isVerified}
                pincode={pincode}
                featuredPincode={featuredPincode}
                averageRating={data.stats?.averageRating}
                reviewCount={data.stats?.reviewCount}
                onPressReviews={() => router.push("/VendorReviews" as any)}
              />
            </View>

            <View style={[styles.col, isDesktop && { flex: 1 }]}>
              <VendorCrmPlanCard
                planName={planName}
                accessStatus={accessStatus}
              />
            </View>
          </View>

          {/* Row 2: 6 Key Metric Stat Cards */}
          <VendorCrmMetricsGrid
            pendingBookings={pendingBookings}
            confirmedBookings={confirmedBookings}
            cancelledBookings={cancelledBookings}
            recentBookings={recentBookings}
            totalBookings={totalBookings}
            totalEarnings={totalEarnings}
          />

          {isDesktop ? (
            <>
              {/* Row 3 Desktop: Bookings Overview Chart + Donut Status Chart */}
              <View style={[styles.row, styles.row3ColDesktop]}>
                <View style={[styles.col, { flex: 1.35 }]}>
                  <VendorCrmBookingsChart bookings={vendorBookings} />
                </View>

                <View style={[styles.col, { flex: 1 }]}>
                  <VendorCrmStatusDonut
                    totalCount={totalBookings}
                    segments={statusSegments}
                  />
                </View>
              </View>

              {/* Row 4 Desktop: Public Profile Card + Quick Actions */}
              <View style={[styles.row, styles.row3ColDesktop]}>
                <View style={[styles.col, { flex: 1.1 }]}>
                  <VendorCrmPublicProfile
                    slug={slug}
                    businessName={vendorName}
                  />
                </View>

                <View style={[styles.col, { flex: 1 }]}>
                  <VendorCrmQuickActions />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Mobile Stack: Charts, Public Profile, Quick Actions */}
              <VendorCrmBookingsChart bookings={vendorBookings} />
              <VendorCrmStatusDonut
                totalCount={totalBookings}
                segments={statusSegments}
              />
              <VendorCrmPublicProfile slug={slug} businessName={vendorName} />
              <VendorCrmQuickActions />
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "#FFF5F8",
    overflow: "hidden",
  },
  rootDark: {
    backgroundColor: "#111827",
  },
  crmContainer: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
    width: "100%",
  },
  mainColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "#FFF8FA",
    overflow: "hidden",
  },
  scrollContent: {
    padding: 14,
    gap: 14,
    paddingBottom: 40,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as any,
  },
  scrollContentDesktop: {
    padding: 24,
    gap: 20,
    maxWidth: 1400,
    alignSelf: "center",
    width: "100%",
  },
  row: {
    width: "100%",
    maxWidth: "100%",
  },
  rowStacked: {
    flexDirection: "column",
    gap: 14,
  },
  rowHeroDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 20,
  },
  row3ColDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 20,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  textDark: {
    color: "#F9FAFB",
  },
  // Mobile Drawer Backdrop
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flexDirection: "row",
  },
  drawerBackdropClick: {
    flex: 1,
  },
  drawerSheet: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    maxWidth: "85%",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  // Expiry Dialog
  warningBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  warningDialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    textAlign: "center",
  },
  dialogDark: {
    backgroundColor: "#1F2937",
  },
  warningIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  warningBody: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
  },
  warningPrimaryBtn: {
    width: "100%",
    backgroundColor: "#E91E63",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  warningPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  warningSecondaryBtn: {
    width: "100%",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  warningSecondaryText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
});
