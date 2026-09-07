import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageSquareText, RefreshCw, Search, ShieldCheck, Star, ThumbsUp, X, type LucideIcon } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { AdminReveal } from "@/components/admin/ui/AdminReveal";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminReview } from "@/services/adminOperations";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";
import { DateField } from "@/components/admin/crm/ui/DateField";
import { adminPalette } from "@/theme";

const PAGE_SIZE = 15;

export default function AdminReviews() {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<AdminReview[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [reviewDate, setReviewDate] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [sort, setSort] = useState<"newest" | "highest" | "lowest">("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true); setError(null);
    try { const [reviews, categoryRows] = await Promise.all([AdminOperationsService.reviews(), CategoryService.list()]); setItems(reviews); setCategories(categoryRows); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load reviews."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); return AdminOperationsService.subscribe("reviews", () => void load(true)); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = items.filter((item) => (!rating || item.rating === rating) && (categoryId === "all" || item.category_id === categoryId) && (!reviewDate || istDateKey(item.created_at) === reviewDate) && (!needle || [item.title, item.review, item.customer_name, item.vendor_name].some((value) => value.toLowerCase().includes(needle))));
    return rows.sort((a, b) => sort === "highest" ? b.rating - a.rating : sort === "lowest" ? a.rating - b.rating : Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [categoryId, items, query, rating, reviewDate, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const averageRating = items.length ? items.reduce((sum, item) => sum + item.rating, 0) / items.length : 0;
  const helpfulVotes = items.reduce((sum, item) => sum + item.helpful_count, 0);
  const categoryOptions = useMemo(() => [{ id: "all", name: "All categories" }, ...categories.map((category) => ({ id: category.id, name: category.name }))], [categories]);
  const selectedCategoryName = categoryOptions.find((category) => category.id === categoryId)?.name ?? "All categories";

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} decelerationRate="fast" contentContainerStyle={{ paddingBottom: 72 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={adminPalette.brand} />}>
      <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
        <AdminPageHeader title="Reviews" subtitle="Monitor customer sentiment and marketplace trust" action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh reviews" accessibilityState={{ busy: refreshing }} onPress={() => void load(true)} className="min-w-11 min-h-11 rounded-xl items-center justify-center active:opacity-70"><RefreshCw size={19} className="text-primary" /></Pressable>} />
        {!loading && !error ? <View className="flex-row flex-wrap gap-3 mb-4"><SummaryMetric icon={MessageSquareText} label="Published reviews" value={items.length.toLocaleString("en-IN")} /><SummaryMetric icon={Star} label="Average rating" value={averageRating ? averageRating.toFixed(1) : "—"} tone="amber" /><SummaryMetric icon={ThumbsUp} label="Helpful votes" value={helpfulVotes.toLocaleString("en-IN")} tone="green" /></View> : null}
        <View className={width >= 900 ? "flex-row items-start gap-3" : "gap-3"}>
          <View style={width >= 900 ? { width: 260 } : undefined}><HierarchySelect label="Category" value={selectedCategoryName} options={categoryOptions} selectedId={categoryId} onSelect={(id) => { setCategoryId(id); setPage(1); }} /></View>
          <View className="flex-1 min-w-0"><Text className="text-foreground text-xs font-semibold mb-2">Search reviews</Text><View className="bg-card border border-border rounded-xl px-4 min-h-12 flex-row items-center"><Search size={18} className="text-muted-foreground" /><TextInput accessibilityLabel="Search reviews" value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search customer, vendor or review" placeholderTextColor="#6F7785" className="flex-1 h-12 ml-3 text-foreground" /></View></View>
          <View style={width >= 900 ? { width: 250 } : undefined}><DateField label="Review date" value={reviewDate} onChange={(value) => { setReviewDate(value); setPage(1); }} displayValue={reviewDate ? formatDateLabel(reviewDate) : undefined} placeholder="All review dates" maximumDate={todayIstKey()} /></View>
          {reviewDate ? <Pressable accessibilityRole="button" accessibilityLabel="Show reviews from all dates" onPress={() => { setReviewDate(""); setPage(1); }} className="min-h-12 px-3 mb-3 rounded-xl bg-primary/10 flex-row items-center justify-center gap-2 active:opacity-75"><X size={15} className="text-primary" /><Text className="text-primary text-xs font-semibold">All dates</Text></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}><FilterChip label="All ratings" selected={!rating} onPress={() => { setRating(null); setPage(1); }} />{[5, 4, 3, 2, 1].map((value) => <FilterChip key={value} label={`${value} star${value === 1 ? "" : "s"}`} selected={rating === value} onPress={() => { setRating(value); setPage(1); }} />)}</ScrollView>
        <View className="flex-row flex-wrap gap-2 mb-3">{(["newest", "highest", "lowest"] as const).map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: sort === value }} key={value} onPress={() => setSort(value)} className={sort === value ? "px-3 min-h-11 rounded-xl bg-primary/10 items-center justify-center" : "px-3 min-h-11 rounded-xl items-center justify-center active:bg-muted"}><Text className={sort === value ? "text-primary text-xs font-semibold capitalize" : "text-muted-foreground text-xs capitalize"}>{value}</Text></Pressable>)}<Text accessibilityLiveRegion="polite" className="text-muted-foreground text-xs self-center ml-auto">{filtered.length.toLocaleString("en-IN")} {filtered.length === 1 ? "review" : "reviews"}</Text></View>
        {loading ? <AdminLoadingState label="Loading reviews…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No reviews found" message="Try another search, category, date or rating filter." /> : <View className="flex-row flex-wrap gap-3">{visible.map((item, index) => <AdminReveal key={item.id} index={index} style={{ width: width >= 1100 ? "49.3%" : "100%", minWidth: 0 }}><ReviewCard item={item} /></AdminReveal>)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView><AdminFooter activeTab="profile" />
  </SafeAreaView>;
}

function ReviewCard({ item }: { item: AdminReview }) {
  return <View className="bg-card border border-border rounded-2xl p-4 hover:border-primary/35 hover:bg-primary/5 transition-colors duration-200"><View className="flex-row items-start"><View className="flex-1 min-w-0"><View className="flex-row items-center"><Text numberOfLines={1} className="text-foreground text-card-title font-bold flex-shrink">{item.customer_name}</Text>{item.is_verified_customer ? <ShieldCheck accessibilityLabel="Verified customer" size={14} className="text-emerald-600 ml-1" /> : null}</View><Text numberOfLines={1} className="text-primary text-xs mt-1">For {item.vendor_name} · {item.category_name}</Text></View><View accessibilityLabel={`${item.rating} out of 5 stars`} className="flex-row items-center bg-amber-500/10 rounded-lg px-2 py-1"><Star size={13} fill="#F59E0B" color="#F59E0B" /><Text className="text-amber-700 text-xs font-bold ml-1">{item.rating}</Text></View></View>
    {item.title ? <Text className="text-foreground text-sm font-semibold mt-3">{item.title}</Text> : null}<Text className="text-muted-foreground text-xs leading-5 mt-1">{item.review}</Text><View className="border-t border-border mt-4 pt-3 flex-row flex-wrap gap-x-3 gap-y-1 items-center"><Text className="text-muted-foreground text-caption flex-1">{new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text><Text className="text-muted-foreground text-caption">{item.helpful_count} helpful · {item.status}</Text></View>
  </View>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} className={selected ? "min-h-11 px-4 rounded-xl bg-primary items-center justify-center active:opacity-80" : "min-h-11 px-4 rounded-xl bg-card border border-border items-center justify-center active:bg-muted"}><Text className={selected ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>{label}</Text></Pressable>;
}

const REVIEW_TIMEZONE = "Asia/Kolkata";
function istDateKey(value: string) { return new Date(value).toLocaleDateString("en-CA", { timeZone: REVIEW_TIMEZONE }); }
function todayIstKey() { return new Date().toLocaleDateString("en-CA", { timeZone: REVIEW_TIMEZONE }); }
function formatDateLabel(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

function SummaryMetric({ icon: Icon, label, value, tone = "pink" }: { icon: LucideIcon; label: string; value: string; tone?: "pink" | "amber" | "green" }) {
  const iconClass = tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-600" : "text-primary";
  const iconBackground = tone === "amber" ? "bg-amber-500/10" : tone === "green" ? "bg-emerald-500/10" : "bg-primary/10";
  return <View className="min-w-[190px] flex-1 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3"><View className={`w-10 h-10 rounded-xl items-center justify-center ${iconBackground}`}><Icon size={18} className={iconClass} /></View><View><Text className="text-foreground text-lg font-bold">{value}</Text><Text className="text-muted-foreground text-xs mt-0.5">{label}</Text></View></View>;
}
