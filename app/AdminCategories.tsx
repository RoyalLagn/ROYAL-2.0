import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FolderTree, ImagePlus, Plus, RefreshCw, Search, Store, Trash2, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { useCategories } from "@/context/CategoryContext";
import { CategoryService, slugify, type CategoryRecord, type CategoryUsage } from "@/services/CategoryService";
import { MediaError, deleteAdminManagedImage, pickAndUploadImage } from "@/services/media";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Draft = { name: string; slug: string; slugTouched: boolean; description: string; iconUrl: string | null; fallbackImageUrl: string | null };
const emptyDraft: Draft = { name: "", slug: "", slugTouched: false, description: "", iconUrl: null, fallbackImageUrl: null };

function describeCategoryError(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message) {
    // Postgres unique_violation on categories_slug_unique_idx.
    if ((caught as { code?: string }).code === "23505") return "Category already exists.";
    return caught.message;
  }
  if (caught && typeof caught === "object") {
    const record = caught as { message?: unknown; code?: unknown };
    if (record.code === "23505") return "Category already exists.";
    if (typeof record.message === "string" && record.message.trim()) return record.message;
  }
  return fallback;
}

export default function AdminCategories() {
  const { categories, loading, refresh } = useCategories();
  const { width } = useResponsiveLayout();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRecord | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<CategoryUsage | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return categories.filter((category) => !needle || [category.name, category.slug, category.description].some((value) => value.toLowerCase().includes(needle))).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); }, [categories, query]);
  const reload = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };

  const openAdd = () => { setDraft(emptyDraft); setFormError(null); setShowAdd(true); };
  const closeAdd = () => { if (saving) return; setShowAdd(false); setDraft(emptyDraft); setFormError(null); };

  const setName = (name: string) => setDraft((current) => ({ ...current, name, slug: current.slugTouched ? current.slug : slugify(name) }));
  const setSlug = (slug: string) => setDraft((current) => ({ ...current, slug, slugTouched: true }));

  const chooseIcon = async () => {
    setUploadingIcon(true); setFormError(null);
    try {
      const url = await pickAndUploadImage({ quality: 0.85 });
      if (url) setDraft((current) => ({ ...current, iconUrl: url }));
    } catch (caught) {
      setFormError(caught instanceof MediaError ? caught.message : "Unable to upload the icon image.");
    } finally {
      setUploadingIcon(false);
    }
  };
  const chooseImage = async () => {
    setUploadingImage(true); setFormError(null);
    try {
      const url = await pickAndUploadImage({ quality: 0.85 });
      if (url) setDraft((current) => ({ ...current, fallbackImageUrl: url }));
    } catch (caught) {
      setFormError(caught instanceof MediaError ? caught.message : "Unable to upload the category image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const save = async () => {
    const name = draft.name.trim();
    const slug = slugify(draft.slug || draft.name);
    if (!name) return setFormError("Enter a category name.");
    if (!slug || !SLUG_PATTERN.test(slug)) return setFormError("Enter a valid slug using lowercase letters, numbers and hyphens.");
    const nameLower = name.toLowerCase();
    const duplicate = categories.some((category) => category.name.toLowerCase() === nameLower || category.slug.toLowerCase() === slug);
    if (duplicate) return setFormError("Category already exists.");

    setSaving(true); setFormError(null);
    try {
      await CategoryService.create({ name, slug, description: draft.description.trim(), iconUrl: draft.iconUrl, fallbackImageUrl: draft.fallbackImageUrl });
      setShowAdd(false);
      setDraft(emptyDraft);
      await refresh();
      Alert.alert("Category added successfully.");
    } catch (caught) {
      // Keep the modal open with everything the admin typed intact so they
      // can fix the issue and retry — never a false success.
      setFormError(describeCategoryError(caught, "Unable to save this category. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const openDelete = async (category: CategoryRecord) => {
    setDeleteTarget(category);
    setDeleteUsage(null);
    setUsageError(null);
    setDeleteError(null);
    setCheckingUsage(true);
    try {
      setDeleteUsage(await CategoryService.usage(category.id));
    } catch (caught) {
      setUsageError(describeCategoryError(caught, "Unable to check whether this category is in use."));
    } finally {
      setCheckingUsage(false);
    }
  };
  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteUsage(null);
    setUsageError(null);
    setDeleteError(null);
  };
  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await CategoryService.remove(deleteTarget.id);
      await Promise.all([
        deleteAdminManagedImage(deleteTarget.iconUrl ?? ""),
        deleteAdminManagedImage(deleteTarget.fallbackImageUrl ?? ""),
        deleteAdminManagedImage(deleteTarget.homeImageUrl ?? ""),
      ]);
      const name = deleteTarget.name;
      setDeleteTarget(null);
      setDeleteUsage(null);
      await refresh();
      Alert.alert("Category deleted", `"${name}" was permanently deleted. Any vendors, applications or hero slides that referenced it keep all their data — only the category tag was removed.`);
    } catch (caught) {
      // Keep the modal open on failure — never a false success.
      setDeleteError(describeCategoryError(caught, "Unable to delete this category. Try again."));
    } finally {
      setDeleting(false);
    }
  };
  const usageParts = deleteUsage ? [
    deleteUsage.vendors ? `${deleteUsage.vendors} vendor${deleteUsage.vendors === 1 ? "" : "s"}` : null,
    deleteUsage.vendorApplications ? `${deleteUsage.vendorApplications} pending application${deleteUsage.vendorApplications === 1 ? "" : "s"}` : null,
    deleteUsage.heroSlides ? `${deleteUsage.heroSlides} hero slide${deleteUsage.heroSlides === 1 ? "" : "s"}` : null,
  ].filter(Boolean) as string[] : [];
  const availableWidth = gridWidth || width;
  const categoryColumns = availableWidth >= 1040 ? 3 : availableWidth >= 580 ? 2 : 1;
  const categoryCardWidth = categoryColumns === 1 ? "100%" : (availableWidth - (categoryColumns - 1) * 14) / categoryColumns;

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}><ScrollView contentContainerStyle={{ paddingBottom: 72 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor="#0878E8" />}>
    <ResponsiveContainer><AdminPageHeader title="Categories" subtitle="Live marketplace category directory" action={<View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Add New Category" onPress={openAdd} className="h-11 rounded-xl bg-primary flex-row items-center px-4 gap-2 shadow-sm hover:bg-[#D81B60] hover:-translate-y-px active:opacity-85 transition-all duration-200 ease-out"><Plus size={17} color="#FFFFFF" /><Text className="text-white text-sm font-bold">Add New Category</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh categories" onPress={() => void reload()} className="w-11 h-11 rounded-xl border border-border bg-card items-center justify-center hover:bg-muted active:opacity-75 transition-colors duration-200"><RefreshCw size={19} className="text-primary" /></Pressable>
    </View>} />
      <View className="flex-row gap-3 mb-6"><Metric icon={FolderTree} value={categories.length} label="Categories" /><Metric icon={Store} value={categories.reduce((sum, item) => sum + item.vendorCount, 0)} label="Listed vendors" /></View>
      <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center mb-5 shadow-sm"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={setQuery} placeholder="Search categories" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground text-sm" /></View>
      {loading ? <AdminLoadingState label="Loading categories…" /> : !filtered.length ? <AdminEmptyState title="No categories found" message="Try another search." /> : <View onLayout={(event) => { const nextWidth = Math.round(event.nativeEvent.layout.width); if (nextWidth !== gridWidth) setGridWidth(nextWidth); }} className="flex-row flex-wrap gap-3">{filtered.map((category) => { const Icon = category.icon; return <View key={category.id} style={{ width: categoryCardWidth }} className="min-h-[150px] bg-card border border-border rounded-2xl p-4 shadow-sm hover:border-primary/35 hover:-translate-y-px hover:shadow-md transition-all duration-200 ease-out">
        <View className="flex-row items-start justify-between">
          <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: category.iconBg }}><Icon size={20} color={category.iconColor} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${category.name}`} onPress={() => void openDelete(category)} hitSlop={6} className="w-10 h-10 rounded-xl items-center justify-center bg-red-500/10 hover:bg-red-500/15 active:opacity-70 transition-colors duration-200"><Trash2 size={16} color="#DC3545" /></Pressable>
        </View>
        <View className="mt-4">
          <Text numberOfLines={1} className="text-foreground text-card-title font-bold">{category.name}</Text>
          <Text numberOfLines={2} className="text-muted-foreground text-xs mt-1 min-h-[34px]">{category.description || category.slug}</Text>
        </View>
        <View className="mt-auto pt-4 flex-row items-end justify-between border-t border-border/70">
          <View><Text className="text-foreground text-xl font-bold">{category.vendorCount}</Text><Text className="text-muted-foreground text-caption mt-0.5">vendors</Text></View>
          <View className={category.isActive ? "px-2.5 py-1 rounded-full bg-emerald-500/10" : "px-2.5 py-1 rounded-full bg-muted"}><Text className={category.isActive ? "text-emerald-700 text-caption font-bold" : "text-muted-foreground text-caption font-bold"}>{category.isActive ? "Active" : "Inactive"}</Text></View>
        </View>
      </View>; })}</View>}
    </ResponsiveContainer>
  </ScrollView><AdminFooter activeTab="profile" />

  <Modal visible={showAdd} transparent animationType="fade" onRequestClose={closeAdd}>
    <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={closeAdd}>
      <Pressable className="w-full max-w-md rounded-3xl border border-border p-5 bg-card shadow-lg" onPress={(event) => event.stopPropagation()}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-start justify-between mb-4">
            <Text className="text-foreground text-lg font-bold">Add New Category</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeAdd} className="w-10 h-10 -mr-2 -mt-2 rounded-xl items-center justify-center hover:bg-muted active:opacity-70"><X size={18} className="text-foreground" /></Pressable>
          </View>

          {formError ? <View className="rounded-2xl px-4 py-3 mb-4 bg-red-500/10"><Text className="text-red-600 text-xs">{formError}</Text></View> : null}

          <Text className="text-foreground text-xs font-semibold mb-2">Category Name</Text>
          <TextInput value={draft.name} onChangeText={setName} placeholder="e.g. Wedding Cars" placeholderTextColor="#9CA3AF" className="h-12 border border-border rounded-xl px-4 text-foreground bg-background mb-4 focus:border-primary" />

          <Text className="text-foreground text-xs font-semibold mb-2">Description</Text>
          <TextInput value={draft.description} onChangeText={(description) => setDraft((current) => ({ ...current, description }))} placeholder="Optional short description" placeholderTextColor="#9CA3AF" multiline className="min-h-20 border border-border rounded-xl px-4 py-3 text-foreground bg-background mb-4 focus:border-primary" style={{ textAlignVertical: "top" }} />

          <Text className="text-foreground text-xs font-semibold mb-2">Category Icon</Text>
          <Pressable accessibilityRole="button" disabled={uploadingIcon} onPress={() => void chooseIcon()} className="min-h-12 border border-dashed border-primary/35 rounded-xl px-4 flex-row items-center gap-3 mb-1 bg-background hover:bg-primary/5 active:opacity-75 transition-colors duration-200">
            {draft.iconUrl ? <Image source={{ uri: draft.iconUrl }} className="w-8 h-8 rounded-lg" /> : <ImagePlus size={18} className="text-muted-foreground" />}
            {uploadingIcon ? <ActivityIndicator color="#0878E8" /> : <Text className="text-foreground text-sm font-semibold">{draft.iconUrl ? "Change icon image" : "Choose icon image"}</Text>}
          </Pressable>
          <Text className="text-muted-foreground text-caption mb-4">Optional. This project does not have an admin-configurable icon set — the compact icon badge shown in lists is assigned in code, so a new category shows a default icon there regardless of this image.</Text>

          <Text className="text-foreground text-xs font-semibold mb-2">Category Image / Logo</Text>
          <Pressable accessibilityRole="button" disabled={uploadingImage} onPress={() => void chooseImage()} className="min-h-12 border border-dashed border-primary/35 rounded-xl px-4 flex-row items-center gap-3 mb-4 bg-background hover:bg-primary/5 active:opacity-75 transition-colors duration-200">
            {draft.fallbackImageUrl ? <Image source={{ uri: draft.fallbackImageUrl }} className="w-8 h-8 rounded-lg" /> : <ImagePlus size={18} className="text-muted-foreground" />}
            {uploadingImage ? <ActivityIndicator color="#0878E8" /> : <Text className="text-foreground text-sm font-semibold">{draft.fallbackImageUrl ? "Change category image" : "Upload image"}</Text>}
          </Pressable>

          <Text className="text-foreground text-xs font-semibold mb-2">Slug</Text>
          <TextInput value={draft.slug} onChangeText={setSlug} placeholder="wedding-cars" autoCapitalize="none" placeholderTextColor="#9CA3AF" className="h-12 border border-border rounded-xl px-4 text-foreground bg-background mb-1 focus:border-primary" />
          <Text className="text-muted-foreground text-caption mb-4">Auto-generated from the name. Edit if needed — lowercase letters, numbers and hyphens only.</Text>

          <View className="flex-row items-center justify-between border-t border-border pt-4">
            <Text className="text-foreground text-sm font-semibold">Active</Text>
            <View className="px-3 py-1.5 rounded-full bg-emerald-500/10"><Text className="text-emerald-600 text-caption font-bold">ON — new categories are active by default</Text></View>
          </View>

          <View className="flex-row gap-3 mt-5">
            <Pressable accessibilityRole="button" disabled={saving} onPress={closeAdd} className="flex-1 h-12 rounded-xl border border-border items-center justify-center hover:bg-muted active:opacity-75 transition-colors duration-200">
              <Text className="text-foreground text-sm font-bold">Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} className="flex-1 h-12 rounded-xl bg-primary items-center justify-center hover:bg-[#D81B60] active:opacity-85 transition-colors duration-200">
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Add Category</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>

  <Modal visible={deleteTarget !== null} transparent animationType="fade" onRequestClose={closeDelete}>
    <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={closeDelete}>
      <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card" onPress={(event) => event.stopPropagation()}>
        <Text className="text-foreground text-lg font-bold text-center">Delete Category?</Text>

        {checkingUsage ? (
          <View className="items-center py-6"><ActivityIndicator color="#0878E8" /><Text className="text-muted-foreground text-xs mt-3">Checking whether this category is in use…</Text></View>
        ) : usageError ? (
          <View className="mt-3 rounded-2xl px-4 py-3 bg-red-500/10"><Text className="text-red-600 text-xs">{usageError}</Text></View>
        ) : deleteUsage && deleteUsage.total > 0 ? (
          <>
            <Text className="text-foreground text-sm text-center mt-3">This category is currently used by {usageParts.join(", ")}.</Text>
            <Text className="text-muted-foreground text-xs text-center mt-2">Deleting this category will remove the category association from those records. Their vendor profiles and other business data will NOT be deleted.</Text>
          </>
        ) : (
          <Text className="text-muted-foreground text-xs text-center mt-3">Are you sure you want to permanently delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.</Text>
        )}

        {deleteError ? <View className="mt-3 rounded-2xl px-4 py-3 bg-red-500/10"><Text className="text-red-600 text-xs">{deleteError}</Text></View> : null}

        <View className="flex-row gap-3 mt-5">
          <Pressable disabled={deleting} onPress={closeDelete} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center">
            <Text className="text-foreground text-sm font-bold">Cancel</Text>
          </Pressable>
          <Pressable disabled={deleting || checkingUsage || !!usageError} onPress={() => void performDelete()} className="flex-1 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: "#DC3545", opacity: deleting || checkingUsage || usageError ? 0.6 : 1 }}>
            {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">{deleteUsage && deleteUsage.total > 0 ? "Delete Anyway" : "Delete Category"}</Text>}
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>
  </SafeAreaView>;
}
function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) { return <View className="flex-1 bg-card border border-border rounded-2xl p-4"><Icon size={18} className="text-primary" /><Text className="text-foreground text-2xl font-bold mt-2">{value}</Text><Text className="text-muted-foreground text-xs mt-1">{label}</Text></View>; }
