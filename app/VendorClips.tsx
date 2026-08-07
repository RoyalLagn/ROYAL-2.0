import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, useWindowDimensions, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  BarChart3, Bookmark, Clapperboard, Edit3, Eye, Heart, Lightbulb,
  Link2, Plus, Save, Share2, Trash2, Video,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { ClipManagementService, shareVendorClip } from "@/clips/services";
import { ClipStatusBadge } from "@/clips/components";
import { useVendorClipOverview } from "@/clips/hooks";
import type { ClipStatus } from "@/clips/types";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";

type ClipGroup = "approved" | "pending" | "draft" | "hidden" | "rejected";

export default function VendorClips() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading: workspaceLoading } = useVendorWorkspace();
  const { drafts, loading, error, overview, refresh } = useVendorClipOverview(data.vendor?.id);
  const { hasFeature, requireFeature } = useSubscriptionAccess();
  const [group, setGroup] = useState<ClipGroup>("approved");
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1;

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const visibleClips = useMemo(() => overview.byStatus[group] ?? [], [group, overview.byStatus]);
  const groupTabs: { key: ClipGroup; label: string; count: number }[] = [
    { key: "approved", label: "Approved", count: overview.byStatus.approved.length },
    { key: "pending", label: "Pending", count: overview.byStatus.pending.length },
    { key: "draft", label: "Drafts", count: overview.byStatus.draft.length + drafts.length },
    { key: "hidden", label: "Hidden", count: overview.byStatus.hidden.length },
    { key: "rejected", label: "Rejected", count: overview.byStatus.rejected.length },
  ];

  const [deletingId, setDeletingId] = useState<string | null>(null);
  // A ref, not just `deletingId`, gates re-entrancy into the Cloudinary/RPC
  // call: two dispatches landing in the same tick (e.g. a web Alert polyfill
  // registering a fast double-tap on its "Delete" button before React
  // commits the setDeletingId update) can both read `deletingId` as null.
  // The ref is set synchronously before any await runs, closing that window;
  // `deletingId` still drives the visible disabled/spinner state.
  const deletingRef = useRef<string | null>(null);
  const openUpload = (draftId?: string) => requireFeature("upload_clips", () => {
    if (draftId) router.push({ pathname: "/VendorClipUpload", params: { draftId } });
    else router.push("/VendorClipUpload");
  });
  const openEdit = (clipId: string) => requireFeature("upload_clips", () => {
    router.push({ pathname: "/VendorClipEdit", params: { id: clipId } });
  });
  const remove = (clip: any) => {
    if (!requireFeature("upload_clips")) return;
    // Guards against a double-tap (or a second tap while the confirm alert is
    // still opening) dispatching two deletes for the same Clip: the RPC behind
    // ClipManagementService.remove() can only ever succeed once per Clip, so a
    // second in-flight call would just fail with a confusing "not found" error.
    if (deletingRef.current) return;
    Alert.alert("Delete Clip?", "The video and thumbnail will be removed. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (deletingRef.current) return;
        deletingRef.current = clip.id;
        setDeletingId(clip.id);
        try {
          await ClipManagementService.remove(clip.id);
        } catch (caught) {
          Alert.alert("Delete failed", caught instanceof Error ? caught.message : "Try again.");
        } finally {
          // Always refresh, even on failure: vendor_soft_delete_clip() is a
          // one-shot RPC, so by the time any error surfaces here the Clip has
          // very likely already been removed from the database. Skipping this
          // on error would leave the list showing a Clip that is already gone,
          // inviting a retry that is now guaranteed to fail.
          deletingRef.current = null;
          setDeletingId(null);
          await refresh();
        }
      } },
    ]);
  };
  const share = async (clip: any) => {
    await shareVendorClip({
      id: clip.id,
      title: clip.title,
      vendorId: data.vendor.id,
      vendorName: data.vendor.business_name || "this vendor",
    });
  };
  const showAnalytics = (clip: any) => requireFeature("view_analytics", () => Alert.alert(
    clip.caption?.trim() || "Clip analytics",
    `Views: ${clip.views_count}\nLikes: ${clip.likes_count}\nSaves: ${clip.saves_count}\nStatus: ${clip.status}`,
  ));

  if (workspaceLoading || loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.pink} /></View>;
  }
  if (!data.vendor?.is_verified) {
    return <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}><Video size={42} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Approved Vendor access required</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Clips management becomes available after Vendor approval.</Text></View>;
  }

  return <View style={[styles.root, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.pink} />}
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.heading, { color: colors.text }]}>Your Clips</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>{overview.total} clips · {drafts.length} local drafts</Text>
        </View>
        <Pressable onPress={() => openUpload()} style={[styles.primary, { backgroundColor: colors.pink }]}>
          <Plus size={18} color="#FFF" /><Text style={styles.primaryText}>Upload Clip</Text>
        </Pressable>
      </View>

      {error && <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.noticeText, { color: colors.muted }]}>{error}</Text>
      </View>}

      {hasFeature("view_analytics") ? <View style={[styles.overviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeading}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Clips overview</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Your reach and engagement at a glance</Text></View><BarChart3 size={20} color={colors.pink} /></View>
        <View style={styles.metricGrid}>
          {[
            ["Total Views", overview.views, Eye],
            ["Total Likes", overview.likes, Heart],
            ["Total Saves", overview.saves, Bookmark],
            ["Pending Clips", overview.pending, Clapperboard],
          ].map(([label, value, Icon]: any) => <View key={label} style={[styles.overviewMetric, { backgroundColor: colors.surfaceSoft }]}><Icon size={16} color={colors.pink} /><Text style={[styles.overviewValue, { color: colors.text }]}>{value}</Text><Text style={[styles.overviewLabel, { color: colors.muted }]}>{label}</Text></View>)}
        </View>
        <View style={[styles.analyticsRows, { borderTopColor: colors.border }]}>
          <Text numberOfLines={1} style={[styles.analyticsRow, { color: colors.muted }]}>Most viewed: <Text style={{ color: colors.text, fontWeight: "800" }}>{overview.mostViewed ? `${overview.mostViewed.caption?.trim() || "Wedding Clip"} (${overview.mostViewed.views_count})` : "—"}</Text></Text>
          <Text numberOfLines={1} style={[styles.analyticsRow, { color: colors.muted }]}>Newest Clip: <Text style={{ color: colors.text, fontWeight: "800" }}>{overview.newest?.caption?.trim() || (overview.newest ? "Wedding Clip" : "—")}</Text></Text>
        </View>
      </View> : null}

      <View style={[styles.limitCard, { backgroundColor: overview.limitReached ? `${colors.warning}12` : colors.surfaceSoft, borderColor: overview.limitReached ? colors.warning : colors.border }]}>
        <View style={styles.flex}>
          <Text style={[styles.limitTitle, { color: colors.text }]}>
            {overview.maximumClips ? `${overview.total} / ${overview.maximumClips} Clips Used` : `${overview.total} Clips Used`}
          </Text>
          <Text style={[styles.limitText, { color: overview.limitReached ? colors.warning : colors.muted }]}>
            {overview.limitReached ? "Clip limit reached. Uploading a new Clip will replace an existing one." : "Your Clip limit is provided by your current plan."}
          </Text>
        </View>
        {overview.limitReached && <Pressable onPress={() => setGroup("approved")} style={[styles.manageButton, { backgroundColor: colors.warning }]}><Text style={styles.manageText}>Manage Clips</Text></Pressable>}
      </View>

      <View style={[styles.tipsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.tipsTitle}><Lightbulb size={18} color={colors.pink} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Tips for Better Clips</Text></View>
        {[
          "Use portrait videos (9:16)",
          "Keep videos under 30 seconds",
          "Show your best work in the first few seconds",
          "Use bright lighting",
          "High-quality videos attract more couples",
        ].map((tip) => <View key={tip} style={styles.tipRow}><View style={[styles.tipDot, { backgroundColor: colors.pink }]} /><Text style={[styles.tipText, { color: colors.muted }]}>{tip}</Text></View>)}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {groupTabs.map((tab) => {
          const selected = group === tab.key;
          return <Pressable key={tab.key} onPress={() => setGroup(tab.key)} style={[styles.tab, { borderColor: selected ? colors.pink : colors.border, backgroundColor: selected ? `${colors.pink}14` : colors.surface }]}><Text style={{ color: selected ? colors.pink : colors.muted, fontWeight: "800", fontSize: 11 }}>{tab.label}</Text><View style={[styles.countBadge, { backgroundColor: selected ? colors.pink : colors.surfaceSoft }]}><Text style={{ color: selected ? "#FFF" : colors.muted, fontSize: 9, fontWeight: "900" }}>{tab.count}</Text></View></Pressable>;
        })}
      </ScrollView>

      {group === "draft" && drafts.length > 0 && <View style={[styles.draftBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Saved drafts</Text>
        {drafts.map((draft) => <Pressable key={draft.id} onPress={() => openUpload(draft.id)} style={styles.draftRow}><Save size={16} color={colors.pink} /><Text numberOfLines={1} style={[styles.draftText, { color: colors.text }]}>{draft.title || "Untitled Clip"}</Text><Text style={{ color: colors.pink, fontSize: 10, fontWeight: "800" }}>Resume</Text></Pressable>)}
      </View>}

      {!visibleClips.length && !(group === "draft" && drafts.length) ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.emptyIllustration, { backgroundColor: colors.surfaceSoft }]}><Video size={44} color={colors.pink} /></View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{overview.total ? `No ${group} Clips` : "Share your best wedding work and inspire future couples."}</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>{overview.total ? "Your Clips will appear here when their status changes." : "Short, beautiful videos help couples discover your business."}</Text>
        {!overview.total && <Pressable onPress={() => openUpload()} style={[styles.emptyButton, { backgroundColor: colors.pink }]}><Plus size={17} color="#FFF" /><Text style={styles.primaryText}>Upload First Clip</Text></Pressable>}
      </View> :
      <View style={[styles.grid, { gap: 14 }]}>{visibleClips.map((clip) => <View key={clip.id} style={[styles.card, { width: columns === 1 ? "100%" : `${100 / columns - 1}%`, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Image source={{ uri: clip.thumbnail_url }} style={styles.thumb} />
        <View style={styles.cardBody}>
          <View style={styles.row}><Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>{clip.caption?.trim() || "Wedding Clip"}</Text><ClipStatusBadge status={clip.status as ClipStatus} /></View>
          <View style={styles.analytics}><View style={styles.metric}><Eye size={14} color={colors.muted} /><Text style={[styles.metricText, { color: colors.muted }]}>{clip.views_count}</Text></View><View style={styles.metric}><Heart size={14} color={colors.muted} /><Text style={[styles.metricText, { color: colors.muted }]}>{clip.likes_count}</Text></View><View style={styles.metric}><Save size={14} color={colors.muted} /><Text style={[styles.metricText, { color: colors.muted }]}>{clip.saves_count}</Text></View></View>
          <Text style={[styles.date, { color: colors.muted }]}>Uploaded {new Date(clip.created_at).toLocaleDateString()}{clip.published_at ? ` · Published ${new Date(clip.published_at).toLocaleDateString()}` : ""}</Text>
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Pressable accessibilityLabel="Edit Clip" onPress={() => openEdit(clip.id)} style={styles.action}><Edit3 size={16} color={colors.pink} /><Text style={[styles.actionLabel, { color: colors.pink }]}>Edit</Text></Pressable>
            <Pressable accessibilityLabel="Delete Clip" disabled={deletingId === clip.id} onPress={() => remove(clip)} style={[styles.action, deletingId === clip.id && styles.actionDisabled]}>{deletingId === clip.id ? <ActivityIndicator size="small" color="#DC2626" /> : <Trash2 size={16} color="#DC2626" />}<Text style={[styles.actionLabel, { color: "#DC2626" }]}>{deletingId === clip.id ? "Deleting…" : "Delete"}</Text></Pressable>
            <Pressable accessibilityLabel="Share Clip" onPress={() => void share(clip)} style={styles.action}><Share2 size={16} color={colors.pink} /><Text style={[styles.actionLabel, { color: colors.pink }]}>Share</Text></Pressable>
            <Pressable accessibilityLabel="Copy Clip link coming soon" disabled style={[styles.action, { opacity: 0.45 }]}><Link2 size={16} color={colors.muted} /><Text style={[styles.actionLabel, { color: colors.muted }]}>Copy Link</Text></Pressable>
            <Pressable accessibilityLabel="View Clip analytics" onPress={() => showAnalytics(clip)} style={styles.action}><BarChart3 size={16} color={colors.pink} /><Text style={[styles.actionLabel, { color: colors.pink }]}>Analytics</Text></Pressable>
          </View>
        </View>
      </View>)}</View>}
    </ScrollView>

    <Pressable accessibilityRole="button" accessibilityLabel="Upload New Clip" onPress={() => openUpload()} style={[styles.floatingUpload, { backgroundColor: colors.pink, shadowColor: colors.shadow }]}>
      <Plus size={20} color="#FFF" /><Text style={styles.floatingText}>Upload New Clip</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: 18, paddingBottom: 110 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 },
  heading: { fontSize: 24, fontWeight: "900" }, subheading: { fontSize: 11, marginTop: 4 },
  primary: { height: 44, paddingHorizontal: 15, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 7 }, primaryText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  notice: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 14 }, noticeText: { fontSize: 10, lineHeight: 15 },
  overviewCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 13 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionTitle: { fontSize: 15, fontWeight: "900" }, sectionSubtitle: { fontSize: 10, marginTop: 3 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }, overviewMetric: { width: "48%", flexGrow: 1, borderRadius: 15, padding: 11 }, overviewValue: { fontSize: 18, fontWeight: "900", marginTop: 6 }, overviewLabel: { fontSize: 9, marginTop: 2 },
  analyticsRows: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 11, gap: 5 }, analyticsRow: { fontSize: 10 },
  limitCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 }, limitTitle: { fontSize: 13, fontWeight: "900" }, limitText: { fontSize: 9, lineHeight: 14, marginTop: 3 }, manageButton: { minHeight: 38, borderRadius: 13, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, manageText: { color: "#FFF", fontSize: 10, fontWeight: "900" },
  tipsCard: { borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 14 }, tipsTitle: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 9 }, tipRow: { flexDirection: "row", alignItems: "center", minHeight: 25 }, tipDot: { width: 5, height: 5, borderRadius: 3, marginRight: 9 }, tipText: { fontSize: 10 },
  tabs: { gap: 8, paddingBottom: 14 }, tab: { height: 40, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 }, countBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  draftBox: { borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 16 }, draftRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10 }, draftText: { flex: 1, fontSize: 12, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" }, card: { borderWidth: 1, borderRadius: 22, overflow: "hidden" }, thumb: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111" }, cardBody: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 }, cardTitle: { flex: 1, fontSize: 14, fontWeight: "800" }, analytics: { flexDirection: "row", gap: 16, marginTop: 13 }, metric: { flexDirection: "row", gap: 5, alignItems: "center" }, metricText: { fontSize: 11, fontWeight: "700" }, date: { fontSize: 9, marginTop: 10 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 11 }, action: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 4 }, actionDisabled: { opacity: 0.5 }, actionLabel: { fontSize: 9, fontWeight: "800" },
  empty: { borderWidth: 1, borderRadius: 24, padding: 34, alignItems: "center" }, emptyIllustration: { width: 88, height: 88, borderRadius: 30, alignItems: "center", justifyContent: "center" }, emptyTitle: { maxWidth: 460, fontSize: 18, fontWeight: "800", marginTop: 12, textAlign: "center" }, emptyText: { maxWidth: 430, fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 18 }, emptyButton: { minHeight: 46, borderRadius: 16, paddingHorizontal: 17, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 7 },
  floatingUpload: { position: "absolute", right: 18, bottom: 18, minHeight: 52, borderRadius: 19, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 8 }, floatingText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
});
