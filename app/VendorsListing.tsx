import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useLocalSearchParams, useRouter } from "expo-router";
import CategoryFilterChips from "@/components/listing/CategoryFilterChips";
import CategoryListingHeader from "@/components/listing/CategoryListingHeader";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import ListingFilterModal, {
  type ListingFilters,
} from "@/components/listing/ListingFilterModal";
import ResultsSummary from "@/components/listing/ResultsSummary";
import VendorListingCard from "@/components/listing/VendorListingCard";
import HomeReveal from "@/components/home/HomeReveal";
import { useCustomerLocation } from "@/context/LocationContext";
import { useFavorites } from "@/context/FavoritesContext";
import { vendorsByCategory, type VendorItem } from "@/data/vendorData";
import { useReviewRatings } from "@/context/ReviewRatingsContext";

function getFallbackVendors(category: string): VendorItem[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `f${index + 1}`,
    name: `${category} Expert ${index + 1}`,
    rating: Number((4.9 - index * 0.07).toFixed(1)),
    reviews: 120 - index * 10,
    priceLevel: index % 3 === 0 ? "₹ ₹ ₹" : index % 2 === 0 ? "₹" : "₹ ₹",
    location: ["Pune", "Mumbai", "Lonavala", "Nashik"][index % 4],
    tags: ["Premium", "Traditional", "Modern"].slice(0, (index % 3) + 1),
    startingPrice: `₹${(15 - index) * 1000}`,
    image: "https://images.unsplash.com/photo-1606800052052-a08af7148866?w=900&auto=format&fit=crop&q=78",
    isTopRated: index === 0,
  }));
}

function parsePrice(value: string) {
  const normalized = value.replace(/[₹,\s]/g, "").toLowerCase();
  const amount = Number.parseFloat(normalized) || 0;
  if (normalized.includes("l")) return amount * 100000;
  if (normalized.includes("k")) return amount * 1000;
  return amount;
}

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
};

function resolveCategory(value?: string) {
  if (!value) return "Photographers";
  const exact = Object.keys(vendorsByCategory).find(
    (category) => category.toLowerCase() === value.trim().toLowerCase(),
  );
  return exact ?? CATEGORY_ALIASES[value.trim().toLowerCase()] ?? value.trim();
}

const CATEGORY_FALLBACKS: Record<string, number> = {
  Venues: require("../assets/images/category-fallback/venues.png"),
  Caterers: require("../assets/images/category-fallback/caterers.png"),
  Photographers: require("../assets/images/category-fallback/photographer.png"),
  Decorators: require("../assets/images/category-fallback/decoraters.png"),
  "Makeup Artists": require("../assets/images/category-fallback/makeup.png"),
  "Mehndi Artists": require("../assets/images/category-fallback/mehendi-artist.png"),
  DJs: require("../assets/images/category-fallback/DJ.png"),
  "Bridal Wear": require("../assets/images/category-fallback/bridal-wear.png"),
  "Groom Wear": require("../assets/images/category-fallback/groom-wear.png"),
  "Jewellery & Accessories": require("../assets/images/category-fallback/jewellery-accessories.png"),
  Pandits: require("../assets/images/category-fallback/pandits.png"),
  "Invites & Cards": require("../assets/images/category-fallback/invites-cards.png"),
  "Pre Wedding Shoot": require("../assets/images/category-fallback/pre-wedding-shoot.png"),
  "Music & Dance": require("../assets/images/category-fallback/dance.png"),
};

export default function VendorsListingScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { city } = useCustomerLocation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ category?: string; query?: string }>();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();

  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const displayCategory = resolveCategory(categoryParam);
  const initialQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterSection, setFilterSection] = useState<"sort" | "price" | "rating" | "filters">("filters");

  const compact = width < 600;
  const contentWidth = Math.min(width - (width >= 1100 ? 48 : 32), 980);
  const background = isDark ? "#141214" : "#FFFAFC";
  const text = isDark ? "#F8F2F5" : "#231A20";
  const muted = isDark ? "#AAA0A5" : "#786D73";
  const border = isDark ? "#3D3036" : "#F1D9E1";
  const locationSubtitle = city;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const vendors = useMemo(
    () => vendorsByCategory[displayCategory] ?? getFallbackVendors(displayCategory),
    [displayCategory],
  );

  const filteredVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const ratedVendors = vendors.map((vendor) => {
      const current = getRating(vendor.id, vendor.rating, vendor.reviews);
      return { ...vendor, rating: current.rating, reviews: current.reviews };
    });
    const matching = ratedVendors.filter((vendor) => {
      const searchable = `${vendor.name} ${vendor.location} ${vendor.tags.join(" ")}`.toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (!filters.minimumRating || vendor.rating >= filters.minimumRating)
        && (!filters.maximumPrice || parsePrice(vendor.startingPrice) <= filters.maximumPrice);
    });

    return [...matching].sort((a, b) => {
      if (filters.sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
      if (filters.sort === "price") return parsePrice(a.startingPrice) - parsePrice(b.startingPrice);
      return Number(Boolean(b.isTopRated)) - Number(Boolean(a.isTopRated))
        || b.reviews - a.reviews
        || b.rating - a.rating;
    });
  }, [filters, getRating, query, vendors]);

  const activeFilterCount = [
    filters.sort !== "popular",
    filters.maximumPrice > 0,
    filters.minimumRating > 0,
  ].filter(Boolean).length;

  const openFilters = (section: "sort" | "price" | "rating" | "filters") => {
    setFilterSection(section);
    setFiltersVisible(true);
  };

  const sortLabel = filters.sort === "rating"
    ? "Highest rated"
    : filters.sort === "price"
      ? "Lowest price"
      : "Popular";

  const toggleVendorFavorite = (vendor: VendorItem) => {
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
    });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      <View style={[styles.top, { width: contentWidth }]}>
        <HomeReveal direction="down">
          <CategoryListingHeader
            category={displayCategory}
            location={locationSubtitle}
            dark={isDark}
            onBack={() => router.back()}
            onFavorites={() => router.push("/(tabs)/favorites")}
            onFilters={() => openFilters("filters")}
          />
        </HomeReveal>

        <HomeReveal delay={35}>
          <CompactSearchBar
            accessibilityLabel={`Search ${displayCategory.toLowerCase()}`}
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${displayCategory.toLowerCase()}…`}
            dark={isDark}
            style={styles.search}
          />
        </HomeReveal>

        <HomeReveal delay={70} style={styles.chips}>
          <CategoryFilterChips
            dark={isDark}
            active={{
              sort: filters.sort !== "popular",
              price: filters.maximumPrice > 0,
              rating: filters.minimumRating > 0,
              filters: activeFilterCount > 0,
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom: 34 }]}
      >
        {filteredVendors.map((vendor, index) => (
          <HomeReveal key={vendor.id} delay={Math.min(index * 30, 210)}>
            <VendorListingCard
              vendor={vendor}
              dark={isDark}
              compact={compact}
              favorite={isFavorite(vendor.id)}
              fallbackImage={CATEGORY_FALLBACKS[displayCategory] ?? CATEGORY_FALLBACKS.Venues}
              onOpen={() =>
                router.push({
                  pathname: "/VendorsProfile",
                  params: { vendorId: vendor.id, category: displayCategory },
                })
              }
              onToggleFavorite={() => toggleVendorFavorite(vendor)}
            />
          </HomeReveal>
        ))}

        {!filteredVendors.length ? (
          <View style={[styles.empty, { borderColor: border }]}>
            <Text style={[styles.emptyTitle, { color: text }]}>No matching {displayCategory.toLowerCase()}</Text>
            <Text style={[styles.emptyText, { color: muted }]}>Try another keyword or reset the price and rating filters.</Text>
          </View>
        ) : null}
      </ScrollView>

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
  search: { width: "100%" },
  chips: { marginTop: 10, marginBottom: 4 },
  scroll: { flex: 1 },
  list: { alignSelf: "center", gap: 12, paddingTop: 4 },
  empty: { minHeight: 190, marginTop: 4, borderWidth: 1, borderStyle: "dashed", borderRadius: 22, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: "serif", fontSize: 20, lineHeight: 25, fontWeight: "700", textAlign: "center" },
  emptyText: { maxWidth: 340, marginTop: 6, fontSize: 11, lineHeight: 17, textAlign: "center" },
});
