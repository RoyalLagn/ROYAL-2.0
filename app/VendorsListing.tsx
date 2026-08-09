import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, type ListRenderItemInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { RefreshCw, SearchX } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useLocalSearchParams, useRouter } from "expo-router";
import CategoryFilterChips from "@/components/listing/CategoryFilterChips";
import CategoryListingHeader from "@/components/listing/CategoryListingHeader";
import CategorySearchBar from "@/components/categories/CategorySearchBar";
import ListingFilterModal, {
  type ListingFilters, } from "@/components/listing/ListingFilterModal";
import ResultsSummary from "@/components/listing/ResultsSummary";
import VendorListingCard from "@/components/listing/VendorListingCard";
import HomeReveal from "@/components/home/HomeReveal";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import { useCustomerLocation } from "@/context/LocationContext";
import { useFavorites } from "@/context/FavoritesContext";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import {
  getApprovedPublicVendors, normalizeMarketplaceCategoryName, subscribeToPublicVendorChanges, type PublicVendorListing, } from "@/services/publicVendorListings";
import {
  findMarketplaceCategory, resolveMarketplaceCategoryImage, } from "@/data/marketplaceCategories";
import { rankVendorsByLocationAndMembership } from "@/services/locations";
import { SkeletonList } from "@/components/loading/Skeleton";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

function getPriceOptions(category: string) {
  if (category === "Caterers") {
    return [
      { label: "Any price", value: 0 },
      { label: "Under ₹750/plate", value: 750 },
      { label: "Under ₹1,000/plate", value: 1000 },
      { label: "Under ₹1,500/plate", value: 1500 },
    ];
  }
  if (category === "Venues") {
    return [
      { label: "Any price", value: 0 },
      { label: "Under ₹1L", value: 100000 },
      { label: "Under ₹2L", value: 200000 },
      { label: "Under ₹3L", value: 300000 },
    ];
  }
  return [
    { label: "Any price", value: 0 },
    { label: "Under ₹15k", value: 15000 },
    { label: "Under ₹30k", value: 30000 },
    { label: "Under ₹50k", value: 50000 },
    { label: "Under ₹1L", value: 100000 },
  ];
}

const DEFAULT_FILTERS: ListingFilters = {
  sort: "popular",
  maximumPrice: 0,
  minimumRating: 0,
};

const CATEGORY_ALIASES: Record<string, string> = {
  "pre-wedding shoot": "Pre Wedding Shoot",
  "pre wedding shoots": "Pre Wedding Shoot",
  "music and dance": "Music & Dance",
  "invites and cards": "Invites & Cards",
  "dj": "DJs",
  "live orchestra": "Live Orchestra & Band",
  "orchestra and band": "Live Orchestra & Band",
  "wedding bands": "Live Orchestra & Band",
};

function resolveCategory(value?: string) {
  if (!value) return "Photographers";
  const raw = value.trim();
  const aliased = CATEGORY_ALIASES[raw.toLowerCase()] ?? raw;
  // Accept marketplace names, DB names, and slugs (e.g. photographer / wedding-hall).
  const matched = findMarketplaceCategory(aliased);
  if (matched) return matched.name;
  return normalizeMarketplaceCategoryName(aliased);
}

export default function VendorsListingScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { city, preference, strictCityOnly } = useCustomerLocation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ category?: string; query?: string }>();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();

  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const displayCategory = resolveCategory(categoryParam);
  const initialQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterSection, setFilterSection] = useState<"sort" | "price" | "rating" | "filters">("filters");
  const [approvedVendors, setApprovedVendors] = useState<PublicVendorListing[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState("");

  const compact = width < 1100;
  const desktop = width >= 1100;
  const contentWidth = Math.min(width - (width >= 1100 ? 96 : 32), 1120);
  const colors = brandColors(isDark);
  const background = colors.background;
  const text = isDark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const locationSubtitle = city;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const loadVendors = useCallback(() => {
    setVendorsLoading(true);
    setVendorsError("");
    return getApprovedPublicVendors()
      .then((items) => setApprovedVendors(items))
      .catch(() => {
        setApprovedVendors([]);
        setVendorsError("We couldn’t load vendors right now. Check your connection and try again.");
      })
      .finally(() => setVendorsLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => {
      getApprovedPublicVendors()
        .then((items) => {
          if (active) {
            setApprovedVendors(items);
            setVendorsError("");
          }
        })
        .catch(() => {
          if (active) {
            setApprovedVendors([]);
            setVendorsError("We couldn’t load vendors right now. Check your connection and try again.");
          }
        })
        .finally(() => {
          if (active) setVendorsLoading(false);
        });
    };
    load();
    const unsubscribe = subscribeToPublicVendorChanges(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const clearSearchAndFilters = () => {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
  };

  const vendors = useMemo(
    () => approvedVendors
      .filter((vendor) => vendor.category.toLowerCase() === displayCategory.toLowerCase()),
    [approvedVendors, displayCategory],
  );

  const filteredVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const ratedVendors = vendors.map((vendor) => {
      const current = getRating(vendor.id, vendor.rating, vendor.reviews);
      return { ...vendor, rating: current.rating, reviews: current.reviews };
    });
    const matching = ratedVendors.filter((vendor) => {
      const searchable = [
        vendor.name,
        vendor.category,
        vendor.location,
        vendor.tags.join(" "),
        vendor.services.join(" "),
        vendor.description,
      ].join(" ").toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (!filters.minimumRating || vendor.rating >= filters.minimumRating)
        && (!filters.maximumPrice || (
          vendor.startingPriceValue > 0
          && vendor.startingPriceValue <= filters.maximumPrice
        ));
    });

    const baseSorted = [...matching].sort((a, b) => {
      if (filters.sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
      if (filters.sort === "price") {
        return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
          - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
      }
      return Number(Boolean(b.isTopRated)) - Number(Boolean(a.isTopRated))
        || b.reviews - a.reviews
        || b.rating - a.rating;
    });
    return rankVendorsByLocationAndMembership(baseSorted, preference, strictCityOnly);
  }, [filters, getRating, preference, query, strictCityOnly, vendors]);

  const activeFilterCount = [
    filters.sort !== "popular",
    filters.maximumPrice > 0,
    filters.minimumRating > 0,
  ].filter(Boolean).length;

  const openFilters = (section: "sort" | "price" | "rating" | "filters") => {
    setFilterSection(section);
    setFiltersVisible(true);
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/Categories");
  };

  const sortLabel = filters.sort === "rating"
    ? "Highest rated"
    : filters.sort === "price"
      ? "Lowest price"
      : "Popular";

  const toggleVendorFavorite = useCallback((vendor: PublicVendorListing, source: FavoriteSourceRef) => {
    toggleFavorite({
      id: vendor.id,
      name: vendor.name,
      category: displayCategory,
      rating: vendor.rating,
      reviews: vendor.reviews,
      priceLevel: vendor.priceLevel,
      startingPrice: vendor.startingPrice,
      location: vendor.location,
      tags: vendor.tags,
      image: vendor.image,
    }, source);
  }, [displayCategory, toggleFavorite]);

  const fallbackImage = useMemo(
    () => resolveMarketplaceCategoryImage(displayCategory).fallbackSource,
    [displayCategory],
  );

  const renderVendorCard = useCallback(({ item: vendor, index }: ListRenderItemInfo<PublicVendorListing>) => (
    <HomeReveal delay={Math.min(index * 30, 210)}>
      <VendorListingCard
        vendor={vendor}
        dark={isDark}
        compact={compact}
        favorite={isFavorite(vendor.id)}
        fallbackImage={fallbackImage}
        onOpen={() =>
          router.push({
            pathname: "/VendorsProfile",
            params: { vendorId: vendor.id, category: displayCategory },
          })
        }
        onToggleFavorite={(source) => toggleVendorFavorite(vendor, source)}
      />
    </HomeReveal>
  ), [isDark, compact, isFavorite, fallbackImage, router, displayCategory, toggleVendorFavorite]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      <PublicWebNavbar activeRoute="Categories" />
      <View style={[styles.top, { width: contentWidth }]}>
        <HomeReveal direction="down">
          <CategoryListingHeader
            category={displayCategory}
            location={locationSubtitle}
            dark={isDark}
            onBack={goBack}
          />
        </HomeReveal>

        <HomeReveal delay={35}>
          <CategorySearchBar
            dark={isDark}
            query={query}
            activeFilterCount={activeFilterCount}
            accessibilityLabel={`Search ${displayCategory.toLowerCase()}`}
            placeholder={`Search ${displayCategory.toLowerCase()}…`}
            onChangeQuery={setQuery}
            onOpenFilters={() => openFilters("filters")}
          />
        </HomeReveal>

        <HomeReveal delay={70} style={styles.chips}>
          <CategoryFilterChips
            dark={isDark}
            active={{
              sort: filters.sort !== "popular",
              price: filters.maximumPrice > 0,
              rating: filters.minimumRating > 0,
            }}
            onPress={openFilters}
          />
        </HomeReveal>

        <HomeReveal delay={95}>
          <ResultsSummary
            count={filteredVendors.length}
            category={displayCategory}
            sortLabel={sortLabel}
            dark={isDark}
            onSort={() => openFilters("sort")}
          />
        </HomeReveal>
      </View>

      <FlatList
        data={filteredVendors}
        keyExtractor={(vendor) => vendor.id}
        renderItem={renderVendorCard}
        extraData={favorites}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom: 34 }]}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        ListEmptyComponent={vendorsLoading ? (
          <SkeletonList count={compact ? 3 : 4} height={compact ? 172 : 220} gap={14} />
        ) : vendorsError ? (
          <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <RefreshCw size={22} color={colors.primaryStrong} />
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>Vendors are taking a moment</Text>
            <Text style={[styles.emptyText, { color: muted }]}>{vendorsError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadVendors()} style={({ pressed }) => [styles.emptyAction, pressed && styles.emptyActionPressed]}>
              <Text style={styles.emptyActionText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <SearchX size={24} color={colors.primaryStrong} />
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>No matching {displayCategory.toLowerCase()}</Text>
            <Text style={[styles.emptyText, { color: muted }]}>Try another keyword or clear the price and rating filters.</Text>
            {(query || activeFilterCount > 0) ? (
              <Pressable accessibilityRole="button" onPress={clearSearchAndFilters} style={({ pressed }) => [styles.emptyAction, pressed && styles.emptyActionPressed]}>
                <Text style={styles.emptyActionText}>Clear search and filters</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />

      {!desktop ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}

      <ListingFilterModal
        visible={filtersVisible}
        dark={isDark}
        value={filters}
        priceOptions={getPriceOptions(displayCategory)}
        initialSection={filterSection}
        onClose={() => setFiltersVisible(false)}
        onApply={(nextFilters) => {
          setFilters(nextFilters);
          setFiltersVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { alignSelf: "center", paddingBottom: 8 },
  chips: { marginBottom: 4 },
  scroll: { flex: 1 },
  list: { alignSelf: "center", gap: 14, paddingTop: 6 },
  empty: { minHeight: 250, marginTop: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 15, fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  emptyText: { maxWidth: 380, marginTop: 7, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  emptyAction: { minHeight: 44, marginTop: 16, paddingHorizontal: 18, borderRadius: 14, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center" },
  emptyActionPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  emptyActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
});
