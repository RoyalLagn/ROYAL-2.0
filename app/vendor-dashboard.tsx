import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View, } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  BadgeIndianRupee, BriefcaseBusiness, CalendarDays, Check, ChevronRight, CircleAlert,
  Clock3, Eye, FileText, Globe, Images, MapPin, MessageSquareText, Palette,
  Phone, Plus, Sparkles, Star, Tags, Target, } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace, VendorReadinessLabels, type CompletionState } from "@/hooks/useVendorWorkspace";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import SubscriptionDashboardCard from "@/components/vendor/SubscriptionDashboardCard";
import PublicProfileCard from "@/components/vendor/PublicProfileCard";
import ChecklistItem, { ReadinessChecklistGrid } from "@/components/vendor/ChecklistItem";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";
import PageLoader from "@/components/loading/PageLoader";

// Ordered worse -> better so a state "improving" can be detected with a
// simple index comparison when the vendor returns from a section form.
const STATE_RANK: Record<CompletionState, number> = { missing: 0, attention: 1, partial: 2, complete: 3 };
const HIGHLIGHT_DURATION_MS = 1600;

// Labels come from the centralized VendorReadinessLabels (see
// hooks/useVendorWorkspace.ts) so the checklist and every section form's
// own status badge always agree; only the icon choice is a local UI
// concern.
const completionMeta = {
  complete: { label: VendorReadinessLabels.complete, icon: Check },
  partial: { label: VendorReadinessLabels.partial, icon: Clock3 },
  missing: { label: VendorReadinessLabels.missing, icon: Plus },
  attention: { label: VendorReadinessLabels.attention, icon: CircleAlert },
};

// The leading icon describes the section itself. Completion belongs in the
// smaller status line, so vendors can identify a destination before reading
// its state instead of scanning a wall of identical checkmarks.
const checklistSectionIcons: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  business: BriefcaseBusiness,
  about: FileText,
  location: MapPin,
  contact: Phone,
  identity: Palette,
  services: Sparkles,
  pricing: BadgeIndianRupee,
  portfolio: Images,
  availability: CalendarDays,
  tags: Tags,
};

export default function VendorDashboard() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, completion, refresh } = useVendorWorkspace();
  const desktop = width >= 900;
  const dark = colorScheme === "dark";
  const canvas = dark ? colors.background : "#FFF9FB";
  const unread = data.stats.unreadNotifications;
  const openEnquiries = data.stats.openEnquiries;
  const averageRating = data.stats.reviewCount
    ? data.stats.averageRating.toFixed(1)
    : "—";
  const vendorName = data.vendor?.business_name || "Your vendor business";
  const completedItems = completion.items.filter((item) => item.state === "complete").length;
  const nextItem = completion.items.find((item) => item.state !== "complete");

  // Tracks each checklist item's state across visits so that returning from
  // a section form (e.g. VendorEditBusinessInfo -> back -> here) can
  // highlight just the row that actually changed, instead of re-animating
  // the whole list on every focus.
  const previousStatesRef = useRef<Map<string, CompletionState> | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Edit business profile" (Vendors_dash_profile.tsx) links here with
  // ?focus=checklist so the vendor lands directly on the readiness
  // checklist instead of the hero/business-overview at the top of this
  // long scroll. The cards above the checklist (subscription, public
  // profile, marketing button) only mount once data.vendor has loaded, so
  // the checklist's true position isn't known until then -- and RN Web's
  // onLayout is driven by a ResizeObserver on the element itself, which
  // does not re-fire when the element merely shifts down because a
  // sibling above it changed size. Using `.measure()` instead queries the
  // live position at call time, so it can't go stale the way a cached
  // onLayout value can.
  const scrollRef = useRef<ScrollView>(null);
  const checklistRef = useRef<View>(null);
  const pendingScrollToChecklist = useRef(false);

  useEffect(() => {
    if (focus === "checklist") pendingScrollToChecklist.current = true;
  }, [focus]);

  useEffect(() => {
    if (loading || !pendingScrollToChecklist.current) return;
    pendingScrollToChecklist.current = false;
    // The workspace fetch just resolved; give the newly-appeared cards one
    // render + layout pass to commit before measuring.
    const timer = setTimeout(() => {
      checklistRef.current?.measure((_x, y) => {
        scrollRef.current?.scrollTo({ y, animated: true });
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [loading]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  // Runs whenever the computed completion states change (including after
  // the refresh above). Compares against the previous snapshot so only the
  // section that actually improved gets a highlight -- not the whole list,
  // and not on the very first render (no previous snapshot to compare to).
  useEffect(() => {
    const previous = previousStatesRef.current;
    if (previous) {
      const improved = completion.items.find(
        (item) => STATE_RANK[item.state] > (STATE_RANK[previous.get(item.id) ?? "missing"] ?? 0),
      );
      if (improved) {
        setHighlightedId(improved.id);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
      }
    }
    previousStatesRef.current = new Map(completion.items.map((item) => [item.id, item.state]));
  }, [completion.items]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  const stats = [
    { label: "Profile views", value: String(data.vendor?.profile_views ?? 0), detail: "Customer reach", icon: Eye },
    { label: "Open enquiries", value: String(openEnquiries), detail: openEnquiries ? "Awaiting attention" : "All caught up", icon: MessageSquareText },
    { label: "Portfolio media", value: String(data.stats.portfolioMedia), detail: "Published work", icon: Images },
    { label: "Average rating", value: averageRating, detail: `${data.stats.reviewCount} ${data.stats.reviewCount === 1 ? "review" : "reviews"}`, icon: Star },
  ];

  if (loading && !data.vendor) return <PageLoader />;

  return (
    <View style={[styles.page, { backgroundColor: canvas }]}>
      <VendorHeader unread={unread} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.pink} />}
      >
        <VendorDashboardReveal>
          <LinearGradient
            colors={dark ? ["#2D2026", "#211D20"] : ["#FFEAF2", "#FFF8FB", "#FFFFFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, desktop && styles.heroCardDesktop, { borderColor: colors.border, shadowColor: colors.shadow }]}
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
              <Pressable
                onPress={refresh}
                accessibilityRole="button"
                accessibilityLabel="Retry loading vendor workspace"
                style={({ pressed, hovered, focused }) => [
                  styles.retryButton,
                  (hovered || focused) && styles.interactiveLift,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={{ color: colors.pink, fontWeight: "700" }}>Retry</Text>
              </Pressable>
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

          {data.vendor ? <SubscriptionDashboardCard /> : null}
          {data.vendor ? <PublicProfileCard vendor={data.vendor} /> : null}
          {data.vendor ? (
            <Pressable
              onPress={() => router.push("/vendor-marketing-center")}
              accessibilityRole="button"
              accessibilityLabel="Open Marketing Center"
              style={({ pressed, hovered, focused }) => [
                styles.marketingCenterButton,
                desktop && styles.marketingCenterButtonDesktop,
                { backgroundColor: colors.background, borderColor: colors.border },
                (hovered || focused) && styles.interactiveLift,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.marketingCenterIcon, { backgroundColor: colors.pink }]}>
                <Globe size={19} color="#FFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.marketingCenterTitle, { color: colors.text }]}>Open Marketing Center</Text>
                <Text style={[styles.marketingCenterHint, { color: colors.muted }]}>Share your website, QR, and track performance</Text>
              </View>
              <ChevronRight size={19} color={colors.pink} />
            </Pressable>
          ) : null}

          <View style={[styles.statsGrid, desktop && styles.statsDesktop, { backgroundColor: colors.border, borderColor: colors.border }]}>
            {stats.map(({ label, value, detail, icon: Icon }) => (
              <View
                key={label}
                style={[
                  styles.statCard,
                  desktop && styles.statDesktop,
                  { backgroundColor: colors.background },
                ]}
              >
                <View style={styles.statTop}>
                  <View style={[styles.statIcon, { backgroundColor: colors.surfaceSoft, borderColor: `${colors.pink}14` }]}>
                    <Icon size={19} color={colors.pink} />
                  </View>
                </View>
                <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.statDetail, { color: colors.muted }]}>{detail}</Text>
              </View>
            ))}
          </View>

          <View ref={checklistRef} style={[styles.profileCard, desktop && styles.profileCardDesktop, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
              <View style={[styles.percentBadge, { backgroundColor: colors.surfaceSoft }]}>
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
                accessibilityRole="button"
                accessibilityLabel={`Complete ${nextItem.label}`}
                style={({ pressed, hovered, focused }) => [
                  styles.nextStep,
                  { backgroundColor: colors.surfaceSoft, borderColor: `${colors.pink}28` },
                  (hovered || focused) && styles.interactiveLift,
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
            <ReadinessChecklistGrid>
              {(itemWidth) =>
                completion.items.map((item) => (
                  <ChecklistItem
                    key={item.id}
                    item={item}
                    meta={completionMeta[item.state]}
                    sectionIcon={checklistSectionIcons[item.id] ?? Target}
                    colors={colors}
                    itemWidth={itemWidth}
                    highlighted={highlightedId === item.id}
                    onPress={() => router.push(item.route as any)}
                  />
                ))
              }
            </ReadinessChecklistGrid>
          </View>
        </VendorDashboardReveal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, width: "100%", alignSelf: "center" },
  desktopScroll: { maxWidth: 1180, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 52 },
  flex: { flex: 1, minWidth: 0 },
  heroCard: { position: "relative", overflow: "hidden", borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.045, shadowRadius: 18, elevation: 1 },
  heroCardDesktop: { paddingHorizontal: 26, paddingVertical: 24 },
  heroGlow: { position: "absolute", width: 180, height: 180, borderRadius: 90, right: -62, top: -92 },
  heroContent: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.7, marginBottom: 7 },
  greeting: { ...typeStyles.pageTitle },
  businessName: { fontSize: typeScale.body, lineHeight: typeLeading.body, marginTop: 3, fontWeight: "600" },
  heroHint: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, marginTop: 15, maxWidth: 560 },
  verified: { flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  verifiedText: { fontSize: typeScale.caption, fontWeight: "700" },
  notice: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  noticeTitle: { fontSize: typeScale.body, fontWeight: "700", marginBottom: 2 },
  noticeText: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab },
  retryButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 8, borderRadius: 10 },
  marketingCenterButton: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  marketingCenterButtonDesktop: { paddingHorizontal: 18, paddingVertical: 15 },
  marketingCenterIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  marketingCenterTitle: { fontSize: typeScale.body, fontWeight: "700" },
  marketingCenterHint: { fontSize: typeScale.caption, marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 1, marginBottom: 16, borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  statsDesktop: { flexWrap: "nowrap" },
  statCard: { width: "49.8%", minHeight: 132, paddingHorizontal: 16, paddingVertical: 17 },
  statDesktop: { flex: 1, width: "auto" },
  statTop: { flexDirection: "row", alignItems: "center", marginBottom: 11 },
  statIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: typeScale.pageTitle, lineHeight: typeLeading.pageTitle, fontWeight: "700", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: typeScale.metadata, fontWeight: "700", marginTop: 2 },
  statDetail: { fontSize: typeScale.caption, marginTop: 4 },
  profileCard: { borderWidth: 1, borderRadius: 16, padding: 18 },
  profileCardDesktop: { padding: 22 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle, fontWeight: "700", letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 3 },
  percentBadge: { width: 65, height: 58, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  percent: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700" },
  percentLabel: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1 },
  progressSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 21 },
  progressLabel: { fontSize: typeScale.metadata, fontWeight: "700" },
  progressCount: { fontSize: typeScale.caption },
  progressTrack: { height: 9, borderRadius: 7, overflow: "hidden", marginTop: 9 },
  progressFill: { height: "100%", borderRadius: 7 },
  nextStep: { minHeight: 78, borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  nextStepIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  nextEyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.2 },
  nextTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginTop: 3 },
  nextHint: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 2 },
  completeBanner: { minHeight: 58, borderRadius: 17, paddingHorizontal: 14, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 9 },
  completeBannerText: { flex: 1, fontSize: typeScale.metadata, fontWeight: "700" },
  checklistHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 21, marginBottom: 10 },
  checklistTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  checklistHint: { fontSize: typeScale.caption },
  interactiveLift: { transform: [{ translateY: -1 }] },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
});
