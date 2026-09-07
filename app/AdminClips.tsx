import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ban, Eye, Heart, RefreshCw, Search, Trash2, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { AdminReveal } from "@/components/admin/ui/AdminReveal";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import ClipAnalyticsSection from "@/components/admin/clips/ClipAnalyticsSection";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminClip } from "@/services/adminOperations";
import { getPublicClipsEnabled, setPublicClipsEnabled } from "@/services/publicClipsAvailability";
import { useCategories } from "@/context/CategoryContext";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";
import { PublicClipVideo, PublicClipVideoBoundary } from "@/clips/components";
import { DateField } from "@/components/admin/crm/ui/DateField";
import { adminPalette } from "@/theme";

const PAGE_SIZE = 16;
const UNCATEGORIZED = "__uncategorized__";

export default function AdminClips() {
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const { categories } = useCategories();
  const [items, setItems] = useState<AdminClip[]>([]);
  const [query, setQuery] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicClipsEnabled, setPublicClipsEnabledState] = useState<boolean | null>(null);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState<AdminClip | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [softBanTarget, setSoftBanTarget] = useState<AdminClip | null>(null);
  const [softBanReason, setSoftBanReason] = useState("");
  const [softBanning, setSoftBanning] = useState(false);
  const [softBanError, setSoftBanError] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<AdminClip | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try { setItems(await AdminOperationsService.clips()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load clips."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    void load();
    return AdminOperationsService.subscribe("clips", () => void load(true));
  }, [load]);

  useEffect(() => {
    let active = true;
    getPublicClipsEnabled()
      .then((enabled) => { if (active) setPublicClipsEnabledState(enabled); })
      .catch(() => { if (active) setAvailabilityError("Unable to load the public Clips status."); });
    return () => { active = false; };
  }, []);

  const updatePublicClips = async (enabled: boolean) => {
    if (availabilitySaving || publicClipsEnabled === null) return;
    setAvailabilitySaving(true);
    setAvailabilityError("");
    try {
      const saved = await setPublicClipsEnabled(enabled);
      setPublicClipsEnabledState(saved);
    } catch (cause) {
      setAvailabilityError(cause instanceof Error ? cause.message : "Unable to update public Clips.");
      Alert.alert("Public Clips", "The setting could not be saved. Try again.");
    } finally {
      setAvailabilitySaving(false);
    }
  };

  // "All Clips" excludes only already soft-deleted historical rows (from the
  // legacy moderation/vendor-self-delete workflow) — every other status is
  // shown, since this page no longer has a moderation queue.
  const notDeleted = useMemo(() => items.filter((item) => item.status !== "deleted"), [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const vendorNeedle = vendorQuery.trim().toLowerCase();
    return notDeleted.filter((item) => {
      const matchesCategory = categoryId === "all"
        || (categoryId === UNCATEGORIZED ? !item.category_id : item.category_id === categoryId);
      const matchesSearch = !needle || [item.title, item.caption].some((value) => value?.toLowerCase().includes(needle));
      const matchesVendor = !vendorNeedle || item.vendor_name.toLowerCase().includes(vendorNeedle);
      const clipDate = (item.published_at || item.created_at).slice(0, 10);
      const matchesFrom = !fromDate || clipDate >= fromDate;
      const matchesTo = !toDate || clipDate <= toDate;
      return matchesCategory && matchesSearch && matchesVendor && matchesFrom && matchesTo;
    });
  }, [notDeleted, query, vendorQuery, categoryId, fromDate, toDate]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const categoryOptions = useMemo(() => [
    { id: "all", name: "All Categories" },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
    { id: UNCATEGORIZED, name: "Uncategorized" },
  ], [categories]);

  const openDelete = (clip: AdminClip) => { setDeleteTarget(clip); setReason(""); setDeleteError(null); };
  const closeDelete = () => { if (deleting) return; setDeleteTarget(null); setReason(""); setDeleteError(null); };
  const openSoftBan = (clip: AdminClip) => { setSoftBanTarget(clip); setSoftBanReason(""); setSoftBanError(null); };
  const closeSoftBan = () => { if (softBanning) return; setSoftBanTarget(null); setSoftBanReason(""); setSoftBanError(null); };

  const confirmDelete = async () => {
    if (!deleteTarget || !reason.trim()) return;
    setDeleting(true); setDeleteError(null);
    try {
      await AdminOperationsService.deleteClip(deleteTarget.id, reason.trim());
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null); setReason("");
      Alert.alert("Clip deleted successfully and the vendor has been notified.");
    } catch (cause) {
      const stage = (cause as { stage?: string })?.stage;
      const message = cause instanceof Error ? cause.message : "Unable to delete this clip. Try again.";
      setDeleteError(
        stage === "notification"
          ? "Vendor notification could not be sent. The clip was not deleted."
          : message,
      );
      // Never a false success, and the clip stays in the list either way
      // until deletion is actually confirmed by the server.
    } finally {
      setDeleting(false);
    }
  };

  const confirmSoftBan = async () => {
    if (!softBanTarget || !softBanReason.trim()) return;
    setSoftBanning(true); setSoftBanError(null);
    try {
      await AdminOperationsService.moderateClip(softBanTarget.id, "hidden", softBanReason.trim());
      setItems((current) => current.map((item) => item.id === softBanTarget.id ? { ...item, status: "hidden", visibility: "private", moderation_reason: softBanReason.trim() } : item));
      setSoftBanTarget(null); setSoftBanReason("");
      Alert.alert("Clip hidden", "This clip is no longer visible on public Clips. The vendor record was kept.");
    } catch (cause) {
      setSoftBanError(cause instanceof Error ? cause.message : "Unable to hide this clip. Try again.");
    } finally {
      setSoftBanning(false);
    }
  };

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} decelerationRate="fast" contentContainerStyle={{ paddingBottom: 72 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={adminPalette.brand} />}>
      <ResponsiveContainer>
        <AdminPageHeader title="Clips" subtitle="Review vendor content and remove clips that do not belong" action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh clips" onPress={() => void load(true)} className="w-11 h-11 rounded-xl border border-border bg-card items-center justify-center hover:bg-muted active:bg-muted transition-colors duration-200"><RefreshCw size={19} className="text-primary" /></Pressable>} />
        <View className="bg-card border border-border rounded-2xl px-4 py-4 mb-5 flex-row items-center gap-4">
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2">
              <Text className="text-foreground text-base font-bold">Public Clips</Text>
              {publicClipsEnabled !== null ? <View className={`rounded-full px-2.5 py-1 ${publicClipsEnabled ? "bg-green-500/10" : "bg-primary/10"}`}><Text className={`text-xs font-bold ${publicClipsEnabled ? "text-green-700" : "text-primary"}`}>{publicClipsEnabled ? "ACTIVE" : "COMING SOON"}</Text></View> : null}
            </View>
            <Text className={`text-sm leading-5 mt-1 ${availabilityError ? "text-destructive" : "text-muted-foreground"}`}>
              {availabilityError || (publicClipsEnabled === null ? "Checking the public Clips status…" : publicClipsEnabled ? "Public users can browse and watch Clips." : "Public users see a coming-soon message. Vendor Clips remain available.")}
            </Text>
          </View>
          {publicClipsEnabled === null ? <ActivityIndicator color={adminPalette.brand} /> : <Switch accessibilityLabel="Public Clips availability" accessibilityHint="Controls whether Clips are available in the public app" accessibilityState={{ checked: publicClipsEnabled, disabled: availabilitySaving, busy: availabilitySaving }} value={publicClipsEnabled} disabled={availabilitySaving} onValueChange={(value) => void updatePublicClips(value)} trackColor={{ false: "#D6D1D4", true: "#BFD8F5" }} thumbColor={publicClipsEnabled ? adminPalette.brand : "#FFFFFF"} />}
        </View>
        <ClipAnalyticsSection />
        <View className="mb-4"><Text className="text-foreground text-xl font-bold">All Clips</Text><Text className="text-muted-foreground text-sm mt-1">Review clips by title, vendor, category, or publish date.</Text></View>
        <View className="bg-card border border-border rounded-2xl p-4 mb-3 gap-3">
          <View className={desktop ? "flex-row gap-3" : "gap-3"}>
            <FilterSearch label="Search clips" value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Title or caption" />
            <FilterSearch label="Vendor name" value={vendorQuery} onChange={(value) => { setVendorQuery(value); setPage(1); }} placeholder="Search vendor" />
          </View>
          <View className={desktop ? "flex-row items-end gap-3" : "gap-3"}>
            <View className="flex-1 min-w-0"><HierarchySelect label="Category" value={categoryOptions.find((option) => option.id === categoryId)?.name} options={categoryOptions} selectedId={categoryId} onSelect={(id) => { setCategoryId(id); setPage(1); }} /></View>
            <View className="flex-1 min-w-0"><DateField label="From date" value={fromDate} onChange={(value) => { setFromDate(value); setPage(1); }} maximumDate={toDate || undefined} /></View>
            <View className="flex-1 min-w-0"><DateField label="To date" value={toDate} onChange={(value) => { setToDate(value); setPage(1); }} minimumDate={fromDate || undefined} /></View>
            {(query || vendorQuery || categoryId !== "all" || fromDate || toDate) ? <Pressable accessibilityRole="button" accessibilityLabel="Clear clip filters" className="min-h-12 px-4 rounded-xl border border-border items-center justify-center active:bg-muted" onPress={() => { setQuery(""); setVendorQuery(""); setCategoryId("all"); setFromDate(""); setToDate(""); setPage(1); }}><Text className="text-foreground text-xs font-bold">Clear filters</Text></Pressable> : null}
          </View>
        </View>
        <Text className="text-muted-foreground text-xs mb-3">{filtered.length} clip{filtered.length === 1 ? "" : "s"} · showing {visible.length} on this page</Text>
        {loading ? <AdminLoadingState label="Loading clips…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No clips found" message="Try another search or category filter." /> : <View className={desktop ? "flex-row flex-wrap justify-between gap-y-3" : "gap-3"}>{visible.map((clip, index) => <View key={clip.id} style={desktop ? { width: "23.8%" } : undefined}><AdminReveal index={index}><ClipCard compact={desktop} clip={clip} onPreview={() => { setPreviewMuted(true); setPreviewClip(clip); }} onSoftBan={() => openSoftBan(clip)} onDelete={() => openDelete(clip)} /></AdminReveal></View>)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={Math.min(page, pages)} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView>
    <AdminFooter activeTab="profile" />

    <Modal visible={Boolean(previewClip)} transparent animationType="fade" onRequestClose={() => setPreviewClip(null)}>
      {previewClip ? <View className={`flex-1 bg-black/80 ${desktop ? "items-center justify-center p-6" : "justify-end"}`}>
        <Pressable accessibilityLabel="Close clip preview" className="absolute inset-0" onPress={() => setPreviewClip(null)} />
        <View className={`w-full bg-card overflow-hidden ${desktop ? "max-w-5xl max-h-[90%] rounded-3xl flex-row" : "max-h-[92%] rounded-t-3xl"}`}>
          <View className={`bg-black items-center justify-center ${desktop ? "w-[46%] min-h-[620px]" : "h-[58vh]"}`}>
            <PublicClipVideoBoundary posterUri={previewClip.thumbnail_url}>
              <PublicClipVideo
                uri={previewClip.video_url}
                thumbnailUrl={previewClip.thumbnail_url}
                sourceWidth={1080}
                sourceHeight={1920}
                active
                muted={previewMuted}
                width={desktop ? Math.min(520, width * 0.46) : width}
                height={desktop ? Math.min(760, height * 0.8) : height * 0.58}
                onToggleMuted={() => setPreviewMuted((current) => !current)}
                onDoubleTapLike={() => {}}
              />
            </PublicClipVideoBoundary>
          </View>
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            <View className="flex-row items-start gap-3">
              <View className="flex-1 min-w-0"><Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Admin review</Text><Text className="text-foreground text-xl font-bold mt-2" numberOfLines={2}>{previewClip.title}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close preview" className="w-11 h-11 rounded-xl border border-border items-center justify-center active:bg-muted" onPress={() => setPreviewClip(null)}><X size={20} className="text-foreground" /></Pressable>
            </View>
            <View className="self-start mt-4 px-3 py-1.5 rounded-full bg-primary/10"><Text className="text-primary text-xs font-bold uppercase">{previewClip.status}</Text></View>
            <View className="mt-6 pb-5 border-b border-border"><Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Vendor</Text><Text className="text-foreground text-base font-bold mt-2">{previewClip.vendor_name}</Text><Text className="text-muted-foreground text-sm mt-1">{previewClip.category_name}</Text></View>
            {previewClip.caption ? <View className="mt-5"><Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Caption</Text><Text className="text-foreground text-sm leading-6 mt-2">{previewClip.caption}</Text></View> : null}
            <View className="flex-row flex-wrap gap-3 mt-6"><ClipMetric label="Views" value={previewClip.views_count} icon={Eye} /><ClipMetric label="Likes" value={previewClip.likes_count} icon={Heart} /><ClipMetric label="Saves" value={previewClip.saves_count} icon={Heart} /></View>
            <Text className="text-muted-foreground text-xs mt-5">Published {formatClipDate(previewClip.published_at || previewClip.created_at)}</Text>
            <View className="flex-row gap-3 mt-6"><Pressable accessibilityRole="button" accessibilityLabel={`Hide ${previewClip.title} from public Clips`} onPress={() => { setPreviewClip(null); openSoftBan(previewClip); }} className="flex-1 min-h-12 rounded-xl border border-amber-500/50 flex-row items-center justify-center gap-2 active:bg-amber-500/10"><Ban size={16} color="#B76A00" /><Text className="text-amber-700 text-sm font-bold">Soft ban</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${previewClip.title}`} onPress={() => { setPreviewClip(null); openDelete(previewClip); }} className="flex-1 min-h-12 rounded-xl border border-red-400 flex-row items-center justify-center gap-2 active:bg-red-500/10"><Trash2 size={16} color="#DC3545" /><Text className="text-red-500 text-sm font-bold">Delete</Text></Pressable></View>
          </ScrollView>
        </View>
      </View> : null}
    </Modal>

    <Modal visible={Boolean(softBanTarget)} transparent animationType="fade" onRequestClose={closeSoftBan}>
      <View className="flex-1 bg-black/60 items-center justify-center px-5"><View className="bg-card rounded-3xl p-5 w-full max-w-lg">
        <View className="flex-row items-center"><View className="flex-1"><Text className="text-foreground text-lg font-bold">Soft ban clip?</Text></View><Pressable disabled={softBanning} onPress={closeSoftBan} className="w-11 h-11 items-center justify-center"><X size={20} className="text-foreground" /></Pressable></View>
        <Text numberOfLines={2} className="text-foreground font-bold mt-3">&quot;{softBanTarget?.title}&quot;</Text>
        <Text className="text-muted-foreground text-sm leading-5 mt-3">This hides the clip from public Clips. It is not deleted, so the vendor record remains available for review.</Text>
        <Text className="text-foreground text-xs font-semibold mt-4 mb-1">Reason for soft ban *</Text>
        <TextInput value={softBanReason} onChangeText={(value) => { setSoftBanReason(value); setSoftBanError(null); }} multiline maxLength={500} placeholder="Explain why this clip is being hidden" placeholderTextColor="#8A8589" className="text-foreground bg-background border border-border rounded-2xl p-4 min-h-24" />
        {softBanError ? <View className="rounded-2xl px-4 py-3 mt-3 bg-red-500/10"><Text className="text-red-600 text-xs">{softBanError}</Text></View> : null}
        <View className="flex-row gap-3 mt-4"><Pressable disabled={softBanning} onPress={closeSoftBan} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center"><Text className="text-foreground text-sm font-bold">Cancel</Text></Pressable><Pressable disabled={softBanning || !softBanReason.trim()} onPress={() => void confirmSoftBan()} className="flex-1 h-12 rounded-2xl bg-amber-600 items-center justify-center" style={{ opacity: softBanning || !softBanReason.trim() ? 0.6 : 1 }}>{softBanning ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Hide from public</Text>}</Pressable></View>
      </View></View>
    </Modal>

    <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={closeDelete}>
      <View className="flex-1 bg-black/60 items-center justify-center px-5"><View className="bg-card rounded-3xl p-5 w-full max-w-lg">
        <View className="flex-row items-center">
          <View className="flex-1"><Text className="text-foreground text-lg font-bold">Delete Clip?</Text></View>
          <Pressable disabled={deleting} onPress={closeDelete} className="w-11 h-11 items-center justify-center"><X size={20} className="text-foreground" /></Pressable>
        </View>

        <Text numberOfLines={2} className="text-foreground font-bold mt-3">&quot;{deleteTarget?.title}&quot;</Text>
        <Text className="text-muted-foreground text-xs mt-2">Vendor</Text>
        <Text className="text-foreground text-sm font-semibold">{deleteTarget?.vendor_name}</Text>
        <Text className="text-muted-foreground text-xs mt-2">Category</Text>
        <Text className="text-foreground text-sm font-semibold">{deleteTarget?.category_name}</Text>

        <Text className="text-muted-foreground text-xs mt-4 leading-5">This clip will be permanently removed from the public marketplace and the vendor dashboard. The vendor will be notified before deletion.</Text>

        <Text className="text-foreground text-xs font-semibold mt-4 mb-1">Reason for deletion *</Text>
        <TextInput value={reason} onChangeText={(value) => { setReason(value); setDeleteError(null); }} multiline maxLength={500} placeholder="Explain why this clip is being removed" placeholderTextColor="#8A8589" className="text-foreground bg-background border border-border rounded-2xl p-4 min-h-24" />

        {deleteError ? <View className="rounded-2xl px-4 py-3 mt-3 bg-red-500/10"><Text className="text-red-600 text-xs">{deleteError}</Text></View> : null}

        <View className="flex-row gap-3 mt-4">
          <Pressable disabled={deleting} onPress={closeDelete} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center"><Text className="text-foreground text-sm font-bold">Cancel</Text></Pressable>
          <Pressable disabled={deleting || !reason.trim()} onPress={() => void confirmDelete()} className="flex-1 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: "#DC3545", opacity: deleting || !reason.trim() ? 0.6 : 1 }}>
            {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Notify Vendor &amp; Delete</Text>}
          </Pressable>
        </View>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

function ClipCard({ clip, compact = false, onPreview, onSoftBan, onDelete }: { clip: AdminClip; compact?: boolean; onPreview: () => void; onSoftBan: () => void; onDelete: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${clip.title}`} onPress={onPreview} className={`bg-card border border-border rounded-2xl p-3 hover:border-primary/35 hover:bg-primary/5 active:bg-primary/5 transition-colors duration-200 ${compact ? "gap-3" : "flex-row gap-3"}`}>
    <Image source={{ uri: clip.thumbnail_url }} className={`${compact ? "w-full h-52" : "w-24 h-32"} rounded-xl bg-muted`} resizeMode="cover" />
    <View className="flex-1 min-w-0">
      <View className="flex-row items-start gap-2">
        <Text numberOfLines={2} className="text-foreground font-bold flex-1">{clip.title}</Text>
        <Text className="text-caption uppercase font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">{clip.status}</Text>
      </View>
      <Text numberOfLines={1} className="text-muted-foreground text-xs mt-1">{clip.vendor_name} · {clip.category_name}</Text>
      <View className="flex-row gap-4 mt-3"><View className="flex-row items-center"><Eye size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-metadata ml-1">{clip.views_count}</Text></View><View className="flex-row items-center"><Heart size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-metadata ml-1">{clip.likes_count}</Text></View></View>
      <View className="flex-row gap-2 mt-auto pt-3">
        <Pressable accessibilityRole="button" accessibilityLabel={`Soft ban ${clip.title}`} onPress={onSoftBan} className="min-h-11 px-3 rounded-xl border border-amber-500/50 flex-row items-center justify-center gap-1.5 active:bg-amber-500/10"><Ban size={14} color="#B76A00" /><Text className="text-amber-700 text-xs font-semibold">Soft ban</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${clip.title}`} onPress={onDelete} className="min-h-11 px-3 rounded-xl border border-red-400 flex-row items-center justify-center gap-1.5 hover:bg-red-500/10 active:opacity-75 transition-colors duration-200">
          <Trash2 size={14} color="#DC3545" /><Text className="text-red-500 text-xs font-semibold">Delete</Text>
        </Pressable>
      </View>
    </View>
  </Pressable>;
}

function FilterSearch({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <View className="flex-1 min-w-0"><Text className="text-foreground text-xs font-semibold mb-2">{label}</Text><View className="bg-background border border-border rounded-xl px-3 h-12 flex-row items-center"><Search size={17} className="text-muted-foreground" /><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#8A8589" className="flex-1 h-12 ml-2 text-foreground" /></View></View>;
}

function ClipMetric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return <View className="min-w-24 flex-1 rounded-xl bg-muted/60 px-3 py-3"><Icon size={15} className="text-primary" /><Text className="text-foreground text-base font-bold mt-2">{value.toLocaleString("en-IN")}</Text><Text className="text-muted-foreground text-xs mt-1">{label}</Text></View>;
}

function formatClipDate(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
