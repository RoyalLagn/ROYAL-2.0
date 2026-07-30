import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  Images,
  MessageSquareText,
  Plus,
  Sparkles,
  Star,
  Target,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";

const completionMeta = {
  complete: { label: "Complete", icon: Check },
  partial: { label: "In progress", icon: Clock3 },
  missing: { label: "Add details", icon: Plus },
  attention: { label: "Needs attention", icon: CircleAlert },
};

export default function VendorDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, completion, refresh } = useVendorWorkspace();
  const desktop = width >= 900;
  const dark = colorScheme === "dark";
  const unread = data.notifications.filter((item) => !item.is_read).length;
  const openEnquiries = data.enquiries.filter((item) => !["closed", "booked"].includes(item.status)).length;
  const averageRating = data.reviews.length
    ? (data.reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / data.reviews.length).toFixed(1)
    : "—";
  const vendorName = data.vendor?.business_name || "Your vendor business";
  const completedItems = completion.items.filter((item) => item.state === "complete").length;
  const nextItem = completion.items.find((item) => item.state !== "complete");

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  const stats = [
    { label: "Profile views", value: String(data.vendor?.profile_views ?? 0), detail: "Customer reach", icon: Eye },
    { label: "Open enquiries", value: String(openEnquiries), detail: openEnquiries ? "Awaiting attention" : "All caught up", icon: MessageSquareText },
    { label: "Portfolio media", value: String(data.media.length), detail: "Published work", icon: Images },
    { label: "Average rating", value: averageRating, detail: `${data.reviews.length} ${data.reviews.length === 1 ? "review" : "reviews"}`, icon: Star },
  ];

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={unread} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.pink} />}
      >
        <VendorDashboardReveal>
          <LinearGradient
            colors={dark ? ["#2D2026", "#211D20"] : ["#FFEAF2", "#FFF8FB", "#FFFFFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { borderColor: colors.border, shadowColor: colors.shadow }]}
          >
            <View style={[styles.heroGlow, { backgroundColor: `${colors.pink}12` }]} />
            <View style={styles.heroContent}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: colors.pink }]}>BUSINESS OVERVIEW</Text>
                <Text style={[styles.greeting, { color: colors.text }]}>Good to see you.</Text>
                <Text style={[styles.businessName, { color: colors.muted }]} numberOfLines={2}>{vendorName}</Text>
              </View>
              {data.vendor?.is_verified ? (
                <View style={[styles.verified, { backgroundColor: dark ? "#19372B" : "#E7F7F0" }]}>
                  <Check size={14} color={colors.success} />
                  <Text style={[styles.verifiedText, { color: colors.success }]}>Verified</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.heroHint, { color: colors.muted }]}>
              Track your visibility and keep your public business profile ready for customers.
            </Text>
          </LinearGradient>

          {error ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CircleAlert size={18} color={colors.warning} />
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: colors.text }]}>Workspace unavailable</Text>
                <Text style={[styles.noticeText, { color: colors.muted }]}>{error}</Text>
              </View>
              <Pressable onPress={refresh}><Text style={{ color: colors.pink, fontWeight: "700" }}>Retry</Text></Pressable>
            </View>
          ) : null}
          {!loading && !data.vendor && !error ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Sparkles size={18} color={colors.pink} />
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: colors.text }]}>Vendor preview</Text>
                <Text style={[styles.noticeText, { color: colors.muted }]}>Create or connect a vendor profile to populate this workspace with live information.</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.statsGrid, desktop && styles.statsDesktop]}>
            {stats.map(({ label, value, detail, icon: Icon }, index) => (
              <VendorDashboardReveal
                key={label}
                delay={60 + index * 35}
                style={[
                  styles.statCard,
                  desktop && styles.statDesktop,
                  { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
                ]}
              >
                <View style={styles.statTop}>
                  <View style={[styles.statIcon, { backgroundColor: colors.surfaceSoft }]}>
                    <Icon size={18} color={colors.pink} />
                  </View>
                </View>
                <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.statDetail, { color: colors.muted }]}>{detail}</Text>
              </VendorDashboardReveal>
            ))}
          </View>

          <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <View style={styles.profileHeader}>
              <View style={[styles.profileIcon, { backgroundColor: colors.pink }]}>
                <Target size={23} color="#FFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile readiness</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
                  A stronger profile helps customers trust and discover your business.
                </Text>
              </View>
              <View style={[styles.percentBadge, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
                <Text style={[styles.percent, { color: colors.pink }]}>{completion.percent}%</Text>
                <Text style={[styles.percentLabel, { color: colors.muted }]}>READY</Text>
              </View>
            </View>

            <View style={styles.progressSummary}>
              <Text style={[styles.progressLabel, { color: colors.text }]}>Profile strength</Text>
              <Text style={[styles.progressCount, { color: colors.muted }]}>
                {completedItems} of {completion.items.length} sections complete
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSoft }]}>
              <LinearGradient
                colors={[colors.pink, dark ? "#FF78A5" : "#FF5D94"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${completion.percent}%` }]}
              />
            </View>

            {nextItem ? (
              <Pressable
                onPress={() => router.push(nextItem.route as any)}
                style={({ pressed }) => [
                  styles.nextStep,
                  { backgroundColor: colors.surfaceSoft, borderColor: `${colors.pink}38` },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.nextStepIcon, { backgroundColor: colors.pink }]}>
                  <Sparkles size={17} color="#FFF" />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.nextEyebrow, { color: colors.pink }]}>RECOMMENDED NEXT STEP</Text>
                  <Text style={[styles.nextTitle, { color: colors.text }]}>{nextItem.label}</Text>
                  <Text style={[styles.nextHint, { color: colors.muted }]}>Complete this section to improve your public profile.</Text>
                </View>
                <ChevronRight size={19} color={colors.pink} />
              </Pressable>
            ) : (
              <View style={[styles.completeBanner, { backgroundColor: dark ? "#19372B" : "#E7F7F0" }]}>
                <Check size={18} color={colors.success} />
                <Text style={[styles.completeBannerText, { color: colors.success }]}>Your business profile is fully ready.</Text>
              </View>
            )}

            <View style={styles.checklistHeader}>
              <Text style={[styles.checklistTitle, { color: colors.text }]}>Readiness checklist</Text>
              <Text style={[styles.checklistHint, { color: colors.muted }]}>Tap any section to review it</Text>
            </View>
            <View style={styles.checklistGrid}>
              {completion.items.map((item) => {
                const meta = completionMeta[item.state];
                const Icon = meta.icon;
                const tint = item.state === "complete" ? colors.success : item.state === "attention" ? colors.warning : colors.pink;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push(item.route as any)}
                    style={({ pressed }) => [
                      styles.completionItem,
                      desktop && styles.completionItemDesktop,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.stateIcon, { backgroundColor: `${tint}16` }]}>
                      <Icon size={16} color={tint} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.completionLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
                      <Text style={[styles.stateLabel, { color: tint }]}>{meta.label}</Text>
                    </View>
                    <ChevronRight size={15} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </VendorDashboardReveal>
      </ScrollView>
      {loading && !data.vendor ? (
        <View style={styles.loading}><ActivityIndicator color={colors.pink} /></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28, width: "100%", alignSelf: "center" },
  desktopScroll: { maxWidth: 1120, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  heroCard: { position: "relative", overflow: "hidden", borderWidth: 1, borderRadius: 26, padding: 20, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 },
  heroGlow: { position: "absolute", width: 180, height: 180, borderRadius: 90, right: -62, top: -92 },
  heroContent: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.7, marginBottom: 7 },
  greeting: { fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.9 },
  businessName: { fontSize: 14, lineHeight: 20, marginTop: 3, fontWeight: "600" },
  heroHint: { fontSize: 11, lineHeight: 17, marginTop: 15, maxWidth: 560 },
  verified: { flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  verifiedText: { fontSize: 10, fontWeight: "800" },
  notice: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  noticeTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  noticeText: { fontSize: 11, lineHeight: 17 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statsDesktop: { flexWrap: "nowrap" },
  statCard: { width: "48.4%", minHeight: 145, borderRadius: 22, borderWidth: 1, padding: 15, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.045, shadowRadius: 16, elevation: 2 },
  statDesktop: { flex: 1, width: "auto" },
  statTop: { flexDirection: "row", alignItems: "center", marginBottom: 11 },
  statIcon: { width: 37, height: 37, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.6 },
  statLabel: { fontSize: 11, fontWeight: "800", marginTop: 2 },
  statDetail: { fontSize: 9, marginTop: 4 },
  profileCard: { borderWidth: 1, borderRadius: 26, padding: 18, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: "900", letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  percentBadge: { width: 65, height: 58, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  percent: { fontSize: 20, lineHeight: 24, fontWeight: "900" },
  percentLabel: { fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  progressSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 21 },
  progressLabel: { fontSize: 11, fontWeight: "800" },
  progressCount: { fontSize: 9 },
  progressTrack: { height: 9, borderRadius: 7, overflow: "hidden", marginTop: 9 },
  progressFill: { height: "100%", borderRadius: 7 },
  nextStep: { minHeight: 82, borderWidth: 1, borderRadius: 19, padding: 13, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  nextStepIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  nextEyebrow: { fontSize: 7, fontWeight: "900", letterSpacing: 1.2 },
  nextTitle: { fontSize: 12, fontWeight: "900", marginTop: 3 },
  nextHint: { fontSize: 9, lineHeight: 13, marginTop: 2 },
  completeBanner: { minHeight: 58, borderRadius: 17, paddingHorizontal: 14, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 9 },
  completeBannerText: { flex: 1, fontSize: 11, fontWeight: "800" },
  checklistHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 21, marginBottom: 10 },
  checklistTitle: { fontSize: 12, fontWeight: "900" },
  checklistHint: { fontSize: 8 },
  checklistGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  completionItem: { width: "100%", minHeight: 61, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  completionItemDesktop: { width: "49.4%" },
  stateIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  completionLabel: { fontSize: 11, fontWeight: "800" },
  stateLabel: { fontSize: 8, fontWeight: "800", marginTop: 3 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  loading: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center", pointerEvents: "none" },
});
