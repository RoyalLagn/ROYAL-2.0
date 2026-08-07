import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronLeft, ImagePlus, Play, Save, Upload, Video, X } from "lucide-react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useCategories } from "@/context/CategoryContext";
import { ClipDraftService, ClipManagementService, pickClipThumbnail, pickClipVideos } from "@/clips/services";
import { useClipUploadQueue } from "@/clips/hooks";
import { UploadQueuePanel } from "@/clips/components";
import type { ClipDraftRecord, ClipUpload } from "@/clips/types";
import { validateClipSource } from "@/clips/utils/validation";
import PremiumRouteGate from "@/components/subscriptions/PremiumRouteGate";

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
  const { data, loading } = useVendorWorkspace();
  const { registrationCategories: categories } = useCategories();
  const queue = useClipUploadQueue();
  const [sources, setSources] = useState<ClipUpload[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [localDraftId] = useState(() => draftId || `${Date.now()}`);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const desktop = width >= 800;
  const internalTitle = title.trim() || `${data.vendor?.business_name || "RoyalLagn"} wedding clip`;

  useEffect(() => {
    if (!draftId) return;
    ClipDraftService.list().then((drafts) => {
      const draft = drafts.find((item) => item.id === draftId);
      if (!draft) return;
      setTitle(draft.title); setCaption(draft.caption); setCategoryId(draft.categoryId);
      setThumbnailUri(draft.customThumbnailUri);
      setSources(draft.source ? [draft.source] : []);
    });
  }, [draftId]);

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
      source: sources[0] ?? null, customThumbnailUri: thumbnailUri,
      updatedAt: new Date().toISOString(),
    };
    await ClipDraftService.save(record);
    Alert.alert("Draft saved", "You can resume this Clip from Your Clips.");
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
    // reservations, two Cloudinary assets, two Clip rows) for the same
    // selection.
    if (submittingRef.current) return;
    if (!data.vendor?.is_verified) return Alert.alert("Approved Vendor required");
    if (!sources.length || !categoryId) return Alert.alert("Complete your Clip", "Select a video and choose a category.");
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

  if (loading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.pink} /></View>;
  return <PremiumRouteGate feature="upload_clips"><View style={[styles.root, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <ScrollView contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]}><ChevronLeft size={20} color={colors.text} /></Pressable><View><Text style={[styles.heading, { color: colors.text }]}>Share a Clip</Text><Text style={[styles.subheading, { color: colors.muted }]}>Choose a wedding video, add a caption and share</Text></View></View>
      <View style={desktop ? styles.columns : undefined}>
        <View style={desktop ? styles.column : undefined}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {!sources.length ? <Pressable disabled={picking} onPress={selectVideos} style={[styles.picker, { backgroundColor: colors.surfaceSoft, borderColor: colors.pink }]}>{picking ? <ActivityIndicator color={colors.pink} /> : <><Video size={38} color={colors.pink} /><Text style={[styles.pickerTitle, { color: colors.text }]}>Select one or more videos</Text><Text style={[styles.helper, { color: colors.muted }]}>MP4, MOV, M4V or HEVC</Text></>}</Pressable> :
              <><View style={styles.preview}>{sources.length === 1 ? <Preview source={sources[0]} /> : <View style={styles.multi}><Play size={36} color={colors.pink} /><Text style={[styles.pickerTitle, { color: colors.text }]}>{sources.length} videos selected</Text></View>}</View><Pressable disabled={picking} onPress={selectVideos} style={styles.link}><Text style={{ color: colors.pink, fontWeight: "800", fontSize: 12 }}>{picking ? "Selecting…" : "Choose different videos"}</Text></Pressable></>}
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Cover thumbnail (optional)</Text>
            <Pressable onPress={async () => setThumbnailUri(await pickClipThumbnail())} style={[styles.thumbPicker, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
              {thumbnailUri ? <Image source={{ uri: thumbnailUri }} style={styles.cover} /> : <><ImagePlus size={24} color={colors.pink} /><Text style={[styles.helper, { color: colors.muted }]}>Automatic thumbnail will be generated</Text></>}
            </Pressable>
          </View>
        </View>
        <View style={desktop ? styles.column : undefined}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Caption</Text><TextInput value={caption} onChangeText={setCaption} maxLength={2200} multiline placeholder="Tell couples about this wedding moment…" placeholderTextColor={colors.muted} style={[styles.input, styles.caption, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} />
            <Text style={[styles.captionCount, { color: colors.muted }]}>{caption.length}/2200</Text>
            <Text style={[styles.label, { color: colors.text }]}>Category</Text><Pressable onPress={() => setCategoryOpen(true)} style={[styles.input, styles.select, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}><Text style={{ color: selectedCategory ? colors.text : colors.muted }}>{selectedCategory?.name || "Choose category"}</Text><ChevronDown size={18} color={colors.muted} /></Pressable>
            <View style={styles.buttonRow}><Pressable onPress={saveDraft} style={[styles.secondary, { borderColor: colors.border }]}><Save size={17} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "800" }}>Save Draft</Text></Pressable><Pressable disabled={submitting} onPress={submit} style={[styles.primary, { backgroundColor: colors.pink }, submitting && styles.primaryDisabled]}>{submitting ? <ActivityIndicator color="#FFF" size="small" /> : <Upload size={17} color="#FFF" />}<Text style={styles.primaryText}>{submitting ? "Queuing…" : "Upload Clip"}</Text></Pressable></View>
          </View>
          <UploadQueuePanel items={queue.items} colors={colors} onRetry={queue.retry} onCancel={queue.cancel} onRemove={queue.remove} />
        </View>
      </View>
    </ScrollView>
    <Modal visible={categoryOpen} transparent animationType="fade"><Pressable onPress={() => setCategoryOpen(false)} style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}><View style={styles.sheetHead}><Text style={[styles.heading2, { color: colors.text }]}>Choose category</Text><Pressable onPress={() => setCategoryOpen(false)}><X color={colors.text} /></Pressable></View><ScrollView>{categories.map((category) => <Pressable key={category.id} onPress={() => { setCategoryId(category.id); setCategoryOpen(false); }} style={[styles.category, { borderBottomColor: colors.border }]}><Text style={{ color: colors.text }}>{category.name}</Text></Pressable>)}</ScrollView></View></Pressable></Modal>
  </View></PremiumRouteGate>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, scroll: { padding: 18, paddingBottom: 60, gap: 16 }, desktopScroll: { width: "100%", maxWidth: 1120, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, heading: { fontSize: 23, fontWeight: "900" }, subheading: { fontSize: 10, marginTop: 3 },
  columns: { flexDirection: "row", gap: 18 }, column: { flex: 1, gap: 16 }, card: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 15 },
  picker: { minHeight: 240, borderWidth: 1, borderStyle: "dashed", borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 8 }, pickerTitle: { fontSize: 14, fontWeight: "800" }, helper: { fontSize: 10, textAlign: "center" },
  preview: { height: 270, borderRadius: 16, overflow: "hidden", backgroundColor: "#080808" }, video: { width: "100%", height: "100%" }, multi: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 }, link: { paddingTop: 13, alignItems: "center" },
  label: { fontSize: 12, fontWeight: "800", marginBottom: 7, marginTop: 4 }, thumbPicker: { height: 150, borderWidth: 1, borderStyle: "dashed", borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 8 }, cover: { width: "100%", height: "100%" },
  input: { borderWidth: 1, minHeight: 50, borderRadius: 15, paddingHorizontal: 14, fontSize: 12, marginBottom: 15 }, caption: { minHeight: 128, paddingTop: 13, textAlignVertical: "top", marginBottom: 5 }, captionCount: { alignSelf: "flex-end", fontSize: 9, marginBottom: 12 }, select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 4 }, secondary: { flex: 1, height: 48, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primary: { flex: 1.2, height: 48, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryDisabled: { opacity: 0.65 }, primaryText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "flex-end" }, sheet: { maxHeight: "70%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }, sheetHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }, heading2: { fontSize: 18, fontWeight: "900" }, category: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
});
