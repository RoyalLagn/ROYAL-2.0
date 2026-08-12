import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, Eye, Heart, RefreshCw, Search, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import ClipAnalyticsSection from "@/components/admin/clips/ClipAnalyticsSection";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminClip, type AdminClipStatus } from "@/services/adminOperations";
import { getPublicClipsEnabled, setPublicClipsEnabled } from "@/services/publicClipsAvailability";

const statuses: (AdminClipStatus | "all")[] = ["all", "pending", "approved", "hidden", "rejected", "draft"];
const PAGE_SIZE = 12;

export default function AdminClips() {
  const [items, setItems] = useState<AdminClip[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminClipStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ clip: AdminClip; decision: "hidden" | "rejected" } | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [publicClipsEnabled, setPublicClipsEnabledState] = useState<boolean | null>(null);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (status === "all" || item.status === status)
      && (!needle || [item.title, item.caption, item.vendor_name, item.category_name].some((value) => value?.toLowerCase().includes(needle))));
  }, [items, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);

  const moderate = async (clip: AdminClip, decision: "approved" | "hidden" | "rejected", note?: string) => {
    setWorking(true);
    try {
      await AdminOperationsService.moderateClip(clip.id, decision, note);
      setReview(null); setReason("");
      await load(true);
      Alert.alert("Clip updated", `The clip is now ${decision}.`);
    } catch (cause) { Alert.alert("Unable to update clip", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setWorking(false); }
  };

  const approve = (clip: AdminClip) => Alert.alert("Approve clip?", "This clip will be visible wherever its visibility setting allows.", [
    { text: "Cancel", style: "cancel" },
    { text: "Approve", onPress: () => void moderate(clip, "approved") },
  ]);

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
      <ResponsiveContainer>
        <AdminPageHeader title="Clips" subtitle="Understand performance and moderate vendor content" action={<Pressable accessibilityLabel="Refresh clips" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>} />
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
        <View className="mb-4"><Text className="text-foreground text-xl font-bold">Clip Moderation</Text><Text className="text-muted-foreground text-sm mt-1">Review and manage vendor clips.</Text></View>
        <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search clip, vendor or category" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
          {statuses.map((value) => <Pressable key={value} onPress={() => { setStatus(value); setPage(1); }} className={status === value ? "px-4 py-2 rounded-xl bg-primary" : "px-4 py-2 rounded-xl bg-card border border-border"}><Text className={status === value ? "text-white text-xs font-semibold capitalize" : "text-foreground text-xs font-semibold capitalize"}>{value}</Text></Pressable>)}
        </ScrollView>
        <Text className="text-muted-foreground text-xs mb-3">{filtered.length} record{filtered.length === 1 ? "" : "s"}</Text>
        {loading ? <AdminLoadingState label="Loading clips…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No clips found" message="Try another search or status filter." /> : <View className="gap-3">{visible.map((clip) => <ClipCard key={clip.id} clip={clip} onApprove={() => approve(clip)} onReview={(decision) => { setReview({ clip, decision }); setReason(""); }} />)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={Math.min(page, pages)} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView>
    <AdminFooter activeTab="profile" />
    <Modal visible={Boolean(review)} transparent animationType="fade" onRequestClose={() => !working && setReview(null)}>
      <View className="flex-1 bg-black/60 items-center justify-center px-5"><View className="bg-card rounded-3xl p-5 w-full max-w-lg">
        <View className="flex-row items-center"><View className="flex-1"><Text className="text-foreground text-lg font-bold capitalize">{review?.decision} clip</Text><Text className="text-muted-foreground text-xs mt-1">Explain this moderation decision to the vendor.</Text></View><Pressable disabled={working} onPress={() => setReview(null)} className="w-11 h-11 items-center justify-center"><X size={20} className="text-foreground" /></Pressable></View>
        <TextInput value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="Required moderation reason" placeholderTextColor="#8A8589" className="text-foreground bg-background border border-border rounded-2xl p-4 min-h-28 mt-4" />
        <Pressable disabled={working || !reason.trim()} onPress={() => review && void moderate(review.clip, review.decision, reason)} className="bg-primary min-h-12 rounded-2xl items-center justify-center mt-4"><Text className="text-white font-bold">{working ? "Saving…" : "Confirm decision"}</Text></Pressable>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

function ClipCard({ clip, onApprove, onReview }: { clip: AdminClip; onApprove: () => void; onReview: (decision: "hidden" | "rejected") => void }) {
  return <View className="bg-card border border-border rounded-2xl p-3 flex-row gap-3">
    <Image source={{ uri: clip.thumbnail_url }} className="w-24 h-32 rounded-xl bg-muted" resizeMode="cover" />
    <View className="flex-1 min-w-0"><View className="flex-row items-start gap-2"><Text numberOfLines={2} className="text-foreground font-bold flex-1">{clip.title}</Text><Text className="text-caption uppercase font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">{clip.status}</Text></View>
      <Text numberOfLines={1} className="text-muted-foreground text-xs mt-1">{clip.vendor_name} · {clip.category_name}</Text>
      <View className="flex-row gap-4 mt-3"><View className="flex-row items-center"><Eye size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-metadata ml-1">{clip.views_count}</Text></View><View className="flex-row items-center"><Heart size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-metadata ml-1">{clip.likes_count}</Text></View></View>
      {clip.moderation_reason ? <Text numberOfLines={2} className="text-red-500 text-metadata mt-2">{clip.moderation_reason}</Text> : null}
      <View className="flex-row flex-wrap gap-2 mt-auto pt-3">{clip.status !== "approved" ? <Pressable onPress={onApprove} className="min-h-9 px-3 rounded-xl bg-emerald-600 flex-row items-center justify-center"><Check size={14} color="#FFF" /><Text className="text-white text-xs font-semibold ml-1">Approve</Text></Pressable> : null}{clip.status !== "hidden" ? <Pressable onPress={() => onReview("hidden")} className="min-h-9 px-3 rounded-xl border border-border items-center justify-center"><Text className="text-foreground text-xs font-semibold">Hide</Text></Pressable> : null}{clip.status !== "rejected" ? <Pressable onPress={() => onReview("rejected")} className="min-h-9 px-3 rounded-xl border border-red-400 items-center justify-center"><Text className="text-red-500 text-xs font-semibold">Reject</Text></Pressable> : null}</View>
    </View>
  </View>;
}
