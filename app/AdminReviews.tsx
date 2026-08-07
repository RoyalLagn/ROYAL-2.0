import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshCw, Search, ShieldCheck, Star } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminReview } from "@/services/adminOperations";

const PAGE_SIZE = 15;

export default function AdminReviews() {
  const [items, setItems] = useState<AdminReview[]>([]);
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [sort, setSort] = useState<"newest" | "highest" | "lowest">("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true); setError(null);
    try { setItems(await AdminOperationsService.reviews()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load reviews."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); return AdminOperationsService.subscribe("reviews", () => void load(true)); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = items.filter((item) => (!rating || item.rating === rating) && (!needle || [item.title, item.review, item.customer_name, item.vendor_name].some((value) => value.toLowerCase().includes(needle))));
    return rows.sort((a, b) => sort === "highest" ? b.rating - a.rating : sort === "lowest" ? a.rating - b.rating : Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [items, query, rating, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
      <ResponsiveContainer>
        <AdminPageHeader title="Reviews" subtitle="Search and inspect customer feedback" action={<Pressable accessibilityLabel="Refresh reviews" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>} />
        <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search customer, vendor or review" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}><Pressable onPress={() => { setRating(null); setPage(1); }} className={!rating ? "px-4 py-2 rounded-xl bg-primary" : "px-4 py-2 rounded-xl bg-card border border-border"}><Text className={!rating ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>All ratings</Text></Pressable>{[5, 4, 3, 2, 1].map((value) => <Pressable key={value} onPress={() => { setRating(value); setPage(1); }} className={rating === value ? "px-4 py-2 rounded-xl bg-primary" : "px-4 py-2 rounded-xl bg-card border border-border"}><Text className={rating === value ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>{value} star</Text></Pressable>)}</ScrollView>
        <View className="flex-row gap-2 mb-3">{(["newest", "highest", "lowest"] as const).map((value) => <Pressable key={value} onPress={() => setSort(value)} className={sort === value ? "px-3 min-h-9 rounded-xl bg-primary/10 items-center justify-center" : "px-3 min-h-9 rounded-xl items-center justify-center"}><Text className={sort === value ? "text-primary text-xs font-semibold capitalize" : "text-muted-foreground text-xs capitalize"}>{value}</Text></Pressable>)}<Text className="text-muted-foreground text-xs self-center ml-auto">{filtered.length} records</Text></View>
        {loading ? <AdminLoadingState label="Loading reviews…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No reviews found" message="Try another search or rating filter." /> : <View className="gap-3">{visible.map((item) => <ReviewCard key={item.id} item={item} />)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView><AdminFooter activeTab="profile" />
  </SafeAreaView>;
}

function ReviewCard({ item }: { item: AdminReview }) {
  return <View className="bg-card border border-border rounded-2xl p-4"><View className="flex-row items-start"><View className="flex-1 min-w-0"><View className="flex-row items-center"><Text numberOfLines={1} className="text-foreground font-bold flex-shrink">{item.customer_name}</Text>{item.is_verified_customer ? <ShieldCheck size={14} className="text-emerald-600 ml-1" /> : null}</View><Text numberOfLines={1} className="text-primary text-xs mt-1">Review for {item.vendor_name}</Text></View><View className="flex-row items-center bg-amber-500/10 rounded-lg px-2 py-1"><Star size={13} fill="#F59E0B" color="#F59E0B" /><Text className="text-amber-700 text-xs font-bold ml-1">{item.rating}</Text></View></View>
    {item.title ? <Text className="text-foreground text-sm font-semibold mt-3">{item.title}</Text> : null}<Text className="text-muted-foreground text-xs leading-5 mt-1">{item.review}</Text><View className="flex-row items-center mt-3"><Text className="text-muted-foreground text-caption flex-1">{new Date(item.created_at).toLocaleString()}</Text><Text className="text-muted-foreground text-caption">{item.helpful_count} helpful · {item.status}</Text></View>
  </View>;
}
