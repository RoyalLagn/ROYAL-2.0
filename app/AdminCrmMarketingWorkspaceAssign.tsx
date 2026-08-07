import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Square } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { CrmCategoryService } from "@/services/crm/categoryService";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import { CrmTerritoryService } from "@/services/crm/territoryService";
import type { CrmVendorCategory } from "@/types/crm/category";
import type { CrmAssignableVendor } from "@/types/crm/marketingWorkspace";
import type { CrmTerritoryNode } from "@/types/crm/territory";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Something went wrong.";
}

export default function AdminCrmMarketingWorkspaceAssign() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();

  const [categories, setCategories] = useState<CrmVendorCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [clusters, setClusters] = useState<CrmTerritoryNode[]>([]);
  const [selectedClusterIds, setSelectedClusterIds] = useState<Set<string>>(new Set());
  const [vendors, setVendors] = useState<CrmAssignableVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  // Vendor ids we've confirmed are currently assigned in the database (across
  // every page/category/search we've observed this session). Used on Save to
  // diff against selectedVendorIds and unassign anything the admin unchecked
  // — and to merge (not overwrite) selectedVendorIds on each reload, so an
  // in-progress search or category toggle never wipes unsaved picks.
  const knownAssignedIdsRef = useRef<Set<string>>(new Set());

  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    void Promise.all([
      CrmCategoryService.list().then((rows) => rows.filter((row) => row.is_active)),
      CrmMarketingWorkspaceService.getCategoryIds(workspaceId),
    ]).then(([categoryRows, existingIds]) => {
      setCategories(categoryRows);
      setSelectedCategoryIds(new Set(existingIds));
    }).catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoadingCategories(false));
  }, [workspaceId]);

  useEffect(() => {
    // Flat list of every cluster in the CRM (not scoped to a taluka/district)
    // — admin_crm_list_territory('cluster', null) returns all of them when
    // no parent is given, which is exactly the "load from the database, no
    // hardcoding" behaviour this filter needs.
    void CrmTerritoryService.list("cluster")
      .then((rows) => setClusters(rows.filter((row) => row.is_active)))
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoadingClusters(false));
  }, []);

  // Server-side filter args shared by loadVendors / selectAll / unselectAll,
  // so "select all" / "unselect" always act on exactly what's on screen.
  const activeCategoryIds = useMemo(() => Array.from(selectedCategoryIds), [selectedCategoryIds]);
  const activeClusterIds = useMemo(() => Array.from(selectedClusterIds), [selectedClusterIds]);

  const loadVendors = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingVendors(true);
    setError(null);
    try {
      const result = await CrmMarketingWorkspaceService.listAssignableVendors(
        workspaceId,
        activeCategoryIds.length ? activeCategoryIds : null,
        query,
        1,
        100,
        activeClusterIds.length ? activeClusterIds : null,
      );
      setVendors(result.rows);
      setTotal(result.total);
      // Merge, don't replace: seed the selection for any newly-observed
      // already-assigned vendor, but never touch ids we've already accounted
      // for — that would silently undo an in-progress check/uncheck.
      setSelectedVendorIds((current) => {
        const next = new Set(current);
        for (const row of result.rows) {
          if (row.is_assigned && !knownAssignedIdsRef.current.has(row.id)) {
            knownAssignedIdsRef.current.add(row.id);
            next.add(row.id);
          }
        }
        return next;
      });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoadingVendors(false);
    }
  }, [workspaceId, activeCategoryIds, activeClusterIds, query]);

  useEffect(() => { void loadVendors(); }, [loadVendors]);

  // Walks every page of the current category + cluster + search filter and
  // returns the full matching id set — the basis for both "Select All" and
  // "Unselect", so both only ever touch what's currently filtered on screen.
  const collectFilteredVendorIds = useCallback(async () => {
    if (!workspaceId) return new Set<string>();
    const collected = new Set<string>();
    let page = 1;
    const pageSize = 200;
    for (let guard = 0; guard < 500; guard += 1) {
      const result = await CrmMarketingWorkspaceService.listAssignableVendors(
        workspaceId,
        activeCategoryIds.length ? activeCategoryIds : null,
        query,
        page,
        pageSize,
        activeClusterIds.length ? activeClusterIds : null,
      );
      for (const row of result.rows) collected.add(row.id);
      if (!result.rows.length || collected.size >= result.total) break;
      page += 1;
    }
    return collected;
  }, [workspaceId, activeCategoryIds, activeClusterIds, query]);

  const toggleCategory = (id: string) => setSelectedCategoryIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleCluster = (id: string) => setSelectedClusterIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleVendor = (id: string) => setSelectedVendorIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectAll = async () => {
    // Loop every page matching the current category + cluster + search
    // filter — the vendor list on screen is capped to the first 100 for
    // display, but "Select All" must mean every match, not just what's
    // currently rendered, and never anything outside the active filter.
    setLoadingVendors(true);
    setError(null);
    try {
      const collected = await collectFilteredVendorIds();
      setSelectedVendorIds((current) => new Set([...current, ...collected]));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoadingVendors(false);
    }
  };
  const unselectAll = async () => {
    // Scoped the same way as Select All: only the vendors matching the
    // current filter are removed from the selection, so a pick made under a
    // different category/cluster combination survives.
    setLoadingVendors(true);
    setError(null);
    try {
      const collected = await collectFilteredVendorIds();
      setSelectedVendorIds((current) => {
        const next = new Set(current);
        for (const id of collected) next.delete(id);
        return next;
      });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoadingVendors(false);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, CrmAssignableVendor[]>();
    for (const vendor of vendors) {
      const key = vendor.category_name ?? "Uncategorized";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(vendor);
    }
    return Array.from(groups.entries());
  }, [vendors]);

  const save = async () => {
    if (!workspaceId) return;
    setSaving(true);
    setError(null);
    try {
      await CrmMarketingWorkspaceService.setCategories(workspaceId, Array.from(selectedCategoryIds));
      // Vendors we know were assigned but the admin has since unchecked need
      // an explicit unassign — assignVendors() only ever inserts.
      const toUnassign = Array.from(knownAssignedIdsRef.current).filter((id) => !selectedVendorIds.has(id));
      await Promise.all(toUnassign.map((id) => CrmMarketingWorkspaceService.unassignVendor(workspaceId, id)));
      await CrmMarketingWorkspaceService.assignVendors(workspaceId, Array.from(selectedVendorIds));
      router.replace({ pathname: "/AdminCrmMarketingWorkspaceDetail", params: { workspaceId } });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrmMarketingWorkspaces"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Assign Categories &amp; Vendors</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{selectedVendorIds.size} of {total} selected</Text>
        </View>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <ResponsiveContainer>
          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => void loadVendors()} /></ResponsiveSection> : null}

          <ResponsiveSection>
            <Text className="text-foreground text-sm font-bold mb-2">Categories</Text>
            {loadingCategories ? <CrmSkeletonGrid count={2} /> : (
              <View className="flex-row flex-wrap gap-2">
                {categories.map((category) => {
                  const checked = selectedCategoryIds.has(category.id);
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => toggleCategory(category.id)}
                      className={`flex-row items-center px-3 py-2 rounded-full border ${checked ? "bg-primary border-primary" : "border-border"}`}
                    >
                      {checked ? <Check size={13} color="#FFFFFF" /> : <Square size={13} className="text-muted-foreground" />}
                      <Text className={`text-xs font-semibold ml-1.5 ${checked ? "text-white" : "text-foreground"}`}>{category.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ResponsiveSection>

          <ResponsiveSection>
            <Text className="text-foreground text-sm font-bold mb-2">
              Clusters {selectedClusterIds.size ? `(${selectedClusterIds.size} selected)` : "(All)"}
            </Text>
            {loadingClusters ? <CrmSkeletonGrid count={2} /> : !clusters.length ? (
              <Text className="text-muted-foreground text-xs">No clusters found.</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {clusters.map((cluster) => {
                  const checked = selectedClusterIds.has(cluster.id);
                  return (
                    <Pressable
                      key={cluster.id}
                      onPress={() => toggleCluster(cluster.id)}
                      className={`flex-row items-center px-3 py-2 rounded-full border ${checked ? "bg-primary border-primary" : "border-border"}`}
                    >
                      {checked ? <Check size={13} color="#FFFFFF" /> : <Square size={13} className="text-muted-foreground" />}
                      <Text className={`text-xs font-semibold ml-1.5 ${checked ? "text-white" : "text-foreground"}`}>{cluster.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ResponsiveSection>

          <ResponsiveSection>
            <CrmSearchBar value={query} placeholder="Search vendors" onChangeText={setQuery} />
          </ResponsiveSection>

          <ResponsiveSection>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-foreground text-sm font-bold">Vendors</Text>
              <View className="flex-row gap-3">
                <Pressable onPress={() => void selectAll()}><Text className="text-primary text-xs font-bold">Select All</Text></Pressable>
                <Pressable onPress={() => void unselectAll()}><Text className="text-muted-foreground text-xs font-bold">Unselect</Text></Pressable>
              </View>
            </View>

            {loadingVendors ? (
              <CrmSkeletonGrid count={4} />
            ) : !vendors.length ? (
              <AdminEmptyState
                title={selectedCategoryIds.size ? "No vendors in these categories" : "Select a category to see vendors"}
                message={selectedCategoryIds.size ? "Try different categories, clusters, or clear your search." : "Vendors are grouped by the categories you pick above."}
              />
            ) : (
              <View className="gap-4">
                {grouped.map(([categoryName, categoryVendors]) => (
                  <View key={categoryName}>
                    <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">{categoryName}</Text>
                    <View className="gap-2">
                      {categoryVendors.map((vendor) => {
                        const checked = selectedVendorIds.has(vendor.id);
                        return (
                          <Pressable key={vendor.id} onPress={() => toggleVendor(vendor.id)}>
                            <CRMCard className="p-3 flex-row items-center">
                              {checked ? <Check size={16} className="text-primary" /> : <Square size={16} className="text-muted-foreground" />}
                              <View className="flex-1 min-w-0 ml-3">
                                <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{vendor.business_name}</Text>
                                <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                                  {vendor.area ?? vendor.cluster_name ?? "No location"} · {vendor.phone ?? "No phone"}
                                </Text>
                              </View>
                            </CRMCard>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 bg-card border-t border-border p-4">
        <Pressable
          disabled={saving}
          onPress={() => void save()}
          className="h-12 rounded-2xl bg-primary items-center justify-center"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Assign {selectedVendorIds.size} Vendors</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
