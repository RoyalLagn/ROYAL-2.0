import React, { useCallback, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Building2, ChevronRight, MapPin, RefreshCw, Search } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { AdminReveal } from "@/components/admin/ui/AdminReveal";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { supabase } from "@/services/supabase";
import { adminPalette } from "@/theme";

type ApplicationStatus = "pending" | "approved" | "rejected";
type Application = { id: string; business_name: string; full_name: string; city: string; logo_url: string; status: ApplicationStatus; submitted_at: string; reviewed_at: string | null; categories: { name: string } | { name: string }[] | null };
const PAGE_SIZE = 15;

export default function VendorApplications() {
  const router = useRouter();
  const [items, setItems] = useState<Application[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("pending");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true); setError(null);
    const result = await supabase.from("vendor_applications").select("id,business_name,full_name,city,logo_url,status,submitted_at,reviewed_at,categories(name)").order("submitted_at", { ascending: false });
    if (result.error) setError(result.error.message); else setItems((result.data as unknown as Application[]) ?? []);
    setLoading(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (status === "all" || item.status === status) && (!needle || [item.business_name, item.full_name, item.city, categoryName(item)].some((value) => value?.toLowerCase().includes(needle))));
  }, [items, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} decelerationRate="fast" contentContainerStyle={{ paddingBottom: 72 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={adminPalette.brand} />}>
      <ResponsiveContainer>
        <AdminPageHeader title="Vendor Approvals" subtitle="Review current and previous registration decisions" action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh applications" onPress={() => void load(true)} className="w-11 h-11 rounded-xl border border-border bg-card items-center justify-center hover:bg-muted active:bg-muted transition-colors duration-200"><RefreshCw size={19} className="text-primary" /></Pressable>} />
        <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center shadow-sm"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search business, owner, category or city" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>{(["pending", "approved", "rejected", "all"] as const).map((value) => <Pressable key={value} onPress={() => { setStatus(value); setPage(1); }} className={status === value ? "min-h-11 px-4 rounded-xl bg-primary border border-primary items-center justify-center active:opacity-85" : "min-h-11 px-4 rounded-xl bg-card border border-border items-center justify-center hover:bg-primary/5 hover:border-primary/35 active:opacity-75 transition-colors duration-200"}><Text className={status === value ? "text-white text-xs font-semibold capitalize" : "text-foreground text-xs font-semibold capitalize"}>{value}</Text></Pressable>)}</ScrollView>
        <Text className="text-muted-foreground text-xs mb-3 px-1">{filtered.length} application{filtered.length === 1 ? "" : "s"}</Text>
        {loading ? <AdminLoadingState label="Loading applications…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No applications found" message="Try another search or status filter." /> : <View className="gap-3">{visible.map((item, index) => <AdminReveal key={item.id} index={index}><Pressable accessibilityRole="button" accessibilityLabel={`Review ${item.business_name} application`} onPress={() => router.push({ pathname: "/VendorApplicationDetails", params: { id: item.id } })} className="bg-card border border-border rounded-2xl p-4 hover:border-primary/35 hover:bg-primary/5 active:opacity-80 transition-colors duration-200"><View className="flex-row items-center">{item.logo_url ? <Image source={{ uri: item.logo_url }} className="w-14 h-14 rounded-xl bg-white border border-border" resizeMode="contain" /> : <View className="w-14 h-14 rounded-xl bg-primary/10 items-center justify-center"><Building2 size={22} className="text-primary" /></View>}<View className="flex-1 min-w-0 ml-3"><Text numberOfLines={1} className="text-foreground text-card-title font-bold">{item.business_name}</Text><Text numberOfLines={1} className="text-muted-foreground text-xs mt-1">{item.full_name} · {categoryName(item)}</Text><View className="flex-row items-center mt-1"><MapPin size={12} className="text-primary" /><Text className="text-muted-foreground text-metadata ml-1">{item.city || "Location not supplied"}</Text></View></View><View className="items-end ml-2"><Text className={statusClass(item.status)}>{item.status.toUpperCase()}</Text><View className="w-8 h-8 rounded-lg items-center justify-center mt-2"><ChevronRight size={17} className="text-muted-foreground" /></View></View></View><Text className="text-muted-foreground text-caption mt-3 pt-3 border-t border-border">Submitted {new Date(item.submitted_at).toLocaleString()}</Text></Pressable></AdminReveal>)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView><AdminFooter activeTab="profile" />
  </SafeAreaView>;
}

function categoryName(item: Application) { const category = Array.isArray(item.categories) ? item.categories[0] : item.categories; return category?.name ?? "Uncategorized"; }
function statusClass(status: ApplicationStatus) { return status === "approved" ? "text-emerald-700 bg-emerald-500/10 text-caption font-bold px-2 py-1 rounded-full" : status === "rejected" ? "text-red-600 bg-red-500/10 text-caption font-bold px-2 py-1 rounded-full" : "text-amber-700 bg-amber-500/10 text-caption font-bold px-2 py-1 rounded-full"; }
