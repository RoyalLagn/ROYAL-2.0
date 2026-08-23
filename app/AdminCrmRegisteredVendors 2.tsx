import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Phone, UserCheck } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmCategoryService } from "@/services/crm/categoryService";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import type { CrmVendorCategory } from "@/types/crm/category";
import type { CrmMarketingRegisteredVendor } from "@/types/crm/marketingWorkspace";

const PAGE_SIZE = 30;

export default function AdminCrmRegisteredVendors() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = width >= 1080 ? 3 : width >= 680 ? 2 : 1;
  const cardWidth = `${(100 / columns).toFixed(4)}%` as `${number}%`;
  const [categories, setCategories] = useState<CrmVendorCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CrmMarketingRegisteredVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await CrmMarketingWorkspaceService.listRegisteredVendors(categoryId, query, page, PAGE_SIZE);
      setRows(result.rows);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load registered vendors.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId, page, query]);

  useEffect(() => { void CrmCategoryService.list().then((items) => setCategories(items.filter((item) => item.is_active))).catch(() => setCategories([])); }, []);
  useEffect(() => { void load(); }, [load]);

  const categoryName = useMemo(() => categories.find((category) => category.id === categoryId)?.name ?? "All categories", [categories, categoryId]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const changeCategory = (id: string | null) => { setCategoryId(id); setPage(1); setCategoryOpen(false); };
  const changeQuery = (value: string) => { setQuery(value); setPage(1); };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable accessibilityLabel="Go back" className="min-w-11 min-h-11 items-center justify-center" onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrm"))}><ArrowLeft size={21} className="text-foreground" /></Pressable>
        <View className="flex-1 px-2 min-w-0"><Text className="text-foreground text-xl font-bold">Registered Vendors</Text><Text className="text-muted-foreground text-xs" numberOfLines={1}>{total} registered through marketing workspace links</Text></View>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
        <ResponsiveContainer>
          <ResponsiveSection>
            <CrmSearchBar value={query} onChangeText={changeQuery} placeholder="Search business, owner or phone" />
            <Text className="text-muted-foreground text-metadata font-semibold mt-3 mb-1.5">Category</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: categoryOpen }} onPress={() => setCategoryOpen((current) => !current)} className="min-h-12 px-4 rounded-2xl border border-border bg-card flex-row items-center">
              <Text className="text-foreground text-sm flex-1">{categoryName}</Text><ChevronDown size={17} className="text-muted-foreground" style={{ transform: [{ rotate: categoryOpen ? "180deg" : "0deg" }] }} />
            </Pressable>
            {categoryOpen ? <View className="mt-2 rounded-2xl border border-border bg-card overflow-hidden"><Pressable onPress={() => changeCategory(null)} className="min-h-11 px-4 justify-center"><Text className="text-foreground text-sm">All categories</Text></Pressable>{categories.map((category) => <Pressable key={category.id} onPress={() => changeCategory(category.id)} className="min-h-11 px-4 justify-center border-t border-border"><Text className="text-foreground text-sm">{category.name}</Text></Pressable>)}</View> : null}
          </ResponsiveSection>

          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load()} /></ResponsiveSection> : null}
          <ResponsiveSection>
            {loading ? <CrmSkeletonGrid count={6} /> : !rows.length ? <AdminEmptyState title="No registered vendors found" message="No marketing-workspace vendor matches this category or search." /> : <View className="flex-row flex-wrap -m-1.5">{rows.map((vendor) => <View key={vendor.id} className="p-1.5" style={{ width: cardWidth }}><CRMCard className="p-4 min-h-[164px]"><View className="flex-row items-start"><View className="w-10 h-10 rounded-xl bg-emerald-500/10 items-center justify-center"><UserCheck size={18} className="text-emerald-500" /></View><View className="flex-1 min-w-0 ml-3"><Text className="text-foreground text-sm font-bold" numberOfLines={1}>{vendor.business_name}</Text><Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{vendor.owner_name || "Owner not recorded"}</Text></View></View><Text className="text-muted-foreground text-xs mt-4" numberOfLines={1}>{[vendor.category_name, vendor.cluster_name || vendor.area].filter(Boolean).join(" · ") || "Location not recorded"}</Text>{vendor.phone ? <View className="flex-row items-center mt-2"><Phone size={12} className="text-muted-foreground" /><Text className="text-muted-foreground text-xs ml-1.5">{vendor.phone}</Text></View> : null}<View className="mt-auto pt-3"><Text className="text-primary text-metadata font-bold uppercase" numberOfLines={1}>From {vendor.workspace_names.join(", ")}</Text></View></CRMCard></View>)}</View>}
          </ResponsiveSection>
          {total > PAGE_SIZE ? <ResponsiveSection><View className="flex-row justify-between items-center"><Text className="text-muted-foreground text-xs">Page {page} of {pageCount}</Text><View className="flex-row gap-2"><Pressable disabled={page === 1} onPress={() => setPage((current) => Math.max(1, current - 1))} className={`w-10 h-10 rounded-xl border border-border items-center justify-center ${page === 1 ? "opacity-40" : ""}`}><ChevronLeft size={17} className="text-foreground" /></Pressable><Pressable disabled={page >= pageCount} onPress={() => setPage((current) => current + 1)} className={`w-10 h-10 rounded-xl border border-border items-center justify-center ${page >= pageCount ? "opacity-40" : ""}`}><ChevronRight size={17} className="text-foreground" /></Pressable></View></View></ResponsiveSection> : null}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
