import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, CircleAlert, ImagePlus, Play, Save, Upload, Video } from "lucide-react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { ClipDraftService, ClipManagementService, ClipQueueService, deleteLocalClipMedia, pickClipThumbnail, pickClipVideos } from "@/clips/services";
import { useClipUploadQueue } from "@/clips/hooks";
import { UploadQueuePanel } from "@/clips/components";
import type { ClipDraftRecord, ClipUpload } from "@/clips/types";
import { validateClipSource } from "@/clips/utils/validation";
import PremiumRouteGate from "@/components/subscriptions/PremiumRouteGate";
import { usePublicClipsAvailability } from "@/hooks/usePublicClipsAvailability";
import { typeScale } from "@/constants/typography";
import PageLoader from "@/components/loading/PageLoader";
import { useAppFeedback } from "@/context/AppFeedbackContext";
import { KeyboardAwareScrollView, KeyboardAwareTextInput } from "@/components/keyboard/KeyboardAwareScrollView";

function Preview({ source }: { source: ClipUpload }) {
  const player = useVideoPlayer(source.uri, (instance) => { instance.loop = true; });
  return <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />;
}

export default function VendorClipUpload() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess, showError } = useAppFeedback();
  const { data, loading } = useVendorWorkspace();
  // Defense-in-depth: a vendor can already be sitting on this screen when
  // Admin flips Public Clips OFF. This reuses the same focus/app-active
  // refresh as VendorClips -- no polling -- and fails closed (null counts
  // as disabled) so submit is blocked before the setting is confirmed on.
  const publicClipsEnabled = usePublicClipsAvailability();
  const uploadDisabled = publicClipsEnabled !== true;
  const queue = useClipUploadQueue(data.vendor?.id);
  const [sources, setSources] = useState<ClipUpload[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [localDraftId] = useState(() => draftId || `${Date.now()}`);
  const categoryId = data.vendor?.category_id ?? "";
  const categoryMissing = !categoryId;
  const desktop = width >= 800;
  const internalTitle = title.trim() || `${data.vendor?.business_name || "RoyalLagn"} wedding clip`;

  useEffect(() => {
    if (!draftId || !data.vendor?.id) return;
    ClipDraftService.list().then((drafts) => {
      // Drafts are stored on-device under a single shared key -- guard here
      // too (defense in depth alongside useVendorClipOverview's own filter)
      // so a draftId can never resolve to a different vendor's draft.
      const draft = drafts.find((item) => item.id === draftId && item.vendorId === data.vendor.id);
      if (!draft) return;
      setTitle(draft.title); setCaption(draft.caption);
      setThumbnailUri(draft.customThumbnailUri);
      setSources(draft.sources?.length ? draft.sources : draft.source ? [draft.source] : []);
    });
  }, [draftId, data.vendor?.id]);

  useEffect(() => {
    if (!data.vendor?.id || (!sources.length && !title.trim() && !caption.trim())) return;
    const timer = setTimeout(() => {
      void ClipDraftService.save({
        id: localDraftId,
        vendorId: data.vendor.id,
        categoryId,
        title: internalTitle,
        caption,
        source: sources[0] ?? null,
        sources,
        customThumbnailUri: thumbnailUri,
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [caption, categoryId, data.vendor?.id, internalTitle, localDraftId, sources, thumbnailUri, title]);

  const selectVideos = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await pickClipVideos(10);
      picked.forEach(validateClipSource);
      if (!picked.length) return;
      await Promise.all(sources.map((source) =>
        ClipQueueService.isLocalUriInUse(source.uri) ? Promise.resolve() : deleteLocalClipMedia(source.uri),
      ));
      setSources(picked);
    } catch (error) {
      Alert.alert("Video not selected", error instanceof Error ? error.message : "Choose a supported video.");
    } finally { setPicking(false); }
  };

  const saveDraft = async () => {
    if (!data.vendor?.id) return;
    const record: ClipDraftRecord = {
      id: localDraftId,
      vendorId: data.vendor.id, categoryId, title: internalTitle, caption,
      source: sources[0] ?? null, sources, customThumbnailUri: thumbnailUri,
      updatedAt: new Date().toISOString(),
    };
    try {
      await ClipDraftService.save(record);
      showSuccess("Clip draft saved");
    } catch {
      showError("Clip draft could not be saved");
    }
  };

  const drafts = useMemo(() => sources.map((source, index) => ({
    vendorId: data.vendor?.id || "",
    categoryId,
    title: sources.length === 1 ? internalTitle : `${internalTitle} ${index + 1}`,
    caption: caption.trim(),
    source,
    customThumbnailUri: thumbnailUri,
  })), [caption, categoryId, data.vendor?.id, internalTitle, sources, thumbnailUri]);

  const [submitting, setSubmitting] = useState(false);
  // A ref, not just the `submitting` state, gates re-entrancy: two taps fired
  // in the same tick (a fast double-tap, or two touch pointers) can both read
  // `submitting` as false because React hasn't committed the state update
  // from the first tap's setSubmitting(true) yet. The ref is set synchronously
  // before anything else runs, closing that window; `submitting` still drives
  // the visible disabled/spinner state.
  const submittingRef = useRef(false);
  const submit = async () => {
    // Each call to queue.enqueue() below mints brand-new queue item ids, so a
    // duplicate dispatch here would enqueue two independent uploads (two
    // reservations, two Bunny assets, two Clip rows) for the same
    // selection.
    if (submittingRef.current) return;
    if (uploadDisabled) return;
    if (!data.vendor?.is_verified) return Alert.alert("Approved Vendor required");
    if (!categoryId) {
      return Alert.alert(
        "Business category required",
        "Complete your Business information before uploading a Clip.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Complete profile", onPress: () => router.push("/VendorEditBusinessInfo") },
        ],
      );
    }
    if (!sources.length) return Alert.alert("Complete your Clip", "Select at least one video before uploading.");
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await queue.enqueue(drafts);
      await ClipDraftService.remove(localDraftId);
    } catch (error) {
      Alert.alert("Upload not queued", error instanceof Error ? error.message : "Try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const selectThumbnail = async () => {
    try {
      const picked = await pickClipThumbnail();
      if (!picked) return;
      const previous = thumbnailUri;
      setThumbnailUri(picked);
      if (previous && previous !== picked && !ClipQueueService.isLocalUriInUse(previous)) {
        await deleteLocalClipMedia(previous);
      }
    } catch (error) {
      Alert.alert("Thumbnail not selected", error instanceof Error ? error.message : "Choose a supported image.");
    }
  };

  const limitFailure = queue.items.find((item) => item.error?.includes("reached your limit"));
  const retryQueueItem = queue.retry;
  useEffect(() => {
    if (!limitFailure || !data.vendor?.id) return;
    Alert.alert(limitFailure.error || "Clip limit reached", "Choose how you want to continue.", [
      { text: "Cancel", style: "cancel" },
      { text: "Choose Existing", onPress: () => router.push("/VendorClips") },
      { text: "Replace Oldest", onPress: async () => {
        try {
          await ClipManagementService.replaceOldest(data.vendor.id);
          await retryQueueItem(limitFailure.id);
        } catch (error) {
          Alert.alert("Unable to replace Clip", error instanceof Error ? error.message : "Try again.");
        }
      } },
    ]);
  }, [data.vendor?.id, limitFailure, retryQueueItem, router]);

  if (loading) return <PageLoader />;
  return <PremiumRouteGate feature="upload_clips"><View style={[styles.root, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <KeyboardAwareScrollView avoidKeyboardOnAndroid contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]}>
      <View style={styles.titleRow}><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]}><ChevronLeft size={20} color={colors.text} /></Pressable><View><Text style={[styles.heading, { color: colors.text }]}>Share a Clip</Text><Text style={[styles.subheading, { color: colors.muted }]}>Choose a wedding video, add a caption and share</Text></View></View>
      <View style={desktop ? styles.columns : undefined}>
        <View style={desktop ? styles.column : undefined}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {!sources.length ? <Pressable disabled={picking} onPress={selectVideos} style={[styles.picker, { backgroundColor: colors.surfaceSoft, borderColor: colors.pink }]}>{picking ? <ActivityIndicator color={colors.pink} /> : <><Video size={38} color={colors.pink} /><Text style={[styles.pickerTitle, { color: colors.text }]}>Select one or more videos</Text><Text style={[styles.helper, { color: colors.muted }]}>Up to 40 MB · clips over 20 MB are compressed before upload</Text><Text style={[styles.helper, { color: colors.muted }]}>MP4, MOV, M4V or HEVC</Text></>}</Pressable> :
              <><View style={styles.preview}>{sources.length === 1 ? <Preview source={sources[0]} /> : <View style={styles.multi}><Play size={36} color={colors.pink} /><Text style={[styles.pickerTitle, { color: colors.text }]}>{sources.length} videos selected</Text></View>}</View><Pressable disabled={picking} onPress={selectVideos} style={styles.link}><Text style={{ color: colors.pink, fontWeight: "700", fontSize: typeScale.bodyCompact }}>{picking ? "Selecting…" : "Choose different videos"}</Text></Pressable></>}
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Cover thumbnail (optional)</Text>
            <Pressable onPress={selectThumbnail} style={[styles.thumbPicker, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
              {thumbnailUri ? <Image source={{ uri: thumbnailUri }} style={styles.cover} /> : <><ImagePlus size={24} color={colors.pink} /><Text style={[styles.helper, { color: colors.muted }]}>Automatic thumbnail will be generated</Text></>}
            </Pressable>
          </View>
        </View>
        <View style={desktop ? styles.column : undefined}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Caption</Text><KeyboardAwareTextInput value={caption} onChangeText={setCaption} maxLength={2200} multiline placeholder="Tell couples about this wedding moment…" placeholderTextColor={colors.muted} style={[styles.input, styles.caption, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} />
            <Text style={[styles.captionCount, { color: colors.muted }]}>{caption.length}/2200</Text>
            {categoryMissing ? (
              <View accessibilityRole="alert" style={[styles.categoryWarning, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
                <CircleAlert size={19} color={colors.pink} />
                <View style={styles.warningCopy}>
                  <Text style={[styles.warningTitle, { color: colors.text }]}>Complete your business category</Text>
                  <Text style={[styles.warningText, { color: colors.muted }]}>Your Clip will automatically use the category saved in Business information.</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.push("/VendorEditBusinessInfo")} style={[styles.categoryAction, { backgroundColor: colors.pink }]}>
                  <Text style={styles.categoryActionText}>Update</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.buttonRow}><Pressable onPress={saveDraft} style={[styles.secondary, { borderColor: colors.border }]}><Save size={17} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "700" }}>Save Draft</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Upload Clip" accessibilityState={{ disabled: submitting || uploadDisabled || categoryMissing }} disabled={submitting || uploadDisabled || categoryMissing} onPress={submit} style={[styles.primary, { backgroundColor: colors.pink }, (submitting || uploadDisabled || categoryMissing) && styles.primaryDisabled]}>{submitting ? <ActivityIndicator color="#FFF" size="small" /> : <Upload size={17} color="#FFF" />}<Text style={styles.primaryText}>{submitting ? "Queuing…" : "Upload Clip"}</Text></Pressable></View>
          </View>
          <UploadQueuePanel items={queue.items} colors={colors} onRetry={queue.retry} onCancel={queue.cancel} onRemove={queue.remove} />
        </View>
      </View>
    </KeyboardAwareScrollView>
  </View></PremiumRouteGate>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, scroll: { padding: 18, paddingBottom: 60, gap: 16 }, desktopScroll: { width: "100%", maxWidth: 1120, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, heading: { fontSize: typeScale.metric, fontWeight: "700" }, subheading: { fontSize: typeScale.caption, marginTop: 3 },
  columns: { flexDirection: "row", gap: 18 }, column: { flex: 1, gap: 16 }, card: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 15 },
  picker: { minHeight: 240, borderWidth: 1, borderStyle: "dashed", borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 8 }, pickerTitle: { fontSize: typeScale.body, fontWeight: "700" }, helper: { fontSize: typeScale.caption, textAlign: "center" },
  preview: { height: 270, borderRadius: 16, overflow: "hidden", backgroundColor: "#080808" }, video: { width: "100%", height: "100%" }, multi: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 }, link: { paddingTop: 13, alignItems: "center" },
  label: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginBottom: 7, marginTop: 4 }, thumbPicker: { height: 150, borderWidth: 1, borderStyle: "dashed", borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 8 }, cover: { width: "100%", height: "100%" },
  input: { borderWidth: 1, minHeight: 50, borderRadius: 15, paddingHorizontal: 14, fontSize: typeScale.bodyCompact, marginBottom: 15 }, caption: { minHeight: 128, paddingTop: 13, textAlignVertical: "top", marginBottom: 5 }, captionCount: { alignSelf: "flex-end", fontSize: typeScale.caption, marginBottom: 12 },
  categoryWarning: { minHeight: 72, borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 }, warningCopy: { flex: 1, minWidth: 0 }, warningTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" }, warningText: { fontSize: typeScale.caption, lineHeight: 18, marginTop: 3 }, categoryAction: { minWidth: 68, minHeight: 44, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, categoryActionText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 4 }, secondary: { flex: 1, height: 48, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primary: { flex: 1.2, height: 48, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryDisabled: { opacity: 0.65 }, primaryText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
});
