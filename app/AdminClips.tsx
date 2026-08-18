import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, Heart, RefreshCw, Search, Trash2, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import ClipAnalyticsSection from "@/components/admin/clips/ClipAnalyticsSection";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminClip } from "@/services/adminOperations";
import { getPublicClipsEnabled, setPublicClipsEnabled } from "@/services/publicClipsAvailability";
import { useCategories } from "@/context/CategoryContext";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";

const PAGE_SIZE = 12;
const UNCATEGORIZED = "__uncategorized__";

export default function AdminClips() {
  const { categories } = useCategories();
  const [items, setItems] = useState<AdminClip[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
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
    return notDeleted.filter((item) => {
      const matchesCategory = categoryId === "all"
        || (categoryId === UNCATEGORIZED ? !item.category_id : item.category_id === categoryId);
      const matchesSearch = !needle || [item.title, item.caption, item.vendor_name, item.category_name].some((value) => value?.toLowerCase().includes(needle));
      return matchesCategory && matchesSearch;
    });
  }, [notDeleted, query, categoryId]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const categoryOptions = useMemo(() => [
    { id: "all", name: "All Categories" },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
    { id: UNCATEGORIZED, name: "Uncategorized" },
  ], [categories]);

  const openDelete = (clip: AdminClip) => { setDeleteTarget(clip); setReason(""); setDeleteError(null); };
  const closeDelete = () => { if (deleting) return; setDeleteTarget(null); setReason(""); setDeleteError(null); };

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

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
      <ResponsiveContainer>
        <AdminPageHeader title="Clips" subtitle="Review vendor content and remove clips that do not belong" action={<Pressable accessibilityLabel="Refresh clips" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>} />
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
          {publicClipsEnabled === null ? <ActivityIndicator color="#E91E63" /> : <Switch accessibilityLabel="Public Clips availability" accessibilityHint="Controls whether Clips are available in the public app" accessibilityState={{ checked: publicClipsEnabled, disabled: availabilitySaving, busy: availabilitySaving }} value={publicClipsEnabled} disabled={availabilitySaving} onValueChange={(value) => void updatePublicClips(value)} trackColor={{ false: "#D6D1D4", true: "#F5A6C2" }} thumbColor={publicClipsEnabled ? "#E91E63" : "#FFFFFF"} />}
        </View>
        <ClipAnalyticsSection />
        <View className="mb-4"><Text className="text-foreground text-xl font-bold">All Clips</Text><Text className="text-muted-foreground text-sm mt-1">Filter by category, search, and permanently remove incorrect clips.</Text></View>
        <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search clip, vendor or category" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground" /></View>
        <View className="mt-4 mb-3">
          <HierarchySelect
            label="Category"
            value={categoryOptions.find((option) => option.id === categoryId)?.name}
            options={categoryOptions}
            selectedId={categoryId}
            onSelect={(id) => { setCategoryId(id); setPage(1); }}
          />
        </View>
        <Text className="text-muted-foreground text-xs mb-3">{filtered.length} record{filtered.length === 1 ? "" : "s"}</Text>
        {loading ? <AdminLoadingState label="Loading clips…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No clips found" message="Try another search or category filter." /> : <View className="gap-3">{visible.map((clip) => <ClipCard key={clip.id} clip={clip} onDelete={() => openDelete(clip)} />)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={Math.min(page, pages)} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView>
    <AdminFooter activeTab="profile" />

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

function ClipCard({ clip, onDelete }: { clip: AdminClip; onDelete: () => void }) {
  return <View className="bg-card border border-border rounded-2xl p-3 flex-row gap-3">
    <Image source={{ uri: clip.thumbnail_url }} className="w-24 h-32 rounded-xl bg-muted" resizeMode="cover" />
    <View className="flex-1 min-w-0">
      <View className="flex-row items-start gap-2">
        <Text numberOfLines={2} className="text-foreground font-bold flex-1">{clip.title}</Text>
        <Text className="text-caption uppercase font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">{clip.status}</Text>
      </View>
      <Text numberOfLines={1} className="text-muted-foreground text-xs mt-1">{clip.vendor_name} · {clip.category_name}</Text>
      <View className="flex-row gap-4 mt-3"><View className="flex-row items-center"><Eye size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-metadata ml-1">{clip.views_count}</Text></View><View className="flex-row items-center"><Heart size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-metadata ml-1">{clip.likes_count}</Text></View></View>
      <View className="flex-row mt-auto pt-3">
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${clip.title}`} onPress={onDelete} className="min-h-11 px-3 rounded-xl border border-red-400 flex-row items-center justify-center gap-1.5">
          <Trash2 size={14} color="#DC3545" /><Text className="text-red-500 text-xs font-semibold">Delete</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}
