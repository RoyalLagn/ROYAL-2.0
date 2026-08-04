import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Users } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { CategoryTile } from "@/components/admin/crm/vendor/CategoryTile";
import { CrmCategoryService } from "@/services/crm/categoryService";
import { supabase } from "@/services/supabase";
import type { CrmVendorCategory } from "@/types/crm/category";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load vendor categories for this cluster.";
}

export default function AdminCrmClusterCategories() {
  const router = useRouter();
  const { clusterId, clusterName } = useLocalSearchParams<{ clusterId: string; clusterName?: string }>();
  const [categories, setCategories] = useState<CrmVendorCategory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!clusterId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [categoryRows, vendorRows] = await Promise.all([
        CrmCategoryService.list(isRefresh),
        supabase.from("crm_vendors").select("category_id").eq("cluster_id", clusterId),
      ]);
      if (vendorRows.error) throw vendorRows.error;
      const tally: Record<string, number> = {};
      for (const row of vendorRows.data ?? []) {
        if (row.category_id) tally[row.category_id] = (tally[row.category_id] ?? 0) + 1;
      }
      setCategories(categoryRows.filter((category) => category.is_active));
      setCounts(tally);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clusterId]);

  useEffect(() => { void load(); }, [load]);

  const totalVendors = useMemo(() => Object.values(counts).reduce((sum, value) => sum + value, 0), [counts]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrm"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>{clusterName || "Categories"}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{totalVendors} vendors across categories</Text>
        </View>
        <Pressable
          accessibilityLabel="Create field workspace"
          className="min-h-11 px-3 rounded-full bg-primary items-center justify-center flex-row"
          onPress={() => router.push({ pathname: "/AdminCrmCreateWorkspace", params: { clusterId: clusterId ?? "", clusterName: clusterName ?? "" } })}
        >
          <Users size={16} color="#FFFFFF" />
          <Text className="text-white text-xs font-bold ml-1.5">Create Workspace</Text>
        </Pressable>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load(true)} /></ResponsiveSection>
          ) : null}
          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={4} />
            ) : !categories.length ? (
              <AdminEmptyState title="No vendor categories yet" message="Add categories from the CRM dashboard before browsing vendors here." />
            ) : (
              <View className="gap-3">
                {categories.map((category) => (
                  <CategoryTile
                    key={category.id}
                    name={category.name}
                    vendorCount={counts[category.id] ?? 0}
                    onPress={() => router.push({
                      pathname: "/AdminCrmVendors",
                      params: { clusterId: clusterId ?? "", clusterName: clusterName ?? "", categoryId: category.id, categoryName: category.name },
                    })}
                  />
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
