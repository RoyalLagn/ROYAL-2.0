import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronLeft, ImagePlus, Save } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import PortfolioVideoPlayer from "@/components/vendor/PortfolioVideoPlayer";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useCategories } from "@/context/CategoryContext";
import { supabase } from "@/services/supabase";
import { ClipManagementService, pickClipThumbnail } from "@/clips/services";
import type { ClipVisibility } from "@/clips/types";
import { ClipStatusBadge } from "@/clips/components";
import PremiumRouteGate from "@/components/subscriptions/PremiumRouteGate";
import PageLoader from "@/components/loading/PageLoader";
import { typeScale } from "@/constants/typography";
import { useAppFeedback } from "@/context/AppFeedbackContext";

export default function VendorClipEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const { registrationCategories: categories } = useCategories();
  const [clip, setClip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState<ClipVisibility>("public");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const loadClip = useCallback(async () => {
    const thisRequest = ++requestId.current;
    const isCurrent = () => mounted.current && requestId.current === thisRequest;
    if (!id) {
      if (isCurrent()) { setLoadError("This Clip link is missing an ID."); setLoading(false); }
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // .maybeSingle() (not .single()) so a missing/RLS-hidden/deleted row
      // resolves to `data: null` instead of throwing a PGRST116 error --
      // both cases are handled explicitly below rather than crashing on
      // `data.title` when `data` is null.
      const { data, error } = await supabase.from("clips").select("*").eq("id", id).maybeSingle();
      if (!isCurrent()) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      if (!data) {
        setLoadError("This Clip could not be found. It may have been deleted or is no longer available.");
        return;
      }
      setClip(data);
      setTitle(data.title ?? "");
      setCaption(data.caption ?? "");
      setCategoryId(data.category_id ?? "");
      setVisibility(data.visibility ?? "public");
    } catch (caught) {
      if (isCurrent()) setLoadError(caught instanceof Error ? caught.message : "Unable to load this Clip.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadClip(); }, [loadClip]);

  const save = async () => {
    if (!clip) return;
    if (!title.trim() || !categoryId) return Alert.alert("Title and category are required");
    setSaving(true);
    const result = await ClipManagementService.update(id, { title, caption, categoryId, visibility, currentStatus: clip.status });
    if (!mounted.current) return;
    setSaving(false);
    if (result.error) {
      // A missing/already-deleted row surfaces here (PGRST116) instead of
      // crashing -- .update().select().single() on zero matched rows
      // returns an error rather than throwing.
      const notFound = result.error.code === "PGRST116";
      Alert.alert(
        notFound ? "Clip no longer exists" : "Clip not saved",
        notFound ? "This Clip was deleted or is no longer accessible." : result.error.message,
        notFound ? [{ text: "OK", onPress: () => router.back() }] : undefined,
      );
    } else {
      showSuccess("Clip updated");
      router.back();
    }
  };
  const replaceThumbnail = async () => {
    const uri = await pickClipThumbnail();
    if (!uri || !clip) return;
    setSaving(true);
    try {
      const result = await ClipManagementService.replaceThumbnail(clip.id, clip.vendor_id, uri);
      if (result.error) throw result.error;
      if (mounted.current) {
        setClip(result.data);
        showSuccess("Cover thumbnail updated");
      }
    } catch (error) {
      if (mounted.current) Alert.alert("Thumbnail not replaced", error instanceof Error ? error.message : "Try again.");
    } finally { if (mounted.current) setSaving(false); }
  };

  if (loading) return <PageLoader />;

  if (loadError || !clip) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24, gap: 16 }]}>
        <Text style={[styles.heading, { color: colors.text, textAlign: "center" }]}>Clip not found</Text>
        <Text style={{ color: colors.muted, textAlign: "center", fontSize: typeScale.body }}>
          {loadError ?? "This Clip could not be found."}
        </Text>
        <Pressable
          onPress={() => (router.canGoBack?.() ? router.back() : router.replace("/VendorClips"))}
          style={[styles.primary, { backgroundColor: colors.pink, paddingHorizontal: 24, alignSelf: "center" }]}
        >
          <ChevronLeft size={17} color="#FFF" />
          <Text style={styles.primaryText}>Back to Clips</Text>
        </Pressable>
      </View>
    );
  }
  return <PremiumRouteGate feature="upload_clips"><View style={[styles.root, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.titleRow}><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]}><ChevronLeft size={20} color={colors.text} /></Pressable><View style={styles.flex}><Text style={[styles.heading, { color: colors.text }]}>Edit Clip</Text><Text style={[styles.subheading, { color: colors.muted }]}>Video replacement is disabled after upload</Text></View><ClipStatusBadge status={clip.status} /></View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.video}><PortfolioVideoPlayer uri={clip.video_url} /></View>
        <Text style={[styles.label, { color: colors.text }]}>Cover thumbnail</Text><Pressable onPress={replaceThumbnail} style={styles.thumbnail}><Image source={{ uri: clip.thumbnail_url }} style={styles.image} /><View style={styles.overlay}><ImagePlus size={20} color="#FFF" /><Text style={styles.overlayText}>Replace cover</Text></View></Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>Title</Text><TextInput value={title} onChangeText={setTitle} maxLength={120} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} />
        <Text style={[styles.label, { color: colors.text }]}>Caption</Text><TextInput value={caption} onChangeText={setCaption} maxLength={2200} multiline style={[styles.input, styles.caption, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} />
        <Text style={[styles.label, { color: colors.text }]}>Category</Text><Pressable onPress={() => setCategoryOpen((value) => !value)} style={[styles.input, styles.select, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}><Text style={{ color: colors.text }}>{selectedCategory?.name}</Text><ChevronDown size={18} color={colors.muted} /></Pressable>
        {categoryOpen && <View style={[styles.options, { borderColor: colors.border }]}>{categories.map((category) => <Pressable key={category.id} onPress={() => { setCategoryId(category.id); setCategoryOpen(false); }} style={[styles.option, { borderBottomColor: colors.border }]}><Text style={{ color: colors.text }}>{category.name}</Text></Pressable>)}</View>}
        <Text style={[styles.label, { color: colors.text }]}>Visibility</Text><View style={styles.visibility}>{(["public", "unlisted", "private"] as ClipVisibility[]).map((value) => <Pressable key={value} onPress={() => setVisibility(value)} style={[styles.visibilityChoice, { borderColor: visibility === value ? colors.pink : colors.border, backgroundColor: visibility === value ? `${colors.pink}14` : colors.surfaceSoft }]}><Text style={{ color: visibility === value ? colors.pink : colors.muted, fontWeight: "700", fontSize: typeScale.metadata }}>{value}</Text></Pressable>)}</View>
        <Pressable disabled={saving} onPress={save} style={[styles.primary, { backgroundColor: colors.pink }]}>{saving ? <ActivityIndicator color="#FFF" /> : <><Save size={17} color="#FFF" /><Text style={styles.primaryText}>Save Changes</Text></>}</Pressable>
      </View>
    </ScrollView>
  </View></PremiumRouteGate>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, scroll: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 18, paddingBottom: 60 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 16 }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, flex: { flex: 1 }, heading: { fontSize: typeScale.metric, fontWeight: "700" }, subheading: { fontSize: typeScale.caption, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 16 }, video: { height: 300, borderRadius: 16, overflow: "hidden", backgroundColor: "#000", marginBottom: 16 },
  label: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginBottom: 7, marginTop: 4 }, thumbnail: { height: 180, borderRadius: 16, overflow: "hidden" }, image: { width: "100%", height: "100%" }, overlay: { position: "absolute", right: 10, bottom: 10, borderRadius: 12, paddingHorizontal: 11, height: 36, backgroundColor: "rgba(0,0,0,.68)", flexDirection: "row", alignItems: "center", gap: 6 }, overlayText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  input: { borderWidth: 1, minHeight: 50, borderRadius: 15, paddingHorizontal: 14, fontSize: typeScale.bodyCompact, marginBottom: 15 }, caption: { minHeight: 110, paddingTop: 13, textAlignVertical: "top" }, select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  options: { borderWidth: 1, borderRadius: 14, marginTop: -10, marginBottom: 15, maxHeight: 220, overflow: "hidden" }, option: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  visibility: { flexDirection: "row", gap: 8, marginBottom: 20 }, visibilityChoice: { flex: 1, borderWidth: 1, borderRadius: 13, paddingVertical: 12, alignItems: "center" },
  primary: { height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
});
