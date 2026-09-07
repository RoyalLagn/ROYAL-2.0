import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, RefreshCw, Save, Search, Sparkles, Trash2 } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import Pressable from "@/components/InteropSafePressable";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { getApprovedPublicVendors, type PublicVendorListing } from "@/services/publicVendorListings";
import { HOME_FEATURED_VENDOR_LIMIT, listHomeFeaturedVendorIds, saveHomeFeaturedVendorIds } from "@/services/homeFeaturedVendors";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";

const VENDORS_PER_PAGE = 10;

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong. Please try again.";
}

export default function AdminFeaturedVendors() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [vendors, setVendors] = useState<PublicVendorListing[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [all, ids, categoryRows] = await Promise.all([
        getApprovedPublicVendors({ force: refresh }),
        listHomeFeaturedVendorIds(),
        CategoryService.list({ force: refresh }),
      ]);
      const available = new Set(all.map((vendor) => vendor.id));
      const validIds = ids.filter((id) => available.has(id)).slice(0, HOME_FEATURED_VENDOR_LIMIT);
      setVendors(all);
      setSelectedIds(validIds);
      setSavedIds(validIds);
      setCategories(categoryRows.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const vendorById = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors]);
  const selected = selectedIds.map((id) => vendorById.get(id)).filter(Boolean) as PublicVendorListing[];
  const filteredAvailable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors.filter((vendor) =>
      !selectedIds.includes(vendor.id)
      && (category === "All" || vendor.category.toLowerCase() === category.toLowerCase())
      && (!needle || `${vendor.name} ${vendor.category} ${vendor.location}`.toLowerCase().includes(needle)),
    );
  }, [category, query, selectedIds, vendors]);
  const pageCount = Math.max(1, Math.ceil(filteredAvailable.length / VENDORS_PER_PAGE));
  const available = filteredAvailable.slice((page - 1) * VENDORS_PER_PAGE, page * VENDORS_PER_PAGE);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    vendors.forEach((vendor) => counts.set(vendor.category.toLowerCase(), (counts.get(vendor.category.toLowerCase()) ?? 0) + 1));
    return counts;
  }, [vendors]);
  const dirty = selectedIds.join("|") !== savedIds.join("|");

  useEffect(() => { setPage(1); }, [category, query]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const move = (index: number, direction: -1 | 1) => setSelectedIds((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    try {
      await saveHomeFeaturedVendorIds(selectedIds);
      setSavedIds(selectedIds);
      setNotice("Homepage featured vendors saved successfully.");
    } catch (reason) {
      setError(messageOf(reason));
    } finally { setSaving(false); }
  };

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={{ paddingBottom: 72 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} keyboardShouldPersistTaps="handled">
      <ResponsiveContainer>
        <AdminPageHeader title="Top Featured Vendors" subtitle="Choose and order up to 10 vendors for the homepage" action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh featured vendors" onPress={() => void load(true)} className="w-11 h-11 rounded-xl border border-border bg-card items-center justify-center hover:bg-muted active:opacity-75"><RefreshCw size={18} className="text-primary" /></Pressable>} />
        {error ? <AdminErrorState title="Unable to load featured vendors" message={error} onRetry={() => void load(true)} /> : null}
        {notice ? <View className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3"><Text className="text-emerald-700 font-semibold text-sm">{notice}</Text></View> : null}
        {loading ? <AdminLoadingState label="Loading vendors…" /> : <View style={{ flexDirection: wide ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
          <View className="w-full flex-1 rounded-3xl border border-border bg-card p-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <View><Text className="text-foreground text-lg font-bold">Homepage order</Text><Text className="text-muted-foreground text-xs mt-1">Position 1 appears first</Text></View>
              <View className="rounded-full bg-primary/10 px-3 py-1.5"><Text className="text-primary font-bold text-xs">{selected.length}/{HOME_FEATURED_VENDOR_LIMIT}</Text></View>
            </View>
            {!selected.length ? <AdminEmptyState title="No featured vendors" message="Add vendors from the available list." /> : selected.map((vendor, index) => <View key={vendor.id} className="mb-3 min-h-[82px] rounded-2xl border border-primary/15 bg-primary/5 p-3 flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-full bg-primary items-center justify-center"><Text className="text-white font-bold text-xs">{index + 1}</Text></View>
              <Image source={{ uri: vendor.image }} className="w-12 h-12 rounded-xl bg-muted" resizeMode="cover" />
              <View className="flex-1 min-w-0"><Text numberOfLines={1} className="text-foreground font-bold text-sm">{vendor.name}</Text><Text numberOfLines={1} className="text-muted-foreground text-xs mt-1">{vendor.category} · {vendor.location}</Text></View>
              <View className="flex-row gap-1">
                <Pressable disabled={index === 0} accessibilityLabel={`Move ${vendor.name} up`} onPress={() => move(index, -1)} className="w-9 h-9 rounded-xl bg-card border border-border items-center justify-center disabled:opacity-30"><ArrowUp size={15} className="text-foreground" /></Pressable>
                <Pressable disabled={index === selected.length - 1} accessibilityLabel={`Move ${vendor.name} down`} onPress={() => move(index, 1)} className="w-9 h-9 rounded-xl bg-card border border-border items-center justify-center disabled:opacity-30"><ArrowDown size={15} className="text-foreground" /></Pressable>
                <Pressable accessibilityLabel={`Remove ${vendor.name}`} onPress={() => setSelectedIds((ids) => ids.filter((id) => id !== vendor.id))} className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center"><Trash2 size={15} color="#DC3545" /></Pressable>
              </View>
            </View>)}
            <Pressable disabled={!dirty || saving} accessibilityRole="button" onPress={() => void save()} className="mt-2 min-h-12 rounded-xl bg-primary flex-row items-center justify-center gap-2 disabled:opacity-45 hover:bg-[#D81B60] active:opacity-80">
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Save size={17} color="#FFFFFF" />}<Text className="text-white font-bold">{saving ? "Saving…" : "Save homepage order"}</Text>
            </Pressable>
          </View>

          <View className="w-full flex-1 rounded-3xl border border-border bg-card p-4 shadow-sm">
            <View className="flex-row items-center justify-between gap-3 mb-4">
              <View className="flex-row items-center gap-2"><Sparkles size={18} className="text-primary" /><Text className="text-foreground text-lg font-bold">Browse vendors</Text></View>
              <Text className="text-muted-foreground text-xs">{filteredAvailable.length} available</Text>
            </View>
            <View className="h-12 rounded-xl border border-border bg-background px-3 flex-row items-center mb-3 focus-within:border-primary"><Search size={17} className="text-muted-foreground" /><TextInput value={query} onChangeText={setQuery} placeholder="Search vendors" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-2 text-foreground text-sm" /></View>
            <Text className="text-foreground text-xs font-bold mb-2">Categories</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              {[{ name: "All", id: "all" }, ...categories].map((item) => {
                const active = category === item.name;
                const count = item.name === "All" ? vendors.length : categoryCounts.get(item.name.toLowerCase()) ?? 0;
                return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Show ${item.name} vendors`} onPress={() => setCategory(item.name)} className={active ? "min-h-11 px-4 rounded-full bg-primary flex-row items-center justify-center gap-2" : "min-h-11 px-4 rounded-full border border-border bg-background flex-row items-center justify-center gap-2 hover:bg-muted"}>
                  <Text className={active ? "text-white text-xs font-bold" : "text-foreground text-xs font-semibold"}>{item.name}</Text>
                  <View className={active ? "min-w-5 h-5 px-1 rounded-full bg-white/20 items-center justify-center" : "min-w-5 h-5 px-1 rounded-full bg-muted items-center justify-center"}><Text className={active ? "text-white text-caption font-bold" : "text-muted-foreground text-caption font-bold"}>{count}</Text></View>
                </Pressable>;
              })}
            </ScrollView>
            {!available.length ? <AdminEmptyState title="No vendors found" message="Try another search or remove a selected vendor." /> : available.map((vendor) => <View key={vendor.id} className="mb-2 min-h-[68px] rounded-2xl border border-border px-3 py-2 flex-row items-center gap-3">
              <Image source={{ uri: vendor.image }} className="w-11 h-11 rounded-xl bg-muted" resizeMode="cover" />
              <View className="flex-1 min-w-0"><Text numberOfLines={1} className="text-foreground font-bold text-sm">{vendor.name}</Text><Text numberOfLines={1} className="text-muted-foreground text-xs mt-0.5">{vendor.category} · {vendor.location}</Text></View>
              <Pressable disabled={selectedIds.length >= HOME_FEATURED_VENDOR_LIMIT} accessibilityLabel={`Add ${vendor.name}`} onPress={() => setSelectedIds((ids) => [...ids, vendor.id])} className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center disabled:opacity-30 hover:bg-primary/15"><Plus size={17} className="text-primary" /></Pressable>
            </View>)}
            {filteredAvailable.length ? <View className="mt-3 pt-4 border-t border-border flex-row items-center justify-between gap-3">
              <Pressable disabled={page === 1} accessibilityRole="button" accessibilityLabel="Previous vendor page" onPress={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 px-3 rounded-xl border border-border bg-background flex-row items-center gap-1 disabled:opacity-35 hover:bg-muted"><ChevronLeft size={16} className="text-foreground" /><Text className="text-foreground text-xs font-bold">Previous</Text></Pressable>
              <View className="items-center"><Text className="text-foreground text-xs font-bold">Page {page} of {pageCount}</Text><Text className="text-muted-foreground text-caption mt-0.5">{(page - 1) * VENDORS_PER_PAGE + 1}–{Math.min(page * VENDORS_PER_PAGE, filteredAvailable.length)} of {filteredAvailable.length}</Text></View>
              <Pressable disabled={page === pageCount} accessibilityRole="button" accessibilityLabel="Next vendor page" onPress={() => setPage((value) => Math.min(pageCount, value + 1))} className="min-h-11 px-3 rounded-xl border border-border bg-background flex-row items-center gap-1 disabled:opacity-35 hover:bg-muted"><Text className="text-foreground text-xs font-bold">Next</Text><ChevronRight size={16} className="text-foreground" /></Pressable>
            </View> : null}
          </View>
        </View>}
      </ResponsiveContainer>
    </ScrollView>
    <AdminFooter activeTab="profile" />
  </SafeAreaView>;
}
