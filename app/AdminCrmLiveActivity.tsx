import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Phone, Sparkles } from "lucide-react-native";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import type { CrmMarketingDashboardMetric, CrmMarketingDashboardVendor } from "@/types/crm/marketingWorkspace";

const details: Record<CrmMarketingDashboardMetric, { title: string; icon: typeof Sparkles }> = {
  interested: { title: "Interested Leads", icon: Sparkles }, calls_today: { title: "Today's Calls", icon: Phone }, meetings_today: { title: "Today's Meetings", icon: CalendarClock }, followups_pending: { title: "Pending Follow-ups", icon: CalendarClock },
};
const PAGE_SIZE = 30;

export default function AdminCrmLiveActivity() {
  const router = useRouter();
  const { metric } = useLocalSearchParams<{ metric?: CrmMarketingDashboardMetric }>();
  const activeMetric = metric && metric in details ? metric : "interested";
  const { title, icon: Icon } = details[activeMetric];
  const { width } = useWindowDimensions();
  const columns = width >= 1080 ? 3 : width >= 680 ? 2 : 1;
  const cardWidth = `${(100 / columns).toFixed(4)}%` as `${number}%`;
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(""); const [rows, setRows] = useState<CrmMarketingDashboardVendor[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const result = await CrmMarketingWorkspaceService.listDashboardActivity(activeMetric, query, page, PAGE_SIZE); setRows(result.rows); setTotal(result.total); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load live activity."); } finally { setLoading(false); } }, [activeMetric, page, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => CrmMarketingWorkspaceService.subscribe(() => void load()), [load]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <SafeAreaView className="flex-1 bg-background" edges={["top","left","right"]}><ResponsiveContainer className="flex-row items-center py-2"><Pressable className="w-11 h-11 items-center justify-center" onPress={() => router.back()}><ArrowLeft size={21} className="text-foreground" /></Pressable><View className="flex-1 px-2"><Text className="text-foreground text-xl font-bold">{title}</Text><Text className="text-muted-foreground text-xs">{total} live workspace record{total === 1 ? "" : "s"}</Text></View></ResponsiveContainer><ScrollView><ResponsiveContainer><ResponsiveSection><CrmSearchBar value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search business, owner or phone" /></ResponsiveSection>{error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load()} /></ResponsiveSection> : null}<ResponsiveSection>{loading ? <View className="h-40 items-center justify-center"><ActivityIndicator color="#E91E63" /></View> : !rows.length ? <AdminEmptyState title={`No ${title.toLowerCase()}`} message="Live workspace activity will appear here when your team updates it." /> : <View className="flex-row flex-wrap -m-1.5">{rows.map((vendor) => <View key={`${vendor.id}-${vendor.workspace_name}`} className="p-1.5" style={{ width: cardWidth }}><CRMCard className="p-4 min-h-[150px]"><View className="flex-row"><View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center"><Icon size={18} className="text-primary" /></View><View className="flex-1 min-w-0 ml-3"><Text className="text-foreground text-sm font-bold" numberOfLines={1}>{vendor.business_name}</Text><Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={2}>{[vendor.category_name, vendor.cluster_name || vendor.area, vendor.phone].filter(Boolean).join(" · ")}</Text><Text className="text-primary text-xs font-semibold mt-3" numberOfLines={1}>Workspace: {vendor.workspace_name}</Text></View></View></CRMCard></View>)}</View>}</ResponsiveSection>{total > PAGE_SIZE ? <ResponsiveSection><View className="flex-row items-center justify-between"><Text className="text-muted-foreground text-xs">Page {page} of {pageCount}</Text><View className="flex-row gap-2"><Pressable disabled={page === 1} onPress={() => setPage((current) => Math.max(1,current - 1))} className={`w-10 h-10 rounded-xl border border-border items-center justify-center ${page === 1 ? "opacity-40" : ""}`}><ChevronLeft size={17} className="text-foreground" /></Pressable><Pressable disabled={page >= pageCount} onPress={() => setPage((current) => current + 1)} className={`w-10 h-10 rounded-xl border border-border items-center justify-center ${page >= pageCount ? "opacity-40" : ""}`}><ChevronRight size={17} className="text-foreground" /></Pressable></View></View></ResponsiveSection> : null}</ResponsiveContainer></ScrollView></SafeAreaView>;
}
