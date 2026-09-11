import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, useWindowDimensions, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  BarChart3, Bookmark, Clapperboard, Edit3, Eye, Heart, Lightbulb,
  ChevronRight, Link2, LockKeyhole, MoreVertical, Play, Plus, Save,
  Share2, Smartphone, Sun, Timer, Trash2, Video, X,
} from "lucide-react-native";
import Svg, { Circle, G } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { ClipManagementService, shareVendorClip } from "@/clips/services";
import { ClipStatusBadge, PublicClipVideo, PublicClipVideoBoundary } from "@/clips/components";
import { useVendorClipOverview } from "@/clips/hooks";
import type { ClipStatus } from "@/clips/types";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { usePublicClipsAvailability } from "@/hooks/usePublicClipsAvailability";
import { typeScale, typeLeading, typeStyles } from "@/constants/typography";
import PageLoader from "@/components/loading/PageLoader";
import { useAppFeedback } from "@/context/AppFeedbackContext";
import InteropSafePressable from "@/components/InteropSafePressable";
import { EliteClipsUpgradeState } from "@/components/subscriptions/EliteClipsUpgradeState";

type ClipGroup = "approved" | "pending" | "draft" | "hidden" | "rejected";

function ClipUsageRing({ value, total, color, trackColor, textColor }: { value: number; total: number; color: string; trackColor: string; textColor: string }) {
  const size = 68;
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(1, value / total) : 0;
  return <View style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={8} fill="none" />
      <G rotation={-90} originX={size / 2} originY={size / 2}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={8} fill="none" strokeDasharray={`${progress * circumference} ${circumference}`} strokeLinecap="round" />
      </G>
    </Svg>
    <View style={styles.ringLabel}><Text style={[styles.ringText, { color: textColor }]}>{value} / {total}</Text></View>
  </View>;
}

export default function VendorClips() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const { data, loading: workspaceLoading } = useVendorWorkspace();
  const { drafts, loading, error, overview, refresh } = useVendorClipOverview(data.vendor?.id);
  const { hasFeature, requireFeature } = useSubscriptionAccess();
  // Public Clips availability gates STARTING a new upload only (Case A-D in
  // the vendor upload-disable spec) -- independent of, and checked before,
  // the upload_clips subscription gate below. Fails closed: null (still
  // loading) and false both disable, so a vendor can never start an upload
  // before the setting is known.
  const publicClipsEnabled = usePublicClipsAvailability();
  const uploadDisabled = publicClipsEnabled !== true;
  const [group, setGroup] = useState<ClipGroup>("approved");
  const [previewClip, setPreviewClip] = useState<any | null>(null);
  const [actionClip, setActionClip] = useState<any | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);
  const contentWidth = Math.max(0, Math.min(width, 1080) - 36);
  const clipColumns = width < 320 ? 1 : width >= 1100 ? 4 : width >= 700 ? 3 : 2;
  const gridGap = width < 430 ? 10 : 14;
  const gridTileWidth = Math.max(120, (contentWidth - gridGap * (clipColumns - 1)) / clipColumns);
  const metricGap = width < 430 ? 7 : 10;
  const metricWidth = Math.max(60, (contentWidth - metricGap * 3) / 4);
  const desktopPreview = width >= 820;
  const previewVideoHeight = desktopPreview ? Math.min(520, height * 0.57) : Math.min(600, height * 0.62);
  const previewVideoWidth = Math.min(desktopPreview ? 520 : width, previewVideoHeight * (9 / 16));

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const visibleClips = useMemo(() => overview.byStatus[group] ?? [], [group, overview.byStatus]);
  const groupTabs: { key: ClipGroup; label: string; count: number }[] = [
    { key: "approved", label: "Approved", count: overview.byStatus.approved.length },
    { key: "pending", label: "Pending", count: overview.byStatus.pending.length },
    { key: "draft", label: "Drafts", count: overview.byStatus.draft.length + drafts.length },
    { key: "hidden", label: "Hidden", count: overview.byStatus.hidden.length },
  ];

  const [deletingId, setDeletingId] = useState<string | null>(null);
  // A ref, not just `deletingId`, gates re-entrancy into the Cloudinary/RPC
  // call: two dispatches landing in the same tick (e.g. a web Alert polyfill
  // registering a fast double-tap on its "Delete" button before React
  // commits the setDeletingId update) can both read `deletingId` as null.
  // The ref is set synchronously before any await runs, closing that window;
  // `deletingId` still drives the visible disabled/spinner state.
  const deletingRef = useRef<string | null>(null);
  const openUpload = (draftId?: string) => {
    // Guard first, and independently of requireFeature: Public Clips OFF must
    // stop navigation even for a vendor whose plan already has upload_clips.
    if (uploadDisabled) return;
    requireFeature("upload_clips", () => {
      if (overview.limitReached) {
        Alert.alert("Clip limit reached", `Your plan allows ${overview.maximumClips ?? 0} Clips. Upgrade your plan or remove a Clip before uploading another.`, [{ text: "Not now", style: "cancel" }, { text: "View plans", onPress: () => router.push("/VendorSubscription") }]);
        return;
      }
      if (draftId) router.push({ pathname: "/VendorClipUpload", params: { draftId } });
      else router.push("/VendorClipUpload");
    });
  };
  const openEdit = (clipId: string) => requireFeature("upload_clips", () => {
    router.push({ pathname: "/VendorClipEdit", params: { id: clipId } });
  });
  const remove = (clip: any) => {
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
          showSuccess("Clip deleted");
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "Unknown deletion error";
          console.error(`[VendorClips] Clip deletion failed (${clip.id}): ${message}`);
          Alert.alert("Unable to delete Clip", message || "Unable to delete this clip. Please try again.");
        } finally {
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
  const openPreview = (clip: any) => {
    setPreviewMuted(true);
    setPreviewClip(clip);
  };
  const closePreview = () => {
    setPreviewClip(null);
    setPreviewMuted(true);
  };

  if (workspaceLoading || loading) {
    return <PageLoader />;
  }
  if (!data.vendor?.is_verified) {
    return <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}><Video size={42} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Approved Vendor access required</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Clips management becomes available after Vendor approval.</Text></View>;
  }
  if (!hasFeature("upload_clips")) {
    return <View style={[styles.root, { backgroundColor: colors.background }]}><VendorHeader /><EliteClipsUpgradeState /></View>;
  }

  return <View style={[styles.root, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.pink} />}
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={[styles.heading, { color: colors.text }]}>Your Clips</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>{overview.maximumClips ? `${overview.total} of ${overview.maximumClips} clips used` : `${overview.total} clips used`}  <Text style={{ color: colors.pink }}>•</Text>  {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</Text>
        </View>
        <InteropSafePressable accessibilityRole="button" accessibilityLabel="Upload Clip" accessibilityState={{ disabled: uploadDisabled }} disabled={uploadDisabled} onPress={() => openUpload()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.surface, borderColor: `${colors.pink}40` }, uploadDisabled && styles.actionDisabled, pressed && styles.pressed]}>
          <Plus size={19} color={colors.pink} /><Text style={[styles.primaryText, { color: colors.pink }]}>Upload Clip</Text>
        </InteropSafePressable>
      </View>

      {error ? <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.noticeText, { color: colors.muted }]}>{error}</Text>
      </View> : null}

      {hasFeature("view_analytics") ? <View style={[styles.metricGrid, { gap: metricGap }]}>
          {[
            ["Views", overview.views, Eye],
            ["Likes", overview.likes, Heart],
            ["Saves", overview.saves, Bookmark],
            ["Pending", overview.pending, Clapperboard],
          ].map(([label, value, Icon]: any) => <View key={label} style={[styles.overviewMetric, { width: metricWidth, backgroundColor: colors.surface, borderColor: `${colors.pink}22` }]}><Icon size={20} color={colors.pink} /><Text style={[styles.overviewValue, { color: colors.text }]}>{value}</Text><Text style={[styles.overviewLabel, { color: colors.muted }]}>{label}</Text></View>)}
      </View> : null}

      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {groupTabs.map((tab) => {
          const selected = group === tab.key;
          return <InteropSafePressable accessibilityRole="tab" accessibilityState={{ selected }} key={tab.key} onPress={() => setGroup(tab.key)} style={({ pressed }) => [styles.tab, { borderColor: selected ? `${colors.pink}55` : colors.border, backgroundColor: selected ? `${colors.pink}10` : colors.surface }, pressed && styles.pressed]}><Text style={{ color: selected ? colors.pink : colors.muted, fontWeight: "700", fontSize: typeScale.metadata }}>{tab.label}</Text><Text style={{ color: selected ? colors.pink : colors.muted, fontSize: typeScale.caption, fontWeight: "700" }}>{tab.count}</Text></InteropSafePressable>;
        })}
      </ScrollView>

      {group === "draft" && drafts.length > 0 ? <View style={[styles.draftBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Saved drafts</Text>
        {drafts.map((draft) => <Pressable key={draft.id} accessibilityRole="button" accessibilityLabel={`Resume ${draft.title || "Untitled Clip"}`} accessibilityState={{ disabled: uploadDisabled }} disabled={uploadDisabled} onPress={() => openUpload(draft.id)} style={({ pressed }) => [styles.draftRow, uploadDisabled && styles.actionDisabled, pressed && styles.pressed]}><Save size={16} color={colors.pink} /><Text numberOfLines={1} style={[styles.draftText, { color: colors.text }]}>{draft.title || "Untitled Clip"}</Text><Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>Resume</Text></Pressable>)}
      </View> : null}

      {!visibleClips.length && !(group === "draft" && drafts.length) ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.emptyIllustration, { backgroundColor: colors.surfaceSoft }]}><Video size={36} color={colors.pink} /></View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{overview.total ? `No ${group} Clips` : "Share your best wedding work and inspire future couples."}</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>{overview.total ? "Your Clips will appear here when their status changes." : "Short, beautiful videos help couples discover your business."}</Text>
        {!overview.total ? <Pressable accessibilityRole="button" accessibilityLabel="Upload First Clip" accessibilityState={{ disabled: uploadDisabled }} disabled={uploadDisabled} onPress={() => openUpload()} style={({ pressed }) => [styles.emptyButton, { backgroundColor: colors.pink }, uploadDisabled && styles.actionDisabled, pressed && styles.pressed]}><Plus size={17} color="#FFF" /><Text style={styles.primaryText}>Upload First Clip</Text></Pressable> : null}
      </View> : <View style={[styles.grid, { gap: gridGap }]}>{visibleClips.map((clip) => {
        const clipName = clip.title?.trim() || clip.caption?.trim() || "Wedding Clip";
        return <View key={clip.id} style={[styles.gridTile, { width: gridTileWidth }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${clipName} reel`} onPress={() => openPreview(clip)} style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.mediaPressed]}>
            <Image source={{ uri: clip.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
            <View pointerEvents="none" style={styles.mediaShade} />
            <View pointerEvents="none" style={styles.playButton}><Play size={23} color="#2C292B" fill="#2C292B" /></View>
            <View pointerEvents="none" style={styles.statusOverlay}>{clip.subscription_locked ? <View style={[styles.lockBadge, { backgroundColor: "rgba(20,15,18,.82)" }]}><LockKeyhole size={12} color="#FFD18A" /><Text style={[styles.lockBadgeText, { color: "#FFD18A" }]}>LOCKED</Text></View> : <ClipStatusBadge status={clip.status as ClipStatus} />}</View>
            <LinearGradient pointerEvents="none" colors={["rgba(8,5,7,0)", "rgba(8,5,7,.82)"]} locations={[0, 0.58]} style={styles.tileFooter}><Text numberOfLines={2} style={styles.tileTitle}>{clipName}</Text><View style={styles.tileViews}><Eye size={15} color="#FFF" /><Text style={styles.mediaMetricText}>{clip.views_count}</Text></View></LinearGradient>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${clipName}`} onPress={() => setActionClip(clip)} style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}><MoreVertical size={22} color="#FFF" /></Pressable>
        </View>;
      })}</View>}

      <View style={[styles.limitCard, { backgroundColor: overview.limitReached ? `${colors.warning}08` : colors.surface, borderColor: overview.limitReached ? `${colors.warning}55` : `${colors.pink}22` }]}>
        {overview.maximumClips ? <ClipUsageRing value={overview.total} total={overview.maximumClips} color={colors.pink} trackColor={`${colors.pink}16`} textColor={colors.text} /> : <View style={[styles.usageIcon, { backgroundColor: colors.surfaceSoft }]}><Clapperboard size={24} color={colors.pink} /></View>}
        <View style={styles.flex}>
          <Text style={[styles.limitTitle, { color: colors.text }]}>{overview.maximumClips ? `${overview.total} / ${overview.maximumClips} Clips Used` : `${overview.total} Clips Used`}</Text>
          <Text style={[styles.limitText, { color: overview.limitReached ? colors.warning : colors.muted }]}>{overview.lockedCount ? `${overview.lockedCount} Clips are locked and hidden from customers. Upgrade to unlock them.` : overview.limitReached ? "Clip limit reached. Upgrade or remove a Clip before uploading another." : "Your Clip limit is provided by your current plan."}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Manage Clips" onPress={() => setGroup("approved")} style={({ pressed }) => [styles.usageChevron, pressed && styles.pressed]}><ChevronRight size={24} color={colors.muted} /></Pressable>
      </View>

      <View style={[styles.tipsCard, { backgroundColor: colors.surface, borderColor: `${colors.pink}22` }]}>
        <View style={styles.tipsTitle}><View style={[styles.tipsIcon, { backgroundColor: colors.surfaceSoft }]}><Lightbulb size={22} color={colors.pink} /></View><Text style={[styles.sectionTitle, { color: colors.text }]}>Tips for Better Clips</Text></View>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tipsGrid}>{[
          ["Portrait (9:16)", Smartphone],
          ["Under 30s", Timer],
          ["Hook first few seconds", Play],
          ["Bright lighting", Sun],
          ["High quality", null],
        ].map(([tip, Icon]: any) => <View key={tip} style={styles.tipRow}>{Icon ? <Icon size={20} color={colors.pink} /> : <View style={[styles.hdIcon, { borderColor: colors.pink }]}><Text style={[styles.hdText, { color: colors.pink }]}>HD</Text></View>}<Text style={[styles.tipText, { color: colors.muted }]}>{tip}</Text></View>)}</ScrollView>
      </View>
    </ScrollView>

    <Modal visible={Boolean(actionClip)} transparent animationType="fade" onRequestClose={() => setActionClip(null)}>
      {actionClip ? <View style={[styles.actionBackdrop, desktopPreview ? styles.actionCenter : styles.actionBottom]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Clip actions" onPress={() => setActionClip(null)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.actionSheet, desktopPreview ? styles.actionSheetDesktop : styles.actionSheetMobile, { backgroundColor: colors.surface }]}>
          <View style={[styles.actionSheetHandle, { backgroundColor: colors.border }]} />
          <Text numberOfLines={1} style={[styles.actionSheetTitle, { color: colors.text }]}>{actionClip.title?.trim() || actionClip.caption?.trim() || "Wedding Clip"}</Text>
          <Pressable accessibilityRole="button" onPress={() => { const clip = actionClip; setActionClip(null); showAnalytics(clip); }} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}><BarChart3 size={18} color={colors.pink} /><Text style={[styles.sheetActionText, { color: colors.text }]}>Analytics</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { const clipId = actionClip.id; setActionClip(null); openEdit(clipId); }} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}><Edit3 size={18} color={colors.pink} /><Text style={[styles.sheetActionText, { color: colors.text }]}>Edit</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { const clip = actionClip; setActionClip(null); void share(clip); }} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}><Share2 size={18} color={colors.pink} /><Text style={[styles.sheetActionText, { color: colors.text }]}>Share</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy Clip link coming soon" disabled style={[styles.sheetAction, styles.actionDisabled]}><Link2 size={18} color={colors.muted} /><Text style={[styles.sheetActionText, { color: colors.muted }]}>Copy Link</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { const clip = actionClip; setActionClip(null); remove(clip); }} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}><Trash2 size={18} color="#DC2626" /><Text style={[styles.sheetActionText, { color: "#DC2626" }]}>Delete</Text></Pressable>
        </View>
      </View> : null}
    </Modal>

    <Modal visible={Boolean(previewClip)} transparent animationType="fade" onRequestClose={closePreview}>
      {previewClip ? <View style={[styles.modalBackdrop, desktopPreview ? styles.modalCenter : styles.modalBottom]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close clip preview" onPress={closePreview} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.previewPanel, desktopPreview ? styles.previewPanelDesktop : styles.previewPanelMobile, { backgroundColor: colors.surface }]}>
          <View style={[styles.videoFrame, { height: previewVideoHeight }]}>
            <View style={{ width: previewVideoWidth, height: previewVideoHeight }}>
              <PublicClipVideoBoundary posterUri={previewClip.thumbnail_url}>
                <PublicClipVideo key={previewClip.id} uri={previewClip.video_url} thumbnailUrl={previewClip.thumbnail_url} sourceWidth={1080} sourceHeight={1920} active muted={previewMuted} width={previewVideoWidth} height={previewVideoHeight} onToggleMuted={() => setPreviewMuted((current) => !current)} onDoubleTapLike={() => {}} />
              </PublicClipVideoBoundary>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={closePreview} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><X size={19} color="#FFF" /></Pressable>
          <ScrollView style={styles.previewDetails} contentContainerStyle={[styles.previewDetailsContent, { paddingBottom: Math.max(18, insets.bottom + 10) }]} showsVerticalScrollIndicator={false}>
            <Text numberOfLines={2} style={[styles.previewTitle, { color: colors.text }]}>{previewClip.title?.trim() || previewClip.caption?.trim() || "Wedding Clip"}</Text>
            <View style={styles.previewMeta}><ClipStatusBadge status={previewClip.status as ClipStatus} /><Text numberOfLines={1} style={[styles.previewDate, { color: colors.muted }]}>Uploaded {new Date(previewClip.created_at).toLocaleDateString()}{previewClip.published_at ? ` · Published ${new Date(previewClip.published_at).toLocaleDateString()}` : ""}</Text></View>
            {previewClip.subscription_locked ? <Text style={[styles.lockReason, { color: colors.warning }]}>Hidden from customers · Upgrade to unlock</Text> : null}
            <View style={[styles.previewMetrics, { borderColor: colors.border }]}>
              <View accessibilityLabel={`${previewClip.views_count} views`} style={styles.previewMetric}><Eye size={17} color={colors.text} /><Text style={[styles.previewMetricText, { color: colors.text }]}>{previewClip.views_count}</Text></View>
              <View accessibilityLabel={`${previewClip.likes_count} likes`} style={styles.previewMetric}><Heart size={17} color={colors.text} /><Text style={[styles.previewMetricText, { color: colors.text }]}>{previewClip.likes_count}</Text></View>
              <View accessibilityLabel={`${previewClip.saves_count} saves`} style={styles.previewMetric}><Bookmark size={17} color={colors.text} /><Text style={[styles.previewMetricText, { color: colors.text }]}>{previewClip.saves_count}</Text></View>
            </View>
            {previewClip.caption?.trim() ? <Text numberOfLines={3} style={[styles.previewCaption, { color: colors.muted }]}>{previewClip.caption.trim()}</Text> : null}
            <View style={[styles.previewActions, { borderTopColor: colors.border }]}>
              <InteropSafePressable accessibilityLabel="View Clip analytics" onPress={() => showAnalytics(previewClip)} style={({ pressed }) => [styles.previewAction, { backgroundColor: `${colors.pink}0D` }, pressed && styles.pressed]}><BarChart3 size={16} color={colors.pink} /><Text style={[styles.actionLabel, { color: colors.pink }]}>Analytics</Text></InteropSafePressable>
              <InteropSafePressable accessibilityLabel="Edit Clip" onPress={() => { const clipId = previewClip.id; closePreview(); openEdit(clipId); }} style={({ pressed }) => [styles.previewAction, pressed && styles.pressed]}><Edit3 size={16} color={colors.pink} /><Text style={[styles.actionLabel, { color: colors.pink }]}>Edit</Text></InteropSafePressable>
              <InteropSafePressable accessibilityLabel="Share Clip" onPress={() => void share(previewClip)} style={({ pressed }) => [styles.previewAction, pressed && styles.pressed]}><Share2 size={16} color={colors.pink} /><Text style={[styles.actionLabel, { color: colors.pink }]}>Share</Text></InteropSafePressable>
              <InteropSafePressable accessibilityLabel="Copy Clip link coming soon" disabled style={[styles.previewAction, styles.actionDisabled]}><Link2 size={16} color={colors.muted} /><Text style={[styles.actionLabel, { color: colors.muted }]}>Copy Link</Text></InteropSafePressable>
            </View>
            <InteropSafePressable accessibilityLabel="Delete Clip" disabled={deletingId === previewClip.id} onPress={() => { const clip = previewClip; closePreview(); remove(clip); }} style={({ pressed }) => [styles.previewDelete, deletingId === previewClip.id && styles.actionDisabled, pressed && styles.pressed]}>{deletingId === previewClip.id ? <ActivityIndicator size="small" color="#DC2626" /> : <Trash2 size={15} color="#DC2626" />}<Text style={styles.previewDeleteText}>{deletingId === previewClip.id ? "Deleting…" : "Delete"}</Text></InteropSafePressable>
          </ScrollView>
        </View>
      </View> : null}
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { width: "100%", maxWidth: 1080, alignSelf: "center", paddingHorizontal: 18, paddingTop: 22, paddingBottom: 34 },
  headerRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22, gap: 14 },
  heading: { ...typeStyles.editorialPageTitle },
  subheading: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 3 },
  primary: { minHeight: 48, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 14 },
  noticeText: { fontSize: typeScale.caption, lineHeight: typeLeading.label },
  sectionTitle: { fontSize: typeScale.body, lineHeight: typeLeading.body, fontWeight: "700" },
  metricGrid: { flexDirection: "row", marginBottom: 18 },
  overviewMetric: { flexShrink: 0, minHeight: 116, borderWidth: 1, borderRadius: 16, paddingHorizontal: 6, paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 4 },
  overviewValue: { fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.editorialCardTitle, fontWeight: "700", fontVariant: ["tabular-nums"] },
  overviewLabel: { fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  limitCard: { width: "100%", minWidth: 0, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  limitTitle: { fontSize: typeScale.body, lineHeight: typeLeading.body, fontWeight: "700" },
  limitText: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 },
  ringLabel: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  ringText: { fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  usageIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  usageChevron: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  tipsCard: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14 },
  tipsTitle: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  tipsIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  tipsGrid: { alignItems: "center", gap: 22, paddingRight: 8 },
  tipRow: { minHeight: 44, maxWidth: 150, flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { flexShrink: 1, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  hdIcon: { width: 29, height: 23, borderWidth: 1.5, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  hdText: { fontSize: 9, fontWeight: "900" },
  tabs: { gap: 9, paddingBottom: 16 },
  tab: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 7 },
  draftBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 15 },
  draftRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10 },
  draftText: { flex: 1, fontSize: typeScale.bodyCompact, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" },
  gridTile: { aspectRatio: 0.78, overflow: "hidden", backgroundColor: "#110D10", borderRadius: 16 },
  mediaPressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },
  thumb: { width: "100%", height: "100%", backgroundColor: "#110D10" },
  mediaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,5,7,.06)" },
  playButton: { position: "absolute", left: "50%", top: "50%", marginLeft: -24, marginTop: -24, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", paddingLeft: 3, backgroundColor: "rgba(255,255,255,.9)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.95)" },
  statusOverlay: { position: "absolute", left: 10, top: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,.92)" },
  tileFooter: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 110, paddingHorizontal: 14, paddingTop: 42, paddingBottom: 14, justifyContent: "flex-end" },
  tileTitle: { maxWidth: "88%", color: "#FFF", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, fontWeight: "700" },
  tileViews: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 },
  menuButton: { position: "absolute", right: 5, bottom: 7, width: 44, height: 44, alignItems: "center", justifyContent: "center", zIndex: 3 },
  mediaMetricText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700", fontVariant: ["tabular-nums"] },
  lockBadge: { minHeight: 26, borderRadius: 9, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  lockBadgeText: { fontSize: typeScale.caption, fontWeight: "700" },
  lockReason: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "600", marginTop: 5 },
  actionDisabled: { opacity: 0.42 },
  actionLabel: { fontSize: typeScale.caption, fontWeight: "700" },
  empty: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 30, alignItems: "center" },
  emptyIllustration: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyTitle: { maxWidth: 460, fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.editorialCardTitle, fontWeight: "700", marginTop: 12, textAlign: "center" },
  emptyText: { maxWidth: 430, fontSize: typeScale.bodyCompact, textAlign: "center", marginTop: 5, lineHeight: typeLeading.bodyCompact },
  emptyButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 17, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 7 },
  actionBackdrop: { flex: 1, backgroundColor: "rgba(10,7,9,.55)" },
  actionCenter: { alignItems: "center", justifyContent: "center", padding: 24 },
  actionBottom: { justifyContent: "flex-end" },
  actionSheet: { width: "100%", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 20 },
  actionSheetDesktop: { maxWidth: 360, borderRadius: 16 },
  actionSheetMobile: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  actionSheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  actionSheetTitle: { fontSize: typeScale.body, lineHeight: typeLeading.body, fontWeight: "700", paddingHorizontal: 10, paddingBottom: 8 },
  sheetAction: { minHeight: 48, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  sheetActionText: { fontSize: typeScale.bodyCompact, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,7,9,.82)" },
  modalCenter: { alignItems: "center", justifyContent: "center", padding: 24 },
  modalBottom: { justifyContent: "flex-end" },
  previewPanel: { position: "relative", width: "100%", overflow: "hidden" },
  previewPanelDesktop: { maxWidth: 520, maxHeight: "92%", borderRadius: 16 },
  previewPanelMobile: { height: "96%", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  videoFrame: { width: "100%", backgroundColor: "#090708", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewDetails: { flex: 1 },
  previewDetailsContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18 },
  previewTitle: { fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.editorialCardTitle, fontWeight: "700" },
  previewMeta: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  previewDate: { flex: 1, minWidth: 0, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  closeButton: { position: "absolute", top: 12, right: 12, zIndex: 5, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(8,5,7,.68)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.28)", alignItems: "center", justifyContent: "center" },
  previewCaption: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginTop: 10 },
  previewMetrics: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 22, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  previewMetric: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  previewMetricText: { fontSize: typeScale.metadata, fontWeight: "700" },
  previewActions: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  previewAction: { minHeight: 42, paddingHorizontal: 9, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  previewDelete: { alignSelf: "flex-end", minHeight: 40, paddingHorizontal: 8, marginTop: 4, flexDirection: "row", alignItems: "center", gap: 5 },
  previewDeleteText: { color: "#DC2626", fontSize: typeScale.caption, fontWeight: "700" },
});
