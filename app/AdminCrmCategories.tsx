import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, ChevronUp, Edit3, Plus, Trash2, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmCategoryService } from "@/services/crm/categoryService";
import { slugifyCrmName } from "@/services/crm/slug";
import type { CrmVendorCategory } from "@/types/crm/category";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load vendor categories.");
  }
  return "Unable to load vendor categories.";
}

export default function AdminCrmCategories() {
  const router = useRouter();
  const [rows, setRows] = useState<CrmVendorCategory[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmVendorCategory | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<CrmVendorCategory | null>(null);

  const load = useCallback(async (isRefresh = false, force = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setRows(await CrmCategoryService.list(force));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => CrmCategoryService.subscribe(() => void load(false, true)), [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle));
  }, [rows, query]);

  const openEditor = (category: CrmVendorCategory | "new") => {
    setEditing(category);
    setDraftName(category === "new" ? "" : category.name);
    setError(null);
  };

  const save = async () => {
    if (!draftName.trim()) { setError("Enter a category name."); return; }
    setSaving(true);
    try {
      if (editing === "new") {
        await CrmCategoryService.create({
          name: draftName,
          slug: slugifyCrmName(draftName),
          displayOrder: (rows[rows.length - 1]?.display_order ?? 0) + 10,
        });
      } else if (editing) {
        await CrmCategoryService.rename(editing.id, { name: draftName, slug: slugifyCrmName(draftName) });
      }
      setEditing(null);
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (category: CrmVendorCategory) => {
    setSaving(true);
    try {
      await CrmCategoryService.rename(category.id, { isActive: !category.is_active });
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (query.trim()) return;
    const otherIndex = index + direction;
    if (!rows[otherIndex]) return;
    const ordered = rows.map((row) => row.id);
    [ordered[index], ordered[otherIndex]] = [ordered[otherIndex], ordered[index]];
    setSaving(true);
    try {
      await CrmCategoryService.reorder(ordered);
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await CrmCategoryService.remove(confirmDelete.id);
      setConfirmDelete(null);
      await load(false, true);
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrm"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Vendor Categories</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>Shared across every cluster</Text>
        </View>
        <Pressable
          accessibilityLabel="Add category"
          className="min-w-11 min-h-11 items-center justify-center rounded-full bg-primary"
          onPress={() => openEditor("new")}
        >
          <Plus size={19} color="#FFFFFF" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true, true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <ResponsiveSection>
            <CrmSearchBar value={query} placeholder="Search categories" onChangeText={setQuery} />
          </ResponsiveSection>

          {error ? (
            <ResponsiveSection>
              <AdminErrorState message={error} onRetry={() => setError(null)} />
            </ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={4} />
            ) : !filtered.length ? (
              <AdminEmptyState
                title={rows.length ? "No categories match your search" : "No vendor categories yet"}
                message={rows.length ? "Try a different search term." : "Add categories like Venues, Photographers or Decorators."}
              />
            ) : (
              <View className="gap-3">
                {filtered.map((category, index) => (
                  <CRMCard key={category.id} className="p-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 min-w-0 pr-2">
                        <View className="flex-row items-center flex-wrap gap-2">
                          <Text className="text-foreground text-base font-bold" numberOfLines={1}>{category.name}</Text>
                          {!category.is_active ? (
                            <View className="px-2 py-0.5 rounded-full bg-muted">
                              <Text className="text-muted-foreground text-caption font-bold">INACTIVE</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <View className="flex-row items-center justify-end gap-1 mt-3 pt-3 border-t border-border">
                      <Pressable accessibilityLabel="Move up" disabled={!index || Boolean(query.trim())} onPress={() => void move(index, -1)} className="w-9 h-9 rounded-xl items-center justify-center" style={{ opacity: !index || query.trim() ? 0.3 : 1 }}>
                        <ChevronUp size={16} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable accessibilityLabel="Move down" disabled={index === filtered.length - 1 || Boolean(query.trim())} onPress={() => void move(index, 1)} className="w-9 h-9 rounded-xl items-center justify-center" style={{ opacity: index === filtered.length - 1 || query.trim() ? 0.3 : 1 }}>
                        <ChevronDown size={16} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable accessibilityLabel={`Rename ${category.name}`} onPress={() => openEditor(category)} className="w-9 h-9 rounded-xl items-center justify-center">
                        <Edit3 size={15} className="text-primary" />
                      </Pressable>
                      <Switch
                        value={category.is_active}
                        onValueChange={() => void toggleActive(category)}
                        trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }}
                        thumbColor={category.is_active ? "#E91E63" : "#FFFFFF"}
                      />
                      <Pressable accessibilityLabel={`Delete ${category.name}`} onPress={() => setConfirmDelete(category)} className="w-9 h-9 rounded-xl items-center justify-center">
                        <Trash2 size={15} color="#DC3545" />
                      </Pressable>
                    </View>
                  </CRMCard>
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setEditing(null)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-start justify-between mb-4">
              <Text className="text-foreground text-lg font-bold">{editing === "new" ? "Add" : "Rename"} Category</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setEditing(null)}><X size={18} className="text-foreground" /></Pressable>
            </View>
            <Text className="text-foreground text-xs font-semibold mb-2">Category name</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="e.g. Photographers"
              placeholderTextColor="#9CA3AF"
              className="h-12 border border-border rounded-2xl px-4 text-foreground bg-background"
            />
            <View className="flex-row gap-3 mt-5">
              <Pressable disabled={saving} onPress={() => setEditing(null)} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center">
                <Text className="text-foreground text-sm font-bold">Cancel</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={() => void save()} className="flex-1 h-12 rounded-2xl bg-primary items-center justify-center">
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={confirmDelete !== null} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setConfirmDelete(null)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card items-center" onPress={(event) => event.stopPropagation()}>
            <Text className="text-foreground text-lg font-bold text-center">Delete {confirmDelete?.name}?</Text>
            <Text className="text-muted-foreground text-xs text-center mt-2">If any vendors are tagged with this category, deletion will be blocked — deactivate it instead to hide it from new selections.</Text>
            <View className="flex-row gap-3 mt-5 w-full">
              <Pressable disabled={saving} onPress={() => setConfirmDelete(null)} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center">
                <Text className="text-foreground text-sm font-bold">Cancel</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={() => void performDelete()} className="flex-1 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: "#DC3545" }}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
