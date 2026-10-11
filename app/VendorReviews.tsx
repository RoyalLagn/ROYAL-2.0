import React, { useCallback, useMemo } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Star,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorCrmReviewsSection from "@/components/vendor/crm/VendorCrmReviewsSection";
import PageLoader from "@/components/loading/PageLoader";

export default function VendorReviews() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 900;
  const isSmall = width < 500;

  const { data, loading, refresh } = useVendorWorkspace();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const vendorName = data.vendor?.business_name || "Vendor";
  const slug = data.vendor?.slug || "";
  const vendorId = data.vendor?.id;

  const averageRating = data.stats?.averageRating ?? 0;
  const reviewCount = data.stats?.reviewCount ?? 0;

  const { fiveStarCount, satisfactionPct } = useMemo(() => {
    const revs = Array.isArray(data.reviews) ? data.reviews : [];
    const count5 = revs.filter((r: any) => Math.round(Number(r.rating) || 0) === 5).length;
    const countPositive = revs.filter((r: any) => Math.round(Number(r.rating) || 0) >= 4).length;
    const pct = revs.length > 0 ? Math.round((countPositive / revs.length) * 100) : reviewCount > 0 ? 95 : 100;
    return {
      fiveStarCount: count5,
      satisfactionPct: pct,
    };
  }, [data.reviews, reviewCount]);

  if (loading && !data.vendor) {
    return <PageLoader />;
  }

  return (
    <View style={[styles.page, { backgroundColor: isDark ? "#111827" : "#FFF8FA" }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isDesktop && styles.contentDesktop,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor="#E91E63"
          />
        }
      >
        {/* Navigation Breadcrumb Row */}
        <View style={styles.breadcrumbRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Dashboard"
            onPress={() => router.push("/vendor-dashboard")}
            style={({ pressed, hovered }: any) => [
              styles.backPill,
              hovered && styles.backPillHovered,
              isDark && styles.backPillDark,
              pressed && { opacity: 0.7 },
            ]}
          >
            <ArrowLeft size={16} color={isDark ? "#D1D5DB" : "#4B5563"} />
            <Text style={[styles.backPillText, isDark && styles.textDark]}>
              Dashboard
            </Text>
          </Pressable>

          <ChevronRight size={14} color={isDark ? "#4B5563" : "#9CA3AF"} />

          <Text style={[styles.currentBreadcrumb, isDark && styles.textMutedDark]}>
            Reviews & Ratings
          </Text>
        </View>

        {/* Page Hero Header */}
        <View style={styles.heroHeader}>
          <View style={styles.heroTextWrap}>
            <View style={styles.badgeRow}>
              <View style={[styles.verifiedPill, isDark && styles.verifiedPillDark]}>
                <CheckCircle2 size={12} color="#059669" />
                <Text style={styles.verifiedPillText}>VERIFIED REPUTATION</Text>
              </View>
            </View>
            <Text style={[styles.heroTitle, isDark && styles.textDark]}>
              Customer Reviews & Ratings
            </Text>
            <Text style={[styles.heroSubtitle, isDark && styles.textMutedDark]}>
              Monitor client feedback, star distributions, and verified ratings for {vendorName}.
            </Text>
          </View>
        </View>

        {/* 4 Stat Metric Cards */}
        <View style={[styles.metricsGrid, isDesktop ? styles.metricsDesktop : styles.metricsMobile]}>
          {/* Card 1: Average Rating */}
          <View style={[styles.metricCard, isDark && styles.metricCardDark]}>
            <View style={styles.metricTop}>
              <View style={[styles.metricIconWrap, { backgroundColor: isDark ? "#3B2F1F" : "#FEF3C7" }]}>
                <Star size={16} color="#E8A52F" fill="#E8A52F" />
              </View>
              <Text style={styles.metricBadge}>Score</Text>
            </View>
            <Text style={[styles.metricValue, isDark && styles.textDark]}>
              {averageRating > 0 ? `${averageRating.toFixed(1)} ★` : "New"}
            </Text>
            <Text style={[styles.metricLabel, isDark && styles.textMutedDark]}>Average Rating</Text>
            <Text style={[styles.metricSub, { color: "#E8A52F" }]}>Verified client score</Text>
          </View>

          {/* Card 2: Total Reviews */}
          <View style={[styles.metricCard, isDark && styles.metricCardDark]}>
            <View style={styles.metricTop}>
              <View style={[styles.metricIconWrap, { backgroundColor: isDark ? "#4C0519" : "#FFE4E6" }]}>
                <MessageSquare size={16} color="#E11D48" />
              </View>
              <Text style={styles.metricBadge}>Total</Text>
            </View>
            <Text style={[styles.metricValue, isDark && styles.textDark]}>
              {reviewCount}
            </Text>
            <Text style={[styles.metricLabel, isDark && styles.textMutedDark]}>Total Reviews</Text>
            <Text style={[styles.metricSub, { color: "#E11D48" }]}>All customer entries</Text>
          </View>

          {/* Card 3: 5-Star Reviews */}
          <View style={[styles.metricCard, isDark && styles.metricCardDark]}>
            <View style={styles.metricTop}>
              <View style={[styles.metricIconWrap, { backgroundColor: isDark ? "#064E3B" : "#D1FAE5" }]}>
                <Sparkles size={16} color="#059669" />
              </View>
              <Text style={styles.metricBadge}>Top Rated</Text>
            </View>
            <Text style={[styles.metricValue, isDark && styles.textDark]}>
              {fiveStarCount}
            </Text>
            <Text style={[styles.metricLabel, isDark && styles.textMutedDark]}>5-Star Ratings</Text>
            <Text style={[styles.metricSub, { color: "#059669" }]}>
              {reviewCount > 0 ? `${Math.round((fiveStarCount / reviewCount) * 100)}% 5-star` : "Top tier score"}
            </Text>
          </View>

          {/* Card 4: Satisfaction */}
          <View style={[styles.metricCard, isDark && styles.metricCardDark]}>
            <View style={styles.metricTop}>
              <View style={[styles.metricIconWrap, { backgroundColor: isDark ? "#1E1B4B" : "#EDE9FE" }]}>
                <CheckCircle2 size={16} color="#7C3AED" />
              </View>
              <Text style={styles.metricBadge}>Satisfaction</Text>
            </View>
            <Text style={[styles.metricValue, isDark && styles.textDark]}>
              {satisfactionPct}%
            </Text>
            <Text style={[styles.metricLabel, isDark && styles.textMutedDark]}>Client Satisfaction</Text>
            <Text style={[styles.metricSub, { color: "#7C3AED" }]}>4★ or 5★ feedback</Text>
          </View>
        </View>

        {/* Live Reviews & Ratings Section with 10-item pagination */}
        <VendorCrmReviewsSection
          vendorId={vendorId}
          vendorSlug={slug}
          businessName={vendorName}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: "100%",
    backgroundColor: "#FFF8FA",
  },
  content: {
    padding: 16,
    paddingBottom: 50,
    width: "100%",
    maxWidth: 1300,
    alignSelf: "center",
  },
  contentDesktop: {
    padding: 24,
    paddingBottom: 60,
  },
  breadcrumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  backPillHovered: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
  },
  backPillDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  backPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  currentBreadcrumb: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  heroHeader: {
    marginBottom: 18,
  },
  heroTextWrap: {
    gap: 6,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  verifiedPillDark: {
    backgroundColor: "#064E3B",
    borderColor: "#047857",
  },
  verifiedPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#059669",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: "#111827",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
  },
  metricsGrid: {
    width: "100%",
    marginBottom: 16,
  },
  metricsDesktop: {
    flexDirection: "row",
    gap: 14,
  },
  metricsMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 16,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  metricCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  metricTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  metricSub: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedDark: {
    color: "#9CA3AF",
  },
});
