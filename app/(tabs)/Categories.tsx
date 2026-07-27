import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import CategoryCard, { type CategoryCardItem } from "@/components/categories/CategoryCard";
import CategoryFilterModal from "@/components/categories/CategoryFilterModal";
import CategoryPageHeader from "@/components/categories/CategoryPageHeader";
import CategorySearchBar from "@/components/categories/CategorySearchBar";
import HomeReveal from "@/components/home/HomeReveal";
import {
  findMarketplaceCategory,
  MARKETPLACE_CATEGORIES,
} from "@/data/marketplaceCategories";
import {
  getPublicMarketplaceCategories,
  subscribeToPublicVendorChanges,
} from "@/services/publicVendorListings";

const CATEGORY_PRESENTATION: CategoryCardItem[] = MARKETPLACE_CATEGORIES.map((category) => ({
  id: category.slug,
  name: category.name,
  description: category.description,
  icon: category.icon,
  iconColor: category.iconColor,
  iconBg: category.iconBg,
  image: category.cloudinaryImage,
  fallbackImage: category.fallbackImage,
}));

export default function CategoriesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [categories, setCategories] = useState<CategoryCardItem[]>(CATEGORY_PRESENTATION);
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 1100;
  const horizontalInset = isDesktop ? 24 : screenWidth < 380 ? 14 : screenWidth < 480 ? 18 : 20;
  const twoColumns = screenWidth >= 900;
  const compactCards = screenWidth < 600;
  const contentWidth = Math.min(screenWidth - horizontalInset * 2, 1180);
  const cardWidth = twoColumns ? (contentWidth - 14) / 2 : contentWidth;

  const bg      = isDark ? "#070B14" : "#FFFFFF";
  const text    = isDark ? "#F5F0F3" : "#141414";
  const muted   = isDark ? "#AAA0A5" : "#787178";
  const border  = isDark ? "#232C3D" : "#F0E8F2";

  useEffect(() => {
    let active = true;
    const load = () => {
      getPublicMarketplaceCategories()
        .then((liveCategories) => {
          if (!active) return;
          const liveIds = new Map<string, string>();
          liveCategories.forEach((category) => {
            const match = findMarketplaceCategory(category.name);
            if (match && !liveIds.has(match.slug)) liveIds.set(match.slug, category.id);
          });
          setCategories(CATEGORY_PRESENTATION.map((category) => ({
            ...category,
            id: liveIds.get(category.id) ?? category.id,
          })));
        })
        .catch(() => {
          if (active) setCategories(CATEGORY_PRESENTATION);
        });
    };
    load();
    const unsubscribe = subscribeToPublicVendorChanges(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesSearch = !normalizedQuery
        || category.name.toLowerCase().includes(normalizedQuery)
        || category.description.toLowerCase().includes(normalizedQuery);
      const matchesCategory = !selectedCategory || category.id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [categories, query, selectedCategory]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top"]}>
      <View style={[s.topContent, { width: contentWidth }]}>
        <HomeReveal direction="down">
          <CategoryPageHeader
            dark={isDark}
            onBack={goBack}
          />
        </HomeReveal>
        <HomeReveal delay={45}>
          <CategorySearchBar
            dark={isDark}
            query={query}
            activeFilterCount={selectedCategory ? 1 : 0}
            onChangeQuery={setQuery}
            onOpenFilters={() => setFiltersVisible(true)}
          />
        </HomeReveal>
      </View>

      {/* ── List ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={s.scroll}
        contentContainerStyle={[s.list, { width: contentWidth, paddingBottom: 28 }]}
      >
        <View style={s.grid}>
          {filtered.map((category, index) => (
            <HomeReveal key={category.id} delay={Math.min(index * 32, 224)} style={{ width: cardWidth }}>
              <CategoryCard
                category={category}
                dark={isDark}
                compact={compactCards}
                onPress={() =>
                  router.push({
                    pathname: "/VendorsListing",
                    params: { category: category.name },
                  })
                }
              />
            </HomeReveal>
          ))}
        </View>

        {!filtered.length ? (
          <View style={[s.empty, { borderColor: border }]}>
            <Text style={[s.emptyTitle, { color: text }]}>No categories found</Text>
            <Text style={[s.emptyText, { color: muted }]}>Try another keyword or reset the selected filter.</Text>
          </View>
        ) : null}
      </ScrollView>

      <CategoryFilterModal
        visible={filtersVisible}
        dark={isDark}
        categories={categories}
        selected={selectedCategory}
        onClose={() => setFiltersVisible(false)}
        onApply={(category) => {
          setSelectedCategory(category);
          setFiltersVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topContent: { alignSelf: "center" },
  scroll: { flex: 1 },
  list: { alignSelf: "center" },
  grid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 14 },
  empty: { marginTop: 12, borderWidth: 1, borderStyle: "dashed", borderRadius: 20, paddingVertical: 34, paddingHorizontal: 20, alignItems: "center" },
  emptyTitle: { fontFamily: "serif", fontSize: 20, fontWeight: "700", marginBottom: 5 },
  emptyText: { maxWidth: 330, textAlign: "center", fontSize: 11, lineHeight: 17 },
});
