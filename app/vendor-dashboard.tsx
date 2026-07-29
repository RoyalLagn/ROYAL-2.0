import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowRight, Bookmark, CalendarDays, Check, ChevronRight, CircleAlert,
  Clapperboard, Clock3, Eye, Heart, Images, MessageSquareText, Plus,
  Sparkles, Star, UserRoundPen,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import { useVendorClipOverview } from "@/clips/hooks";

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
  const {
    loading: clipsLoading,
    error: clipsError,
    overview: clipsOverview,
    refresh: refreshClips,
  } = useVendorClipOverview(data.vendor?.id);
  const desktop = width >= 900;
  const unread = data.notifications.filter((item) => !item.is_read).length;
  const openEnquiries = data.enquiries.filter((item) => !["closed", "booked"].includes(item.status)).length;
  const averageRating = data.reviews.length
    ? (data.reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / data.reviews.length).toFixed(1)
    : "—";
  const vendorName = data.vendor?.business_name || "Your vendor business";
  const plan = data.subscription?.plan_name || data.vendor?.subscription_status || "Free";

  useFocusEffect(useCallback(() => {
    refresh();
    void refreshClips();
  }, [refresh, refreshClips]));
  const stats = [
    { label: "Profile views", value: String(data.vendor?.profile_views ?? 0), icon: Eye },
    { label: "Open enquiries", value: String(openEnquiries), icon: MessageSquareText },
    { label: "Portfolio media", value: String(data.media.length), icon: Images },
    { label: "Average rating", value: averageRating, icon: Star },
  ];
  const quickActions = [
    { label: "Edit profile", icon: UserRoundPen, route: "/VendorEditProfile" },
    { label: "Add portfolio", icon: Images, route: "/VendorGallery" },
    { label: "Update calendar", icon: CalendarDays, route: "/VendorCalendar" },
    { label: "View enquiries", icon: MessageSquareText, route: "/VendorEnquiries" },
    { label: "Clips", icon: Clapperboard, route: "/VendorClips" },
  ];

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={unread} />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.pink} />}>
        <VendorDashboardReveal>
          <View style={styles.eyebrowRow}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.pink }]}>VENDOR WORKSPACE</Text>
              <Text style={[styles.greeting, { color: colors.text }]}>Good to see you.</Text>
              <Text style={[styles.businessName, { color: colors.muted }]} numberOfLines={2}>{vendorName}</Text>
            </View>
            {data.vendor?.is_verified && <View style={[styles.verified, { backgroundColor: colors.surfaceSoft }]}><Check size={13} color={colors.success} /><Text style={{ color: colors.success, fontSize: 11, fontWeight: "700" }}>Verified</Text></View>}
          </View>

          {error && <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CircleAlert size={18} color={colors.warning} /><View style={styles.flex}><Text style={[styles.noticeTitle, { color: colors.text }]}>Workspace unavailable</Text><Text style={[styles.noticeText, { color: colors.muted }]}>{error}</Text></View>
            <Pressable onPress={refresh}><Text style={{ color: colors.pink, fontWeight: "700" }}>Retry</Text></Pressable>
          </View>}
          {!loading && !data.vendor && !error && <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Sparkles size={18} color={colors.pink} /><View style={styles.flex}><Text style={[styles.noticeTitle, { color: colors.text }]}>Vendor preview</Text><Text style={[styles.noticeText, { color: colors.muted }]}>Create or connect a vendor profile to populate this workspace with live information.</Text></View>
          </View>}

          <Pressable onPress={() => router.push("/VendorSubscription")}
            style={({ pressed }) => [styles.subscription, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }, pressed && styles.pressed]}>
            <View style={[styles.planIcon, { backgroundColor: colors.pink }]}><Sparkles size={20} color="#FFF" /></View>
            <View style={styles.flex}><Text style={[styles.smallLabel, { color: colors.muted }]}>CURRENT PLAN</Text><Text style={[styles.planName, { color: colors.text }]}>{plan} plan</Text></View>
            <View style={styles.manage}><Text style={{ color: colors.pink, fontWeight: "700", fontSize: 12 }}>Manage</Text><ArrowRight size={15} color={colors.pink} /></View>
          </Pressable>

          <View style={[styles.statsGrid, desktop && styles.statsDesktop]}>
            {stats.map(({ label, value, icon: Icon }, index) => (
              <VendorDashboardReveal key={label} delay={60 + index * 35}
                style={[styles.statCard, desktop && styles.statDesktop, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
                <View style={[styles.statIcon, { backgroundColor: colors.surfaceSoft }]}><Icon size={18} color={colors.pink} /></View>
                <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
              </VendorDashboardReveal>
            ))}
          </View>

          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <View style={styles.sectionHeading}>
              <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>Profile completion</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Improve how customers discover and trust your business.</Text></View>
              <Text style={[styles.percent, { color: colors.pink }]}>{completion.percent}%</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSoft }]}><View style={[styles.progressFill, { width: `${completion.percent}%`, backgroundColor: colors.pink }]} /></View>
            <View style={{ marginTop: 12 }}>
              {completion.items.map((item, index) => {
                const meta = completionMeta[item.state];
                const Icon = meta.icon;
                const tint = item.state === "complete" ? colors.success : item.state === "attention" ? colors.warning : colors.pink;
                return <Pressable key={item.id} onPress={() => router.push(item.route as any)}
                  style={({ pressed }) => [styles.completionRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.surfaceSoft }]}>
                  <View style={[styles.stateIcon, { backgroundColor: `${tint}16` }]}><Icon size={16} color={tint} /></View>
                  <Text style={[styles.completionLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[styles.stateLabel, { color: tint }]}>{meta.label}</Text>
                  <ChevronRight size={16} color={colors.muted} />
                </Pressable>;
              })}
            </View>
          </View>

          <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>Quick actions</Text></View>
          <View style={styles.actionGrid}>
            {quickActions.map(({ label, icon: Icon, route }) => <Pressable key={label} onPress={() => router.push(route as any)}
              style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.actionIcon, { backgroundColor: colors.surfaceSoft }]}><Icon size={21} color={colors.pink} /></View>
              <Text style={[styles.actionText, { color: colors.text }]}>{label}</Text><ChevronRight size={16} color={colors.muted} />
            </Pressable>)}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Clips management"
            onPress={() => router.push("/VendorClips")}
            style={({ pressed }) => [
              styles.clipsCard,
              { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.clipsHeading}>
              <View style={[styles.clipsHeroIcon, { backgroundColor: colors.pink }]}>
                <Clapperboard size={24} color="#FFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>🎬 Clips</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Upload and manage your wedding videos</Text>
              </View>
              <ChevronRight size={19} color={colors.pink} />
            </View>

            {clipsError ? (
              <View style={[styles.clipsNotice, { backgroundColor: colors.surfaceSoft }]}>
                <Text style={[styles.clipsNoticeText, { color: colors.muted }]}>Clips data will appear after the Clips database migration is deployed.</Text>
              </View>
            ) : clipsLoading ? (
              <ActivityIndicator color={colors.pink} style={{ marginVertical: 18 }} />
            ) : (
              <>
                <View style={styles.clipsStats}>
                  {[
                    ["Total Clips", clipsOverview.total, Clapperboard],
                    ["Approved", clipsOverview.approved, Check],
                    ["Pending Review", clipsOverview.pending, Clock3],
                    ["Drafts", clipsOverview.draftCount, Plus],
                    ["Views", clipsOverview.views, Eye],
                    ["Likes", clipsOverview.likes, Heart],
                    ["Saves", clipsOverview.saves, Bookmark],
                  ].map(([label, value, Icon]: any) => (
                    <View key={label} style={[styles.clipMetric, { backgroundColor: colors.surfaceSoft }]}>
                      <Icon size={15} color={colors.pink} />
                      <Text style={[styles.clipMetricValue, { color: colors.text }]}>{value}</Text>
                      <Text numberOfLines={1} style={[styles.clipMetricLabel, { color: colors.muted }]}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.clipUsage, { borderTopColor: colors.border }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.clipUsageText, { color: colors.text }]}>
                      {clipsOverview.maximumClips
                        ? `${clipsOverview.total} / ${clipsOverview.maximumClips} Clips Used`
                        : `${clipsOverview.total} Clips Used`}
                    </Text>
                    <Text style={[styles.clipUsageHint, { color: clipsOverview.limitReached ? colors.warning : colors.muted }]}>
                      {clipsOverview.limitReached
                        ? "Clip limit reached. Uploading a new Clip will replace an existing one."
                        : clipsOverview.mostViewed
                          ? `Most viewed: ${clipsOverview.mostViewed.title} (${clipsOverview.mostViewed.views_count}) · Newest: ${clipsOverview.newest?.title || "—"}`
                          : "Share your best wedding work with future couples."}
                    </Text>
                  </View>
                  <Text style={{ color: colors.pink, fontWeight: "800", fontSize: 11 }}>
                    {clipsOverview.limitReached ? "Manage Clips" : "Open Clips"}
                  </Text>
                </View>
              </>
            )}
          </Pressable>

          <View style={[styles.dualGrid, desktop && styles.dualDesktop]}>
            <Pressable onPress={() => router.push("/VendorGallery")} style={[styles.summaryCard, desktop && styles.summaryDesktop, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeading}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Portfolio</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{data.albums.length} albums · {data.media.length} media</Text></View><Images size={21} color={colors.pink} /></View>
              <Text style={[styles.summaryHint, { color: colors.muted }]}>{data.media.length ? "Keep your best recent work at the front." : "Create your first album and show customers your work."}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/VendorCalendar")} style={[styles.summaryCard, desktop && styles.summaryDesktop, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeading}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Availability</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{data.availability.length} upcoming dates set</Text></View><CalendarDays size={21} color={colors.pink} /></View>
              <Text style={[styles.summaryHint, { color: colors.muted }]}>{data.availability[0]?.date ? `Next update: ${data.availability[0].date}` : "Set dates so customers know when you are available."}</Text>
            </Pressable>
          </View>

          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeading}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Recent enquiries</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Latest customer interest</Text></View><Pressable onPress={() => router.push("/VendorEnquiries")}><Text style={{ color: colors.pink, fontWeight: "700", fontSize: 12 }}>View all</Text></Pressable></View>
            {data.enquiries.slice(0, 3).map((item, index) => <View key={item.id} style={[styles.enquiry, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.surfaceSoft }]}><Text style={{ color: colors.pink, fontWeight: "800" }}>{item.customer_name?.[0]?.toUpperCase() || "C"}</Text></View>
              <View style={styles.flex}><Text style={[styles.enquiryName, { color: colors.text }]}>{item.customer_name}</Text><Text numberOfLines={1} style={[styles.enquiryMessage, { color: colors.muted }]}>{item.message}</Text></View>
              <Text style={[styles.status, { color: colors.pink, backgroundColor: colors.surfaceSoft }]}>{item.status}</Text>
            </View>)}
            {!data.enquiries.length && <View style={styles.empty}><MessageSquareText size={25} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.muted }]}>New customer enquiries will appear here.</Text></View>}
          </View>
        </VendorDashboardReveal>
      </ScrollView>
      {loading && !data.vendor && <View style={styles.loading}><ActivityIndicator color={colors.pink} /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 24, width: "100%", alignSelf: "center" },
  desktopScroll: { maxWidth: 1120, paddingHorizontal: 28, paddingBottom: 48 },
  eyebrowRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.6, marginBottom: 6 },
  greeting: { fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 },
  businessName: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  verified: { flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  noticeTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  noticeText: { fontSize: 12, lineHeight: 17 },
  flex: { flex: 1, minWidth: 0 },
  subscription: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderRadius: 20, marginBottom: 15 },
  planIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  smallLabel: { fontSize: 9, letterSpacing: 1.2, fontWeight: "800" },
  planName: { fontSize: 16, fontWeight: "800", textTransform: "capitalize", marginTop: 2 },
  manage: { flexDirection: "row", alignItems: "center", gap: 3 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statsDesktop: { flexWrap: "nowrap" },
  statCard: { width: "48.4%", minHeight: 126, borderRadius: 20, borderWidth: 1, padding: 14, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  statDesktop: { flex: 1, width: "auto" },
  statIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 11, marginTop: 2 },
  sectionCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 16, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.035, shadowRadius: 15, elevation: 1 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800", letterSpacing: -0.25 },
  sectionSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  percent: { fontSize: 20, fontWeight: "900" },
  progressTrack: { height: 7, borderRadius: 6, overflow: "hidden", marginTop: 14 },
  progressFill: { height: "100%", borderRadius: 6 },
  completionRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 8, paddingHorizontal: 2, borderRadius: 8 },
  stateIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  completionLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
  stateLabel: { fontSize: 10, fontWeight: "700" },
  sectionHeader: { marginTop: 5, marginBottom: 10 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  action: { width: "48.4%", minHeight: 66, borderRadius: 18, borderWidth: 1, padding: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionText: { flex: 1, fontSize: 11, fontWeight: "700" },
  clipsCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 18, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 18, elevation: 2 },
  clipsHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  clipsHeroIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  clipsStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 },
  clipMetric: { minWidth: "22%", flexGrow: 1, borderRadius: 14, padding: 10 },
  clipMetricValue: { fontSize: 16, fontWeight: "900", marginTop: 6 },
  clipMetricLabel: { fontSize: 8, marginTop: 2 },
  clipUsage: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 13 },
  clipUsageText: { fontSize: 12, fontWeight: "800" },
  clipUsageHint: { fontSize: 9, lineHeight: 14, marginTop: 3 },
  clipsNotice: { borderRadius: 14, padding: 12, marginTop: 14 },
  clipsNoticeText: { fontSize: 10, lineHeight: 15 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  dualGrid: { gap: 12 },
  dualDesktop: { flexDirection: "row" },
  summaryCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 12 },
  summaryDesktop: { flex: 1 },
  summaryHint: { fontSize: 12, lineHeight: 18, marginTop: 14 },
  enquiry: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  enquiryName: { fontSize: 12, fontWeight: "700" },
  enquiryMessage: { fontSize: 11, marginTop: 3 },
  status: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  empty: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 12, textAlign: "center" },
  loading: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center", pointerEvents: "none" },
});
