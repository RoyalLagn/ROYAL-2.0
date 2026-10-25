import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Edit3,
  Eye,
  ImagePlus,
  PanelsTopLeft,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { deleteAdminManagedImage, pickImage, uploadImage as uploadToMedia } from "@/services/media";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import { HeroSlideService } from "@/services/heroSlides";
import { HERO_IMAGE_ASPECT, HERO_SLIDES_MAX, type HeroSlide } from "@/types/hero";
import { typeScale } from "@/constants/typography";
import { adminPalette } from "@/theme";
import Pressable from "@/components/InteropSafePressable";
import { AdminReveal } from "@/components/admin/ui/AdminReveal";

const PINK = adminPalette.brand;
const HOME_CATEGORY_ASPECT = 18 / 25;
const HOME_CATEGORY_RATIO_TOLERANCE = 0.02;

type Draft = {
  imageUrl: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  ctaLabel: string;
  isActive: boolean;
};

const emptyDraft = (): Draft => ({
  imageUrl: "",
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
}: {
  imageUrl: string;
  categoryName: string;
  ctaLabel: string;
}) {
  const label = ctaLabel.trim() || (categoryName ? `Find ${categoryName}` : "Find Vendors");

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: HERO_IMAGE_ASPECT,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#141014",
        position: "relative",
      }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          accessibilityLabel={`${categoryName || "Hero"} preview`}
          // contain + matching 16:9 box = exact upload proportions, no stretch/crop.
          resizeMode="contain"
          style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
        />
      ) : null}
      <View style={{ position: "absolute", zIndex: 2, left: 16, bottom: 16, pointerEvents: "none" }}>
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
          <Text style={{ color: "#FFFFFF", fontSize: typeScale.caption, fontWeight: "700" }}>{label}</Text>
          <ChevronRight size={12} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

function HeroActionButton({
  accessibilityLabel,
  disabled,
  onPress,
  tone = "neutral",
  children,
}: React.PropsWithChildren<{
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  tone?: "neutral" | "danger";
}>) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed, hovered, focused }) => [
      styles.actionButton,
      tone === "danger" && styles.actionButtonDanger,
      (hovered || focused) && !disabled && styles.actionButtonHover,
      pressed && !disabled && styles.actionButtonPressed,
      disabled && styles.actionButtonDisabled,
    ]}
  >{children}</Pressable>;
}

function HeroMetric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <View style={styles.metricCard}>
    <View style={styles.metricIcon}><Icon size={18} color={PINK} strokeWidth={2} /></View>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>;
}

export default function AdminHero() {
  const { width: viewportWidth } = useWindowDimensions();
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoryImageSavingId, setCategoryImageSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<HeroSlide | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [preview, setPreview] = useState<HeroSlide | Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HeroSlide | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const draftUploads = useRef(new Set<string>());
  const cleanDraftUploads = useCallback(() => {
    for (const url of draftUploads.current) {
      void deleteAdminManagedImage(url).then(() => draftUploads.current.delete(url)).catch(() => undefined);
    }
  }, []);
  useEffect(() => () => cleanDraftUploads(), [cleanDraftUploads]);
  useEffect(() => { if (editing === null) cleanDraftUploads(); }, [editing, cleanDraftUploads]);

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
  const homeImageCategories = useMemo(
    () => categories.filter((category) => category.isActive && category.showOnHome),
    [categories],
  );
  const categoryCardBasis = viewportWidth >= 1500
    ? "23.9%"
    : viewportWidth >= 1050
      ? "31.8%"
      : viewportWidth >= 700
        ? "48.8%"
        : "100%";

  const uploadCategoryHomeImage = async (category: CategoryRecord) => {
    setError(null);
    try {
      const asset = await pickImage({
        allowsEditing: true,
        aspect: [18, 25],
        quality: 0.9,
      });
      if (!asset) return;

      const selectedAspect = asset.width > 0 && asset.height > 0
        ? asset.width / asset.height
        : null;
      if (selectedAspect === null || Math.abs(selectedAspect - HOME_CATEGORY_ASPECT) > HOME_CATEGORY_RATIO_TOLERANCE) {
        Alert.alert(
          "Use an 18:25 portrait image",
          `The selected image is ${asset.width || "unknown"} × ${asset.height || "unknown"} px. Please crop it to 18:25; 720 × 1000 px is recommended.`,
        );
        return;
      }

      setCategoryImageSavingId(category.id);
      const url = await uploadToMedia(asset, { folder: "royallagn/categories" });
      await CategoryService.updateHomeImage(category.id, url);
      if (category.homeImageUrl && category.homeImageUrl !== url) await deleteAdminManagedImage(category.homeImageUrl);
      await loadCategories(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCategoryImageSavingId(null);
    }
  };

  const restoreDefaultCategoryHomeImage = async (category: CategoryRecord) => {
    setCategoryImageSavingId(category.id);
    setError(null);
    try {
      await CategoryService.updateHomeImage(category.id, null);
      if (category.homeImageUrl) await deleteAdminManagedImage(category.homeImageUrl);
      await loadCategories(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCategoryImageSavingId(null);
    }
  };

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

  const uploadImage = async () => {
    setError(null);
    try {
      // Pick first — do not show a spinner until the managed-media upload starts.
      // (Previously the spinner started before the file picker, and web crop
      // mode often never resolved, leaving "Uploading…" stuck forever.)
      const asset = await pickImage({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });
      if (!asset) return;

      setUploading(true);
      const url = await uploadToMedia(asset, { folder: "royallagn/hero" });
      draftUploads.current.add(url);
      if (draft.imageUrl && draftUploads.current.has(draft.imageUrl)) {
        await deleteAdminManagedImage(draft.imageUrl);
        draftUploads.current.delete(draft.imageUrl);
      }
      if (url) setDraft((current) => ({ ...current, imageUrl: url }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!draft.imageUrl.trim()) {
      setError("Upload a hero image (16:9 landscape) for this slide.");
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
        // One image for all layouts — clear any legacy desktop banner.
        desktopImageUrl: null,
        categoryId: draft.categoryId,
        categorySlug: draft.categorySlug.trim(),
        categoryName: draft.categoryName.trim(),
        ctaLabel: draft.ctaLabel.trim(),
        isActive: draft.isActive,
      };
      if (editing === "new") {
        await HeroSlideService.create(payload);
        draftUploads.current.delete(payload.imageUrl);
      } else if (editing) {
        await HeroSlideService.update(editing.id, payload);
        draftUploads.current.delete(payload.imageUrl);
        if (editing.image_url !== payload.imageUrl) await deleteAdminManagedImage(editing.image_url);
        if (editing.desktop_image_url) await deleteAdminManagedImage(editing.desktop_image_url);
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
      await deleteAdminManagedImage(confirmDelete.image_url);
      if (confirmDelete.desktop_image_url) await deleteAdminManagedImage(confirmDelete.desktop_image_url);
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
        decelerationRate="fast"
        contentContainerStyle={{ paddingBottom: 72 }}
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

          <View style={styles.metricsRow}>
            <AdminReveal index={0} style={styles.metricReveal}><HeroMetric icon={PanelsTopLeft} label="Slides" value={`${slides.length}/${HERO_SLIDES_MAX}`} /></AdminReveal>
            <AdminReveal index={1} style={styles.metricReveal}><HeroMetric icon={CircleCheck} label="Active" value={activeCount} /></AdminReveal>
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
            <View style={styles.slideList}>
              {slides.map((slide, index) => (
                <AdminReveal key={slide.id} index={index + 2}>
                <View style={styles.slideCard}>
                  <View className="flex-row gap-3">
                    <Image
                      source={{ uri: slide.image_url }}
                      style={styles.slideImage}
                      resizeMode="cover"
                    />
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center flex-wrap gap-2">
                        <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                          {slide.category_name}
                        </Text>
                        {!slide.is_active ? (
                          <View className="px-2 py-0.5 rounded-full bg-muted">
                            <Text className="text-muted-foreground text-caption font-bold">DISABLED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                        Button: {slide.cta_label}
                      </Text>
                      <Text className="text-muted-foreground text-metadata mt-1">
                        Order {index + 1} · /VendorsListing?category={slide.category_slug}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.slideFooter}>
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
                      <HeroActionButton
                        accessibilityLabel={`Move ${slide.category_name} up`}
                        disabled={!index || saving}
                        onPress={() => void move(index, -1)}
                      >
                        <ChevronUp size={17} color={adminPalette.textSecondary} />
                      </HeroActionButton>
                      <HeroActionButton
                        accessibilityLabel={`Move ${slide.category_name} down`}
                        disabled={index === slides.length - 1 || saving}
                        onPress={() => void move(index, 1)}
                      >
                        <ChevronDown size={17} color={adminPalette.textSecondary} />
                      </HeroActionButton>
                      <HeroActionButton
                        accessibilityLabel={`Preview ${slide.category_name}`}
                        onPress={() => setPreview(slide)}
                      >
                        <Eye size={17} color={adminPalette.textSecondary} />
                      </HeroActionButton>
                      <HeroActionButton
                        accessibilityLabel={`Edit ${slide.category_name}`}
                        onPress={() => openEditor(slide)}
                      >
                        <Edit3 size={17} color={adminPalette.textSecondary} />
                      </HeroActionButton>
                      <HeroActionButton
                        accessibilityLabel={`Delete ${slide.category_name}`}
                        onPress={() => setConfirmDelete(slide)}
                        tone="danger"
                      >
                        <Trash2 size={17} color={adminPalette.error} />
                      </HeroActionButton>
                    </View>
                  </View>
                </View>
                </AdminReveal>
              ))}
            </View>
          )}

          <View style={styles.categoryImagesSection}>
            <View style={styles.sectionHeadingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Top Categories Images</Text>
                <Text style={styles.sectionDescription}>
                  These images appear in the public Home page Top Categories cards.
                </Text>
              </View>
              <View style={styles.ratioBadge}>
                <Text style={styles.ratioBadgeText}>18:25</Text>
              </View>
            </View>

            <View style={styles.imageGuideline}>
              <ImagePlus size={18} color={PINK} />
              <View style={{ flex: 1 }}>
                <Text style={styles.imageGuidelineTitle}>Required: 18:25 portrait</Text>
                <Text style={styles.imageGuidelineText}>Recommended 720 × 1000 px · JPG, PNG or WebP</Text>
              </View>
            </View>

            {categoriesLoading ? (
              <AdminLoadingState label="Loading category images…" />
            ) : categoriesError ? (
              <AdminErrorState message={categoriesError} onRetry={() => void loadCategories(true)} />
            ) : !homeImageCategories.length ? (
              <AdminEmptyState
                title="No Home categories"
                message="Enable Show on Home for a category to manage its Top Categories image here."
              />
            ) : (
              <View style={styles.categoryImageGrid}>
                {homeImageCategories.map((category) => {
                  const isSavingImage = categoryImageSavingId === category.id;
                  return (
                    <View key={category.id} style={[styles.categoryImageCard, { flexBasis: categoryCardBasis }]}>
                      <View style={styles.categoryImageMedia}>
                        <Image
                          source={category.homeImage}
                          resizeMode="cover"
                          style={styles.categoryImagePreview}
                          accessibilityLabel={`${category.name} Home category image`}
                        />
                        <View style={category.homeImageUrl ? styles.customBadge : styles.defaultBadge}>
                          <Text style={category.homeImageUrl ? styles.customBadgeText : styles.defaultBadgeText}>
                            {category.homeImageUrl ? "CUSTOM" : "DEFAULT"}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.categoryImageBody}>
                        <Text style={styles.categoryImageTitle} numberOfLines={2}>{category.name}</Text>
                        <View style={styles.categoryImageMetaRow}>
                          <Text style={styles.categoryImageHint}>18:25 portrait</Text>
                          <View style={styles.metaDot} />
                          <Text style={styles.categoryImageHint}>720 × 1000 px</Text>
                        </View>
                        <View style={styles.categoryImageActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${category.homeImageUrl ? "Replace" : "Upload"} ${category.name} Home image`}
                            disabled={categoryImageSavingId !== null}
                            onPress={() => void uploadCategoryHomeImage(category)}
                            style={({ pressed }) => [styles.categoryImagePrimaryAction, pressed && styles.actionButtonPressed]}
                          >
                            {isSavingImage ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                              <Text style={styles.categoryImagePrimaryActionText}>{category.homeImageUrl ? "Replace" : "Upload"}</Text>
                            )}
                          </Pressable>
                          {category.homeImageUrl ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Restore default image for ${category.name}`}
                              disabled={categoryImageSavingId !== null}
                              onPress={() => void restoreDefaultCategoryHomeImage(category)}
                              style={({ pressed }) => [styles.categoryImageSecondaryAction, pressed && styles.actionButtonPressed]}
                            >
                              <Text style={styles.categoryImageSecondaryActionText}>Use default</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
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

              <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
                Hero image
              </Text>
              <Text className="text-muted-foreground text-metadata mb-2">
                One image for mobile, tablet, and desktop. Use a landscape 16:9 photo.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upload hero image"
                onPress={() => void uploadImage()}
                disabled={uploading || saving}
                className="border border-dashed border-border rounded-2xl overflow-hidden mb-2"
                style={{ minHeight: 140, backgroundColor: "#FAF4F6" }}
              >
                {draft.imageUrl && !uploading ? (
                  <Image
                    source={{ uri: draft.imageUrl }}
                    resizeMode="contain"
                    style={{ width: "100%", aspectRatio: HERO_IMAGE_ASPECT, backgroundColor: "#141014" }}
                  />
                ) : (
                  <View className="items-center justify-center py-10">
                    {uploading ? (
                      <>
                        <ActivityIndicator color={PINK} />
                        <Text className="text-muted-foreground text-xs mt-3 font-semibold">Uploading…</Text>
                      </>
                    ) : (
                      <>
                        <ImagePlus size={22} color={PINK} />
                        <Text className="text-foreground text-sm font-semibold mt-2">Upload hero image</Text>
                        <Text className="text-muted-foreground text-xs mt-1">16:9 landscape</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>
              {draft.imageUrl ? (
                <Pressable onPress={() => void uploadImage()} disabled={uploading || saving} className="mb-4">
                  <Text className="text-primary text-sm font-semibold">
                    {uploading ? "Uploading…" : "Replace image"}
                  </Text>
                </Pressable>
              ) : (
                <View className="mb-4" />
              )}

              <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
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
                <Text className="text-muted-foreground text-metadata mb-4">
                  Routes to /VendorsListing?category={draft.categorySlug}
                </Text>
              ) : (
                <View className="mb-4" />
              )}

              <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
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

              <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
                Preview
              </Text>
              <SlidePreviewCard
                imageUrl={draft.imageUrl}
                categoryName={draft.categoryName}
                ctaLabel={draft.ctaLabel}
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
                  disabled={saving || uploading}
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
                      <Text className="text-muted-foreground text-metadata" numberOfLines={1}>
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
              <SlidePreviewCard
                imageUrl={"image_url" in preview ? preview.image_url : preview.imageUrl}
                categoryName={"category_name" in preview ? preview.category_name : preview.categoryName}
                ctaLabel={"cta_label" in preview ? preview.cta_label : preview.ctaLabel}
              />
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

const styles = StyleSheet.create({
  metricsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  metricReveal: { flex: 1, minWidth: 0 },
  metricCard: { minHeight: 108, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 15, justifyContent: "space-between" },
  metricIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: adminPalette.brandSubtle, alignItems: "center", justifyContent: "center" },
  metricLabel: { color: adminPalette.textSecondary, fontSize: typeScale.metadata, fontWeight: "700", marginTop: 8 },
  metricValue: { color: adminPalette.text, fontSize: typeScale.sectionTitle, lineHeight: typeScale.sectionTitle + 5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  slideList: { gap: 12 },
  slideCard: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 15 },
  slideImage: { width: 104, height: 70, borderRadius: 12, backgroundColor: "#F3E5EA" },
  slideFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border },
  actionButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" },
  actionButtonDanger: { backgroundColor: adminPalette.errorSubtle },
  actionButtonHover: { backgroundColor: adminPalette.brandSubtle, transform: [{ translateY: -1 }] },
  actionButtonPressed: { transform: [{ scale: 0.97 }], opacity: 0.86 },
  actionButtonDisabled: { opacity: 0.36 },
  categoryImagesSection: { marginTop: 28, paddingTop: 24, borderTopWidth: 1, borderTopColor: adminPalette.border },
  sectionHeadingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  sectionTitle: { color: adminPalette.text, fontSize: typeScale.sectionTitle, lineHeight: typeScale.sectionTitle + 5, fontWeight: "800" },
  sectionDescription: { color: adminPalette.textSecondary, fontSize: typeScale.body, lineHeight: typeScale.body + 6, marginTop: 4 },
  ratioBadge: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: adminPalette.brandSubtle, alignItems: "center", justifyContent: "center" },
  ratioBadgeText: { color: PINK, fontSize: typeScale.metadata, fontWeight: "800" },
  imageGuideline: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, marginBottom: 16, borderRadius: 14, borderWidth: 1, borderColor: "#F8B7CF", backgroundColor: "#FFF5F8" },
  imageGuidelineTitle: { color: adminPalette.text, fontSize: typeScale.body, fontWeight: "700" },
  imageGuidelineText: { color: adminPalette.textSecondary, fontSize: typeScale.metadata, marginTop: 2 },
  categoryImageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" },
  categoryImageCard: { flexGrow: 0, minWidth: 0, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: adminPalette.border, backgroundColor: adminPalette.surface },
  categoryImageMedia: { height: 184, position: "relative", alignItems: "center", justifyContent: "center", backgroundColor: "#F8F2F4", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminPalette.border },
  categoryImagePreview: { height: 164, aspectRatio: HOME_CATEGORY_ASPECT, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle },
  categoryImageBody: { flex: 1, minWidth: 0, padding: 15 },
  categoryImageTitle: { minHeight: 23, color: adminPalette.text, fontSize: typeScale.body, lineHeight: typeScale.body + 5, fontWeight: "800" },
  categoryImageMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 5 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: adminPalette.textSecondary },
  customBadge: { position: "absolute", top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#DCFCE7" },
  customBadgeText: { color: "#15803D", fontSize: 9, fontWeight: "800" },
  defaultBadge: { position: "absolute", top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFFFFF" },
  defaultBadgeText: { color: adminPalette.textSecondary, fontSize: 9, fontWeight: "800" },
  categoryImageHint: { color: adminPalette.textSecondary, fontSize: typeScale.metadata },
  categoryImageActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  categoryImagePrimaryAction: { minHeight: 44, flexGrow: 1, minWidth: 105, paddingHorizontal: 14, borderRadius: 11, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  categoryImagePrimaryActionText: { color: "#FFFFFF", fontSize: typeScale.metadata, fontWeight: "800" },
  categoryImageSecondaryAction: { minHeight: 44, flexGrow: 1, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: adminPalette.border, alignItems: "center", justifyContent: "center" },
  categoryImageSecondaryActionText: { color: adminPalette.textSecondary, fontSize: typeScale.metadata, fontWeight: "700" },
});
