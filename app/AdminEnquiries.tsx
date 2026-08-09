import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageCircle, Phone, RefreshCw, Search, Store } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminEnquiry } from "@/services/adminOperations";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";

const PAGE_SIZE = 15;

type VendorEnquirySummary = {
  vendorId: string;
  vendorName: string;
  categoryId: string | null;
  categoryName: string;
  callCount: number;
  whatsappCount: number;
  totalCount: number;
};

export default function AdminEnquiries() {
  const [items, setItems] = useState<AdminEnquiry[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [enquiries, categoryRows] = await Promise.all([
        AdminOperationsService.enquiries(),
        CategoryService.list(),
      ]);
      setItems(enquiries);
      setCategories(categoryRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load enquiry summary.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return AdminOperationsService.subscribe("vendor_enquiries", () => void load(true));
  }, [load]);

  const channelEnquiries = useMemo(
    () => items.filter((item) => item.enquiry_channel === "call" || item.enquiry_channel === "whatsapp"),
    [items],
  );

  const vendorSummaries = useMemo(() => {
    const grouped = new Map<string, VendorEnquirySummary>();
    channelEnquiries.forEach((item) => {
      const current = grouped.get(item.vendor_id) ?? {
        vendorId: item.vendor_id,
        vendorName: item.vendor_name,
        categoryId: item.category_id,
        categoryName: item.category_name,
        callCount: 0,
        whatsappCount: 0,
        totalCount: 0,
      };
      if (item.enquiry_channel === "call") current.callCount += 1;
      if (item.enquiry_channel === "whatsapp") current.whatsappCount += 1;
      current.totalCount += 1;
      grouped.set(item.vendor_id, current);
    });
    const needle = query.trim().toLowerCase();
    return [...grouped.values()]
      .filter((vendor) => (categoryId === "all" || vendor.categoryId === categoryId)
        && (!needle || vendor.vendorName.toLowerCase().includes(needle)))
      .sort((a, b) => b.totalCount - a.totalCount || a.vendorName.localeCompare(b.vendorName));
  }, [categoryId, channelEnquiries, query]);

  const pages = Math.max(1, Math.ceil(vendorSummaries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = vendorSummaries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalCalls = vendorSummaries.reduce((sum, vendor) => sum + vendor.callCount, 0);
  const totalWhatsApp = vendorSummaries.reduce((sum, vendor) => sum + vendor.whatsappCount, 0);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Enquiries"
            subtitle="Compare Call and WhatsApp interest by category and vendor"
            action={<Pressable accessibilityLabel="Refresh enquiry summary" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>}
          />

          <View className="flex-row flex-wrap gap-3 mb-5">
            <SummaryMetric label="Vendors with enquiries" value={vendorSummaries.length} icon={Store} />
            <SummaryMetric label="Call enquiries" value={totalCalls} icon={Phone} />
            <SummaryMetric label="WhatsApp enquiries" value={totalWhatsApp} icon={MessageCircle} />
          </View>

          <Text className="text-foreground font-bold mb-2">Filter by category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            <CategoryFilter label="All categories" selected={categoryId === "all"} onPress={() => { setCategoryId("all"); setPage(1); }} />
            {categories.map((category) => (
              <CategoryFilter key={category.id} label={category.name} selected={categoryId === category.id} onPress={() => { setCategoryId(category.id); setPage(1); }} />
            ))}
          </ScrollView>

          <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center mb-4">
            <Search size={18} className="text-muted-foreground" />
            <TextInput
              value={query}
              onChangeText={(value) => { setQuery(value); setPage(1); }}
              placeholder="Search vendors"
              placeholderTextColor="#8A8589"
              className="flex-1 h-12 ml-3 text-foreground"
            />
          </View>

          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-foreground font-bold">Vendor enquiry summary</Text>
              <Text className="text-muted-foreground text-xs mt-1">Sorted by highest total enquiries</Text>
            </View>
            <Text className="text-muted-foreground text-xs">{vendorSummaries.length} vendor{vendorSummaries.length === 1 ? "" : "s"}</Text>
          </View>

          {loading ? <AdminLoadingState label="Loading vendor enquiry totals…" />
            : error ? <AdminErrorState message={error} onRetry={() => void load()} />
              : !visible.length ? <AdminEmptyState title="No vendor enquiries found" message={query || categoryId !== "all" ? "Try another vendor search or category." : "Call and WhatsApp enquiries will appear here."} />
                : <View className="gap-3">{visible.map((vendor) => <VendorSummaryCard key={vendor.vendorId} vendor={vendor} />)}</View>}

          {!loading && !error && vendorSummaries.length > PAGE_SIZE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}

function CategoryFilter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} className={selected ? "min-h-11 px-4 rounded-xl bg-primary items-center justify-center" : "min-h-11 px-4 rounded-xl bg-card border border-border items-center justify-center"}>
      <Text className={selected ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>{label}</Text>
    </Pressable>
  );
}

function SummaryMetric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <View className="flex-1 min-w-44 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3">
      <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><Icon size={18} className="text-primary" /></View>
      <View><Text className="text-foreground text-xl font-bold">{value.toLocaleString("en-IN")}</Text><Text className="text-muted-foreground text-xs mt-0.5">{label}</Text></View>
    </View>
  );
}

function VendorSummaryCard({ vendor }: { vendor: VendorEnquirySummary }) {
  return (
    <View className="bg-card border border-border rounded-2xl p-4">
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><Store size={19} className="text-primary" /></View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground font-bold" numberOfLines={1}>{vendor.vendorName}</Text>
          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>{vendor.categoryName}</Text>
        </View>
        <View className="items-end">
          <Text className="text-foreground text-xl font-bold">{vendor.totalCount.toLocaleString("en-IN")}</Text>
          <Text className="text-muted-foreground text-caption">total enquiries</Text>
        </View>
      </View>
      <View className="flex-row gap-3 mt-4 pt-4 border-t border-border">
        <ChannelCount label="Call" value={vendor.callCount} icon={Phone} />
        <ChannelCount label="WhatsApp" value={vendor.whatsappCount} icon={MessageCircle} />
      </View>
    </View>
  );
}

function ChannelCount({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <View className="flex-1 min-w-0 bg-background rounded-xl p-3 flex-row items-center gap-2">
      <Icon size={16} className="text-primary" />
      <Text className="text-muted-foreground text-xs flex-1">{label}</Text>
      <Text className="text-foreground font-bold">{value.toLocaleString("en-IN")}</Text>
    </View>
  );
}
