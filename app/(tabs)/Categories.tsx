import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, Image, Platform, StyleSheet, Text, useWindowDimensions, View, } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import Animated, {
  Easing, Extrapolation, interpolate, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, } from "react-native-reanimated";
import CategoryCard, { type CategoryCardItem } from "@/components/categories/CategoryCard";
import CategoryFilterModal from "@/components/categories/CategoryFilterModal";
import CategoryPageHeader from "@/components/categories/CategoryPageHeader";
import CategorySearchBar from "@/components/categories/CategorySearchBar";
import { useCategories } from "@/context/CategoryContext";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import PageLoader from "@/components/loading/PageLoader";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import { useMobileTabBarHeight } from "@/components/MobileTabBar";
import { buildVendorListingPath } from "@/services/publicSeoRoutes";
import { discoveryLayout } from "@/constants/discoveryLayout";
import { isPublicWideLayout } from "@/utils/responsiveLayout";

const INITIAL_ANIMATED_CARDS = 6;
const SKELETON_DELAY_MS = 200;
const SKELETON_MINIMUM_MS = 320;
const SKELETON_IDS = Array.from({ length: 8 }, (_, index) => `category-skeleton-${index}`);

type ListEntry =
  | { kind: "search"; id: string }
  | { kind: "category"; id: string; category: CategoryCardItem; entranceIndex: number }
  | { kind: "skeleton"; id: string };

function thumbnailUrl(uri: string) {
  return uri.replace("/image/upload/f_auto,q_auto,w_720/", "/image/upload/f_auto,q_auto,w_360/");
}

const CategoryListItem = memo(function CategoryListItem({
  entry,
  width,
  compact,
  dark,
  entrance,
  reducedMotion,
  onSelect,
}: {
  entry: Extract<ListEntry, { kind: "category" }>;
  width: number;
  compact: boolean;
  dark: boolean;
  entrance: SharedValue<number>;
  reducedMotion: boolean;
  onSelect: (name: string) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (entry.entranceIndex >= INITIAL_ANIMATED_CARDS) return { opacity: 1, transform: [{ translateY: 0 }] };
    const start = reducedMotion ? 0 : 0.08 + entry.entranceIndex * 0.035;
    const end = reducedMotion ? 0.18 : Math.min(0.78, start + 0.3);
    return {
      opacity: interpolate(entrance.value, [start, end], [0, 1], Extrapolation.CLAMP),
      transform: [{
        translateY: reducedMotion
          ? 0
          : interpolate(entrance.value, [start, end], [8, 0], Extrapolation.CLAMP),
      }],
    };
  }, [entry.entranceIndex, reducedMotion]);
  const open = useCallback(() => onSelect(entry.category.name), [entry.category.name, onSelect]);

  return (
    <Animated.View style={[{ width }, animatedStyle]}>
      <CategoryCard category={entry.category} dark={dark} compact={compact} onPress={open} />
    </Animated.View>
  );
});

const CategorySkeleton = memo(function CategorySkeleton({ width, compact, dark }: { width: number; compact: boolean; dark: boolean }) {
  const fill = dark ? "#211E23" : "#F7F1F4";
  const soft = dark ? "#2B2730" : "#EEE5E9";
  return (
    <View style={[s.skeletonCard, compact ? s.skeletonCompact : s.skeletonWide, { width, backgroundColor: fill }]}>
      <View style={[s.skeletonCircle, compact && s.skeletonCircleCompact, { backgroundColor: soft }]} />
      <View style={s.skeletonCopy}>
        <View style={[s.skeletonTitle, { backgroundColor: soft }]} />
        <View style={[s.skeletonLine, { backgroundColor: soft }]} />
        <View style={[s.skeletonLine, s.skeletonLineShort, { backgroundColor: soft }]} />
      </View>
      <View style={[s.skeletonImage, compact && s.skeletonImageCompact, { backgroundColor: soft }]} />
    </View>
  );
});

export default function CategoriesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAt = useRef<number | null>(null);
  const entranceStarted = useRef(false);
  const entrance = useSharedValue(0);
  const { searchCategories: liveCategories, loading } = useCategories();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const mobileTabBarHeight = useMobileTabBarHeight();
  const isDesktopWeb = Platform.OS === "web" && screenWidth >= 1100;
  const wideLayout = isPublicWideLayout(screenWidth, screenHeight);
  const horizontalInset = wideLayout ? (isDesktopWeb ? 32 : 24) : screenWidth < 380 ? 14 : screenWidth < 480 ? 18 : 24;
  const twoColumns = wideLayout || screenWidth >= 900;
  const compactCards = screenWidth < 600;
  const contentWidth = Math.min(screenWidth - horizontalInset * 2, 1240);
  const cardWidth = twoColumns ? (contentWidth - 16) / 2 : contentWidth;

  const bg = isDark ? "#070B14" : "#FFFBFD";
  const text = isDark ? "#F5F0F3" : "#141414";
  const muted = isDark ? "#AAA0A5" : "#787178";
  const border = isDark ? "#232C3D" : "#F0E8F2";

  const categories = useMemo<CategoryCardItem[]>(() => liveCategories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    iconColor: category.iconColor,
    iconBg: category.iconBg,
    image: thumbnailUrl(category.imageUrl),
    fallbackImage: category.fallbackImage,
    vendorCount: category.vendorCount,
  })), [liveCategories]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!categories.length && loading && !showSkeleton) {
      timer = setTimeout(() => {
        skeletonShownAt.current = Date.now();
        setShowSkeleton(true);
      }, SKELETON_DELAY_MS);
    } else if (categories.length && showSkeleton) {
      const elapsed = skeletonShownAt.current ? Date.now() - skeletonShownAt.current : SKELETON_MINIMUM_MS;
      timer = setTimeout(() => setShowSkeleton(false), Math.max(0, SKELETON_MINIMUM_MS - elapsed));
    } else if (!loading && !categories.length && showSkeleton) {
      setShowSkeleton(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [categories.length, loading, showSkeleton]);

  useEffect(() => {
    if (!categories.length || showSkeleton || entranceStarted.current) return;
    entranceStarted.current = true;
    entrance.value = withTiming(1, {
      duration: reducedMotion ? 120 : 280,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
    });
  }, [categories.length, entrance, reducedMotion, showSkeleton]);

  useEffect(() => {
    categories.slice(0, INITIAL_ANIMATED_CARDS).forEach((category) => {
      if (category.image) void Image.prefetch(category.image).catch(() => undefined);
    });
  }, [categories]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesSearch = !normalizedQuery
        || category.name.toLowerCase().includes(normalizedQuery)
        || category.description.toLowerCase().includes(normalizedQuery);
      return matchesSearch && (!selectedCategory || category.id === selectedCategory);
    });
  }, [categories, query, selectedCategory]);

  const entries = useMemo<ListEntry[]>(() => {
    const content: ListEntry[] = showSkeleton
      ? SKELETON_IDS.map((id) => ({ kind: "skeleton" as const, id }))
      : filtered.map((category, entranceIndex) => ({ kind: "category" as const, id: category.id, category, entranceIndex }));
    return twoColumns ? content : [{ kind: "search", id: "category-search" }, ...content];
  }, [filtered, showSkeleton, twoColumns]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entrance.value, [0, reducedMotion ? 0.25 : 0.38], [0, 1], Extrapolation.CLAMP),
    transform: [{
      translateY: reducedMotion ? 0 : interpolate(entrance.value, [0, 0.38], [-8, 0], Extrapolation.CLAMP),
    }],
  }), [reducedMotion]);
  const searchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entrance.value, [0.07, reducedMotion ? 0.28 : 0.48], [0, 1], Extrapolation.CLAMP),
    transform: [{
      translateY: reducedMotion ? 0 : interpolate(entrance.value, [0.07, 0.48], [9, 0], Extrapolation.CLAMP),
    }],
  }), [reducedMotion]);

  const goBack = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (filtersVisible) {
        setFiltersVisible(false);
      } else {
        goBack();
      }
      return true;
    });
    return () => subscription.remove();
  }, [filtersVisible, goBack]));
  const openCategory = useCallback((name: string) => {
    router.push(buildVendorListingPath(name) as Href);
  }, [router]);
  const openFilters = useCallback(() => setFiltersVisible(true), []);
  const closeFilters = useCallback(() => setFiltersVisible(false), []);
  const applyFilter = useCallback((category: string | null) => {
    setSelectedCategory(category);
    setFiltersVisible(false);
  }, []);
  const renderItem = useCallback(({ item }: { item: ListEntry }) => {
    if (item.kind === "search") {
      return (
        <Animated.View style={[s.stickySearch, { width: contentWidth, backgroundColor: bg }, searchStyle]}>
          <CategorySearchBar dark={isDark} query={query} activeFilterCount={selectedCategory ? 1 : 0} onChangeQuery={setQuery} onOpenFilters={openFilters} />
        </Animated.View>
      );
    }
    return item.kind === "skeleton"
      ? <CategorySkeleton width={cardWidth} compact={compactCards} dark={isDark} />
      : <CategoryListItem entry={item} width={cardWidth} compact={compactCards} dark={isDark} entrance={entrance} reducedMotion={reducedMotion} onSelect={openCategory} />;
  }, [bg, cardWidth, compactCards, contentWidth, entrance, isDark, openCategory, openFilters, query, reducedMotion, searchStyle, selectedCategory]);
  const keyExtractor = useCallback((item: ListEntry) => item.id, []);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      {loading && !categories.length ? <PageLoader /> : null}
      {!isDesktopWeb ? <PublicWebNavbar activeRoute="Categories" /> : null}
      <FlatList
        key={twoColumns ? "category-grid-2" : "category-grid-1"}
        data={entries}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={twoColumns ? 2 : 1}
        columnWrapperStyle={twoColumns ? s.column : undefined}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={INITIAL_ANIMATED_CARDS}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={!wideLayout}
        contentContainerStyle={[
          s.list,
          {
            width: contentWidth,
            paddingBottom: Platform.OS === "web" ? 36 : mobileTabBarHeight + 24,
          },
        ]}
        stickyHeaderIndices={twoColumns ? undefined : [1]}
        ListHeaderComponent={(
          <View>
            <Animated.View style={headerStyle}>
              <CategoryPageHeader dark={isDark} entrance={entrance} reducedMotion={reducedMotion} />
            </Animated.View>
            {twoColumns ? (
              <Animated.View style={[s.desktopSearch, searchStyle]}>
                <CategorySearchBar dark={isDark} query={query} activeFilterCount={selectedCategory ? 1 : 0} onChangeQuery={setQuery} onOpenFilters={openFilters} />
              </Animated.View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={!loading && !showSkeleton ? (
          <View style={[s.empty, { borderColor: border }]}>
            <Text style={[s.emptyTitle, { color: text }]}>No categories found</Text>
            <Text style={[s.emptyText, { color: muted }]}>Try another keyword or reset the selected filter.</Text>
          </View>
        ) : null}
      />

      <CategoryFilterModal visible={filtersVisible} dark={isDark} categories={categories} selected={selectedCategory} onClose={closeFilters} onApply={applyFilter} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { alignSelf: "center" },
  stickySearch: {
    marginTop: 0,
    paddingTop: 8,
    paddingBottom: discoveryLayout.stickySearchPaddingBottom,
    zIndex: 10,
  },
  desktopSearch: {
    marginTop: discoveryLayout.headerSearchOverlap,
    paddingTop: discoveryLayout.stickySearchPaddingTop,
    paddingBottom: discoveryLayout.stickySearchPaddingBottom,
  },
  column: { gap: 16 },
  separator: { height: discoveryLayout.resultsGap },
  skeletonCard: { borderRadius: 16, flexDirection: "row", alignItems: "center", paddingLeft: 18, overflow: "hidden" },
  skeletonCompact: { height: 120, paddingLeft: 14 },
  skeletonWide: { height: 154 },
  skeletonCircle: { width: 68, height: 68, borderRadius: 34, flexShrink: 0 },
  skeletonCircleCompact: { width: 58, height: 58, borderRadius: 29 },
  skeletonCopy: { flex: 1, minWidth: 0, gap: 8, marginHorizontal: 15 },
  skeletonTitle: { width: "68%", height: 16, borderRadius: 6 },
  skeletonLine: { width: "90%", height: 10, borderRadius: 5 },
  skeletonLineShort: { width: "58%" },
  skeletonImage: { width: 150, height: 154, borderRadius: 0 },
  skeletonImageCompact: { width: 108, height: 120 },
  empty: { marginTop: 12, borderWidth: 1, borderStyle: "dashed", borderRadius: 16, paddingVertical: 40, paddingHorizontal: 20, alignItems: "center" },
  emptyTitle: { ...typeStyles.editorialSectionTitle, marginBottom: 5 },
  emptyText: { maxWidth: 330, textAlign: "center", fontSize: typeScale.metadata, lineHeight: typeLeading.tab },
});
