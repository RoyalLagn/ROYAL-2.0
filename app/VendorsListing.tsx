import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import CategoryLocationSelector, {
  describeCategoryLocationSelection,
  type CategoryLocationSelection,
} from "@/components/locations/CategoryLocationSelector";
import { fetchNearbyVendors } from "@/services/vendorDiscovery";
import { fetchPincodeVendors } from "@/services/pincodeVendorDiscovery";

const LOCATION_PAGE_SIZE = 20;

type ListRow =
  | { kind: "vendor"; vendor: PublicVendorListing }
  | { kind: "separator"; key: string; label: string };

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

  // Compact "Near Me" / "Search by Location" selector, scoped to the active
  // category on this page. The category is *always* passed straight through
  // to fetchNearbyVendors / fetchPincodeVendors below -- selecting a
  // location here can only ever narrow the current category, never replace
  // it with "all vendors". Independent of the legacy city/area preference
  // above (used only for ranking when no location is explicitly selected)
  // and does not touch services/geoLocations.ts.
  const [locationSelection, setLocationSelection] = useState<CategoryLocationSelection | null>(null);
  const locationActive = locationSelection !== null;
  const [locationCards, setLocationCards] = useState<PublicVendorListing[]>([]);
  const [locationOffset, setLocationOffset] = useState(0);
  const [locationHasMore, setLocationHasMore] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationRequestSequence = useRef(0);

  const fetchLocationPage = useCallback((reset: boolean) => {
    if (!locationSelection) return;
    const requestSequence = ++locationRequestSequence.current;
    setLocationLoading(true);
    setLocationError("");
    const offsetToUse = reset ? 0 : locationOffset;
    const minRating = filters.minimumRating > 0 ? filters.minimumRating : undefined;
    const maxPrice = filters.maximumPrice > 0 ? filters.maximumPrice : undefined;
    const request = locationSelection.mode === "nearMe"
      ? fetchNearbyVendors({
        latitude: locationSelection.latitude,
        longitude: locationSelection.longitude,
        categoryDisplayName: displayCategory,
        radiusKm: locationSelection.radiusKm,
        minRating,
        maxPrice,
        limit: LOCATION_PAGE_SIZE,
        offset: offsetToUse,
      }).then((result) => ({
        vendors: result.cards.map((card) => card.vendor),
        nextOffset: result.nextOffset,
        hasMore: result.hasMore,
      }))
      : fetchPincodeVendors({
        pincode: locationSelection.pincode,
        categoryDisplayName: displayCategory,
        localityIds: locationSelection.localityIds ?? undefined,
        minRating,
        maxPrice,
        limit: LOCATION_PAGE_SIZE,
        offset: offsetToUse,
      }).then((result) => ({
        vendors: result.cards.map((card) => card.vendor),
        nextOffset: result.nextOffset,
        hasMore: result.hasMore,
      }));
    request
      .then(({ vendors, nextOffset, hasMore }) => {
        if (requestSequence !== locationRequestSequence.current) return;
        setLocationCards((previous) => (reset ? vendors : [...previous, ...vendors]));
        setLocationHasMore(hasMore);
        setLocationOffset(nextOffset);
      })
      .catch(() => {
        if (requestSequence === locationRequestSequence.current) {
          // Prevent FlatList.onEndReached from immediately retrying a failed
          // page forever. A changed location/filter starts a fresh request.
          setLocationHasMore(false);
          setLocationError("We couldn't load vendors for this location right now.");
        }
      })
      .finally(() => {
        if (requestSequence === locationRequestSequence.current) setLocationLoading(false);
      });
  }, [locationSelection, displayCategory, filters.minimumRating, filters.maximumPrice, locationOffset]);

  // Selecting/clearing a location, changing category, or narrowing by
  // rating/price all reset the location-mode cursor (mirrors the same
  // pagination-reset rule the legacy Taluka flow followed). Sort has no
  // server-side equivalent for these two RPCs, so it's applied client-side
  // via applySearchAndSort below instead of retriggering a fetch.
  useEffect(() => {
    locationRequestSequence.current += 1;
    if (!locationSelection) {
      setLocationCards([]);
      setLocationOffset(0);
      setLocationHasMore(true);
      setLocationError("");
      return;
    }
    setLocationCards([]);
    setLocationOffset(0);
    setLocationHasMore(true);
    fetchLocationPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSelection, displayCategory, filters.minimumRating, filters.maximumPrice]);

  const loadMoreLocation = useCallback(() => {
    if (locationLoading || !locationHasMore || !locationSelection) return;
    fetchLocationPage(false);
  }, [fetchLocationPage, locationSelection, locationHasMore, locationLoading]);

  const compact = width < 1100;
  const desktop = width >= 1100;
  const contentWidth = Math.min(width - (width >= 1100 ? 96 : 32), 1120);
  const colors = brandColors(isDark);
  const background = colors.background;
  const text = isDark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const locationSubtitle = locationSelection ? describeCategoryLocationSelection(locationSelection) : city;

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
    // Do not download the full verified marketplace while a location is
    // selected -- that path is served entirely by the bounded, paginated
    // fetchNearbyVendors / fetchPincodeVendors calls above instead.
    if (locationActive) {
      setVendorsLoading(false);
      return;
    }
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
  }, [locationActive]);

  const clearSearchAndFilters = () => {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
  };

  const vendors = useMemo(
    () => approvedVendors
      .filter((vendor) => vendor.category.toLowerCase() === displayCategory.toLowerCase()),
    [approvedVendors, displayCategory],
  );

  const applySearchAndSort = useCallback((source: PublicVendorListing[]) => {
    const normalizedQuery = query.trim().toLowerCase();
    const ratedVendors = source.map((vendor) => {
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
    return matching.sort((a, b) => {
      if (filters.sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
      if (filters.sort === "price") {
        return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
          - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
      }
      return Number(Boolean(b.isTopRated)) - Number(Boolean(a.isTopRated))
        || b.reviews - a.reviews
        || b.rating - a.rating;
    });
  }, [filters, getRating, query]);

  const filteredVendors = useMemo(() => {
    const baseSorted = applySearchAndSort(vendors);
    return rankVendorsByLocationAndMembership(baseSorted, preference, strictCityOnly);
  }, [applySearchAndSort, preference, strictCityOnly, vendors]);

  // Near Me / PIN-locality results are already category-filtered server-side
  // (categoryDisplayName is always passed through); only client-side search
  // text and sort are layered on top here, the same applySearchAndSort used
  // for the default flow -- no separate filtering logic to maintain.
  const locationFilteredVendors = useMemo(
    () => applySearchAndSort(locationCards),
    [applySearchAndSort, locationCards],
  );

  const listRows: ListRow[] = (locationActive ? locationFilteredVendors : filteredVendors)
    .map((vendor) => ({ kind: "vendor", vendor }));
  const visibleVendorCount = listRows.filter((row) => row.kind === "vendor").length;

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

  const renderRow = useCallback(({ item, index }: ListRenderItemInfo<ListRow>) => {
    if (item.kind === "separator") {
      return (
        <View style={[styles.separator, { borderColor: border }]}>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
          <Text style={[styles.separatorText, { color: muted }]}>{item.label}</Text>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
        </View>
      );
    }
    const vendor = item.vendor;
    return (
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
    );
  }, [isDark, compact, isFavorite, fallbackImage, router, displayCategory, toggleVendorFavorite, border, muted]);

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

        <HomeReveal delay={18}>
          <CategoryLocationSelector
            dark={isDark}
            value={locationSelection}
            onChange={setLocationSelection}
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
            count={visibleVendorCount}
            category={displayCategory}
            sortLabel={sortLabel}
            dark={isDark}
            onSort={() => openFilters("sort")}
            hasMore={locationActive && locationHasMore}
          />
        </HomeReveal>
      </View>

      <FlatList
        data={listRows}
        keyExtractor={(row) => (row.kind === "vendor" ? row.vendor.id : row.key)}
        renderItem={renderRow}
        extraData={favorites}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom: 34 }]}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        onEndReachedThreshold={0.4}
        onEndReached={locationActive ? loadMoreLocation : undefined}
        ListFooterComponent={locationActive && locationLoading && locationCards.length > 0 ? (
          <SkeletonList count={1} height={compact ? 172 : 220} gap={14} />
        ) : null}
        ListEmptyComponent={(vendorsLoading || (locationActive && locationLoading && !locationCards.length)) ? (
          <SkeletonList count={compact ? 3 : 4} height={compact ? 172 : 220} gap={14} />
        ) : (vendorsError || (locationActive && locationError)) ? (
          <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <RefreshCw size={22} color={colors.primaryStrong} />
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>Vendors are taking a moment</Text>
            <Text style={[styles.emptyText, { color: muted }]}>{vendorsError || locationError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (locationActive && locationError) fetchLocationPage(true);
                else void loadVendors();
              }}
              style={({ pressed }) => [styles.emptyAction, pressed && styles.emptyActionPressed]}
            >
              <Text style={styles.emptyActionText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <SearchX size={24} color={colors.primaryStrong} />
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>No matching {displayCategory.toLowerCase()}</Text>
            <Text style={[styles.emptyText, { color: muted }]}>
              {locationActive
                ? "Try clearing the location, or another keyword and the price and rating filters."
                : "Try another keyword or clear the price and rating filters."}
            </Text>
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
  separator: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { fontFamily: fonts.sans.semibold, fontSize: typeScale.caption, textAlign: "center" },
});
