import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  Eye,
  ImagePlus,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import HeroSlideMedia from "@/components/home/HeroSlideMedia";
import { pickAndUploadImage } from "@/services/cloudinary";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import { HeroSlideService } from "@/services/heroSlides";
import { HERO_MOBILE_ASPECT, HERO_SLIDES_MAX, type HeroSlide } from "@/types/hero";

const PINK = "#E91E63";

type Draft = {
  imageUrl: string;
  desktopImageUrl: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  ctaLabel: string;
  isActive: boolean;
};

const emptyDraft = (): Draft => ({
  imageUrl: "",
  desktopImageUrl: "",
  categoryId: "",
  categorySlug: "",
  categoryName: "",
  ctaLabel: "",
  isActive: true,
});

function errorMessage(reason: unknown) {
  if (reason instanceof Error && reason.message) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Something went wrong.");
  }
  return "Something went wrong.";
}

function SlidePreviewCard({
  imageUrl,
  categoryName,
  ctaLabel,
  wide = false,
}: {
  imageUrl: string;
  categoryName: string;
  ctaLabel: string;
  wide?: boolean;
}) {
  const label = ctaLabel.trim() || (categoryName ? `Find ${categoryName}` : "Find Vendors");

  return (
    <View
      style={{
        width: "100%",
        // Mirror the real shells: desktop is a fixed-height banner, mobile is
        // locked to HERO_MOBILE_ASPECT so the preview crops exactly like the app.
        ...(wide ? { height: 120 } : { aspectRatio: HERO_MOBILE_ASPECT }),
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#141014",
        position: "relative",
        margin: 0,
        padding: 0,
        borderWidth: 0,
      }}
    >
      {imageUrl ? (
        <HeroSlideMedia
          uri={imageUrl}
          accessibilityLabel={`${categoryName || "Hero"} preview`}
          fill={wide ? "blend" : "cover"}
          // Single image, no pager here, so the radius can ride on the image itself.
          borderRadius={18}
        />
      ) : null}
      <View style={{ position: "absolute", zIndex: 2, left: 16, bottom: 16 }}>
        <View
          style={{
            minHeight: 29,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: PINK,
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "800" }}>{label}</Text>
          <ChevronRight size={12} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

export default function AdminHero() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"mobile" | "desktop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<HeroSlide | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [preview, setPreview] = useState<HeroSlide | Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HeroSlide | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const loadCategories = useCallback(async (force = false) => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const rows = await CategoryService.list({ force });
      // Show every marketplace category the app already knows about.
      // Prefer active ones first, but never hide the dropdown when data exists.
      const sorted = [...rows].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });
      setCategories(sorted);
      if (!sorted.length) {
        setCategoriesError("No categories found in Supabase. Add marketplace categories first.");
      }
    } catch (reason) {
      setCategories([]);
      setCategoriesError(errorMessage(reason));
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadSlides = useCallback(async (isRefresh = false, force = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setSlides(await HeroSlideService.listAdmin(force));
    } catch (reason) {
      setError(errorMessage(reason));
      setSlides([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadAll = useCallback(async (isRefresh = false, force = false) => {
    await Promise.all([loadSlides(isRefresh, force), loadCategories(force)]);
  }, [loadCategories, loadSlides]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => HeroSlideService.subscribe(() => void loadSlides(false, true)), [loadSlides]);

  const canAdd = slides.length < HERO_SLIDES_MAX;
  const activeCount = useMemo(() => slides.filter((slide) => slide.is_active).length, [slides]);

  const openEditor = (slide: HeroSlide | "new") => {
    if (slide === "new") {
      if (!canAdd) {
        setError(`Hero Section supports a maximum of ${HERO_SLIDES_MAX} slides.`);
        return;
      }
      setDraft(emptyDraft());
    } else {
      setDraft({
        imageUrl: slide.image_url,
        desktopImageUrl: slide.desktop_image_url ?? "",
        categoryId: slide.category_id,
        categorySlug: slide.category_slug,
        categoryName: slide.category_name,
        ctaLabel: slide.cta_label,
        isActive: slide.is_active,
      });
    }
    setEditing(slide);
    setError(null);
    if (!categories.length && !categoriesLoading) void loadCategories(true);
  };

  const selectCategory = (category: CategoryRecord) => {
    setDraft((current) => ({
      ...current,
      categoryId: category.id,
      categorySlug: category.slug,
      categoryName: category.name,
      ctaLabel: current.ctaLabel.trim() ? current.ctaLabel : `Find ${category.name}`,
    }));
    setCategoryPickerOpen(false);
  };

  const uploadImage = async (target: "mobile" | "desktop") => {
    setUploading(target);
    setError(null);
    try {
      const url = await pickAndUploadImage({
        allowsEditing: true,
        aspect: target === "desktop" ? [16, 6] : [16, 9],
        quality: 0.9,
      });
      if (url) {
        setDraft((current) =>
          target === "desktop"
            ? { ...current, desktopImageUrl: url }
            : { ...current, imageUrl: url },
        );
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!draft.imageUrl.trim()) {
      setError("Upload a mobile/tablet background image for this slide.");
      return;
    }
    if (!draft.categoryId || !draft.categorySlug.trim() || !draft.categoryName.trim()) {
      setError("Select a category for the button destination.");
      return;
    }
    if (!draft.ctaLabel.trim()) {
      setError("Enter button text, for example “Find Photographers”.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        imageUrl: draft.imageUrl.trim(),
        desktopImageUrl: draft.desktopImageUrl.trim() || null,
        categoryId: draft.categoryId,
        categorySlug: draft.categorySlug.trim(),
        categoryName: draft.categoryName.trim(),
        ctaLabel: draft.ctaLabel.trim(),
        isActive: draft.isActive,
      };
      if (editing === "new") {
        await HeroSlideService.create(payload);
      } else if (editing) {
        await HeroSlideService.update(editing.id, payload);
      }
      setEditing(null);
      await loadSlides(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (slide: HeroSlide) => {
    setSaving(true);
    setError(null);
    try {
      await HeroSlideService.setActive(slide.id, !slide.is_active);
      await loadSlides(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const otherIndex = index + direction;
    if (!slides[otherIndex]) return;
    const ordered = slides.map((slide) => slide.id);
    [ordered[index], ordered[otherIndex]] = [ordered[otherIndex], ordered[index]];
    setSaving(true);
    setError(null);
    try {
      await HeroSlideService.reorder(ordered);
      await loadSlides(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    setError(null);
    try {
      await HeroSlideService.remove(confirmDelete.id);
      setConfirmDelete(null);
      await loadSlides(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadAll(true, true)}
            tintColor={PINK}
          />
        }
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Hero Section"
            subtitle="Manage up to 8 home carousel slides"
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add hero slide"
                disabled={!canAdd}
                onPress={() => openEditor("new")}
                className="min-w-11 min-h-11 rounded-full bg-primary items-center justify-center"
                style={{ opacity: canAdd ? 1 : 0.4 }}
              >
                <Plus size={19} color="#FFFFFF" />
              </Pressable>
            }
          />

          <View className="flex-row gap-3 mb-5">
            <View className="flex-1 bg-card border border-border rounded-2xl p-4">
              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Slides</Text>
              <Text className="text-foreground text-xl font-bold mt-1">{slides.length}/{HERO_SLIDES_MAX}</Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl p-4">
              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Active</Text>
              <Text className="text-foreground text-xl font-bold mt-1">{activeCount}</Text>
            </View>
          </View>

          {error && !editing ? (
            <View className="mb-4">
              <AdminErrorState message={error} onRetry={() => void loadSlides(false, true)} />
            </View>
          ) : null}

          {loading ? (
            <AdminLoadingState label="Loading hero slides…" />
          ) : !slides.length ? (
            <AdminEmptyState
              title="No hero slides yet"
              message="Add up to 8 slides with a background image, category destination, and button text."
            />
          ) : (
            <View className="gap-3">
              {slides.map((slide, index) => (
                <View key={slide.id} className="bg-card border border-border rounded-2xl p-4">
                  <View className="flex-row gap-3">
                    <Image
                      source={{ uri: slide.image_url }}
                      style={{ width: 88, height: 64, borderRadius: 12, backgroundColor: "#F3E5EA" }}
                      resizeMode="cover"
                    />
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center flex-wrap gap-2">
                        <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                          {slide.category_name}
                        </Text>
                        {!slide.is_active ? (
                          <View className="px-2 py-0.5 rounded-full bg-muted">
                            <Text className="text-muted-foreground text-[9px] font-bold">DISABLED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                        Button: {slide.cta_label}
                      </Text>
                      <Text className="text-muted-foreground text-[10px] mt-1">
                        Order {index + 1} · /VendorsListing?category={slide.category_slug}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-border">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-muted-foreground text-xs font-semibold">Active</Text>
                      <Switch
                        value={slide.is_active}
                        onValueChange={() => void toggleActive(slide)}
                        disabled={saving}
                        trackColor={{ false: "#D4C7CD", true: "#F7A8C4" }}
                        thumbColor={slide.is_active ? PINK : "#F5F5F5"}
                      />
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Pressable
                        accessibilityLabel="Move up"
                        disabled={!index || saving}
                        onPress={() => void move(index, -1)}
                        className="w-9 h-9 rounded-xl items-center justify-center"
                        style={{ opacity: !index || saving ? 0.3 : 1 }}
                      >
                        <ChevronUp size={16} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Move down"
                        disabled={index === slides.length - 1 || saving}
                        onPress={() => void move(index, 1)}
                        className="w-9 h-9 rounded-xl items-center justify-center"
                        style={{ opacity: index === slides.length - 1 || saving ? 0.3 : 1 }}
                      >
                        <ChevronDown size={16} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Preview ${slide.category_name}`}
                        onPress={() => setPreview(slide)}
                        className="w-9 h-9 rounded-xl items-center justify-center"
                      >
                        <Eye size={16} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Edit ${slide.category_name}`}
                        onPress={() => openEditor(slide)}
                        className="w-9 h-9 rounded-xl items-center justify-center"
                      >
                        <Edit3 size={16} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Delete ${slide.category_name}`}
                        onPress={() => setConfirmDelete(slide)}
                        className="w-9 h-9 rounded-xl items-center justify-center"
                      >
                        <Trash2 size={16} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>

      <AdminFooter activeTab="profile" />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => !saving && setEditing(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setEditing(null)}>
          <Pressable
            className="w-full max-w-lg rounded-3xl bg-card max-h-[90%]"
            onPress={(event) => event.stopPropagation()}
          >
            <View className="flex-row items-center px-5 py-4 border-b border-border">
              <Text className="flex-1 text-foreground text-lg font-bold">
                {editing === "new" ? "Add hero slide" : "Edit hero slide"}
              </Text>
              <Pressable
                accessibilityLabel="Close editor"
                disabled={saving}
                onPress={() => setEditing(null)}
                className="w-10 h-10 rounded-full items-center justify-center"
              >
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
              {error && editing ? (
                <View className="mb-3">
                  <AdminErrorState message={error} onRetry={() => setError(null)} />
                </View>
              ) : null}

              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                Mobile / tablet image
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upload mobile hero background image"
                onPress={() => void uploadImage("mobile")}
                disabled={Boolean(uploading) || saving}
                className="border border-dashed border-border rounded-2xl overflow-hidden mb-2"
                style={{ minHeight: 140, backgroundColor: "#FAF4F6" }}
              >
                {draft.imageUrl ? (
                  <Image source={{ uri: draft.imageUrl }} resizeMode="cover" style={{ width: "100%", height: 160 }} />
                ) : (
                  <View className="items-center justify-center py-10">
                    {uploading === "mobile" ? (
                      <ActivityIndicator color={PINK} />
                    ) : (
                      <>
                        <ImagePlus size={22} color={PINK} />
                        <Text className="text-foreground text-sm font-semibold mt-2">Upload image</Text>
                        <Text className="text-muted-foreground text-xs mt-1">16:9 landscape recommended</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {draft.imageUrl ? (
                <Pressable onPress={() => void uploadImage("mobile")} disabled={Boolean(uploading) || saving} className="mb-4">
                  <Text className="text-primary text-sm font-semibold">
                    {uploading === "mobile" ? "Uploading…" : "Replace mobile image"}
                  </Text>
                </Pressable>
              ) : (
                <View className="mb-4" />
              )}

              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                Desktop hero image
              </Text>
              <Text className="text-muted-foreground text-[10px] mb-2">
                Optional wide banner for web/desktop (~16:6). If empty, the mobile image is used.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upload desktop hero background image"
                onPress={() => void uploadImage("desktop")}
                disabled={Boolean(uploading) || saving}
                className="border border-dashed border-border rounded-2xl overflow-hidden mb-2"
                style={{ minHeight: 110, backgroundColor: "#FAF4F6" }}
              >
                {draft.desktopImageUrl ? (
                  <Image
                    source={{ uri: draft.desktopImageUrl }}
                    resizeMode="contain"
                    style={{ width: "100%", height: 120, backgroundColor: "#251B20" }}
                  />
                ) : (
                  <View className="items-center justify-center py-8">
                    {uploading === "desktop" ? (
                      <ActivityIndicator color={PINK} />
                    ) : (
                      <>
                        <ImagePlus size={22} color={PINK} />
                        <Text className="text-foreground text-sm font-semibold mt-2">Upload desktop image</Text>
                        <Text className="text-muted-foreground text-xs mt-1">16:6 wide banner recommended</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              <View className="flex-row gap-4 mb-4">
                {draft.desktopImageUrl ? (
                  <Pressable onPress={() => void uploadImage("desktop")} disabled={Boolean(uploading) || saving}>
                    <Text className="text-primary text-sm font-semibold">
                      {uploading === "desktop" ? "Uploading…" : "Replace desktop image"}
                    </Text>
                  </Pressable>
                ) : null}
                {draft.desktopImageUrl ? (
                  <Pressable
                    onPress={() => setDraft((current) => ({ ...current, desktopImageUrl: "" }))}
                    disabled={Boolean(uploading) || saving}
                  >
                    <Text className="text-muted-foreground text-sm font-semibold">Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                Category destination
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select category"
                onPress={() => {
                  if (!categories.length) void loadCategories(true);
                  setCategoryPickerOpen(true);
                }}
                className="min-h-12 px-4 rounded-2xl border border-border bg-background flex-row items-center mb-1"
              >
                <Text className={draft.categoryName ? "flex-1 text-foreground text-sm font-semibold" : "flex-1 text-muted-foreground text-sm"}>
                  {draft.categoryName || "Select a category"}
                </Text>
                <ChevronDown size={16} className="text-muted-foreground" />
              </Pressable>
              {draft.categorySlug ? (
                <Text className="text-muted-foreground text-[10px] mb-4">
                  Routes to /VendorsListing?category={draft.categorySlug}
                </Text>
              ) : (
                <View className="mb-4" />
              )}

              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                Button text
              </Text>
              <TextInput
                value={draft.ctaLabel}
                onChangeText={(ctaLabel) => setDraft((current) => ({ ...current, ctaLabel }))}
                placeholder='e.g. "Find Photographers"'
                placeholderTextColor="#9A8A90"
                className="min-h-12 px-4 rounded-2xl border border-border bg-background text-foreground text-sm mb-4"
              />

              <View className="flex-row items-center justify-between mb-5 px-1">
                <View className="flex-1 pr-3">
                  <Text className="text-foreground text-sm font-semibold">Enable slide</Text>
                  <Text className="text-muted-foreground text-xs mt-1">
                    Disabled slides stay saved but are hidden on the home page.
                  </Text>
                </View>
                <Switch
                  value={draft.isActive}
                  onValueChange={(isActive) => setDraft((current) => ({ ...current, isActive }))}
                  trackColor={{ false: "#D4C7CD", true: "#F7A8C4" }}
                  thumbColor={draft.isActive ? PINK : "#F5F5F5"}
                />
              </View>

              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                Mobile preview
              </Text>
              <SlidePreviewCard
                imageUrl={draft.imageUrl}
                categoryName={draft.categoryName}
                ctaLabel={draft.ctaLabel}
              />
              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2 mt-4">
                Desktop preview
              </Text>
              <SlidePreviewCard
                imageUrl={draft.desktopImageUrl || draft.imageUrl}
                categoryName={draft.categoryName}
                ctaLabel={draft.ctaLabel}
                wide
              />

              <View className="flex-row gap-3 mt-5">
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => setEditing(null)}
                  className="flex-1 min-h-12 rounded-2xl border border-border items-center justify-center"
                >
                  <Text className="text-foreground text-sm font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || Boolean(uploading)}
                  onPress={() => void save()}
                  className="flex-1 min-h-12 rounded-2xl bg-primary items-center justify-center"
                  style={{ opacity: saving || uploading ? 0.6 : 1 }}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-white text-sm font-bold">
                      {editing === "new" ? "Add slide" : "Save changes"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => setCategoryPickerOpen(false)}>
          <Pressable className="w-full max-w-md rounded-3xl bg-card max-h-[70%]" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-center px-4 py-3 border-b border-border">
              <Text className="flex-1 text-foreground text-lg font-bold">Select category</Text>
              <Pressable onPress={() => setCategoryPickerOpen(false)} className="w-10 h-10 items-center justify-center">
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 28 }}>
              {categoriesLoading ? (
                <View className="py-10 items-center">
                  <ActivityIndicator color={PINK} />
                  <Text className="text-muted-foreground text-sm mt-3">Loading categories…</Text>
                </View>
              ) : categoriesError ? (
                <View className="gap-3">
                  <AdminErrorState message={categoriesError} onRetry={() => void loadCategories(true)} />
                </View>
              ) : !categories.length ? (
                <AdminEmptyState
                  title="No categories available"
                  message="Marketplace categories could not be loaded from Supabase."
                />
              ) : (
                categories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => selectCategory(category)}
                    className="min-h-12 px-3 rounded-xl flex-row items-center"
                    style={{
                      backgroundColor: draft.categoryId === category.id ? "#FFF0F6" : "transparent",
                      opacity: category.isActive ? 1 : 0.55,
                    }}
                  >
                    <View className="flex-1 min-w-0 pr-2">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {category.name}
                      </Text>
                      <Text className="text-muted-foreground text-[10px]" numberOfLines={1}>
                        {category.slug}{category.isActive ? "" : " · inactive"}
                      </Text>
                    </View>
                    {draft.categoryId === category.id ? (
                      <Text className="text-primary text-xs font-bold">Selected</Text>
                    ) : null}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => setPreview(null)}>
          <Pressable className="w-full max-w-lg rounded-3xl p-5 bg-card" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-center mb-3">
              <Text className="flex-1 text-foreground text-lg font-bold">Slide preview</Text>
              <Pressable onPress={() => setPreview(null)} className="w-10 h-10 items-center justify-center">
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            {preview ? (
              <View className="gap-4">
                <View>
                  <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                    Mobile / tablet
                  </Text>
                  <SlidePreviewCard
                    imageUrl={"image_url" in preview ? preview.image_url : preview.imageUrl}
                    categoryName={"category_name" in preview ? preview.category_name : preview.categoryName}
                    ctaLabel={"cta_label" in preview ? preview.cta_label : preview.ctaLabel}
                  />
                </View>
                <View>
                  <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">
                    Desktop
                  </Text>
                  <SlidePreviewCard
                    imageUrl={
                      "desktop_image_url" in preview
                        ? (preview.desktop_image_url || preview.image_url)
                        : (preview.desktopImageUrl || preview.imageUrl)
                    }
                    categoryName={"category_name" in preview ? preview.category_name : preview.categoryName}
                    ctaLabel={"cta_label" in preview ? preview.cta_label : preview.ctaLabel}
                    wide
                  />
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={confirmDelete !== null} transparent animationType="fade" onRequestClose={() => !saving && setConfirmDelete(null)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setConfirmDelete(null)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card" onPress={(event) => event.stopPropagation()}>
            <Text className="text-foreground text-lg font-bold">Delete slide?</Text>
            <Text className="text-muted-foreground text-sm mt-2 leading-5">
              “{confirmDelete?.category_name}” will be removed from the home hero carousel. This cannot be undone.
            </Text>
            <View className="flex-row gap-3 mt-5">
              <Pressable
                disabled={saving}
                onPress={() => setConfirmDelete(null)}
                className="flex-1 min-h-12 rounded-2xl border border-border items-center justify-center"
              >
                <Text className="text-foreground text-sm font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() => void performDelete()}
                className="flex-1 min-h-12 rounded-2xl items-center justify-center"
                style={{ backgroundColor: "#DC2626", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white text-sm font-bold">Delete</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
