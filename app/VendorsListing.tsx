import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, type ListRenderItemInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { LocateFixed, MapPinned, RefreshCw, SearchX } from "lucide-react-native";
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
  databaseCategoryCandidates, getApprovedPublicVendors, normalizeMarketplaceCategoryName, subscribeToPublicVendorChanges, type PublicVendorListing, } from "@/services/publicVendorListings";
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
import { TalukaLocationSelector } from "@/components/locations/TalukaLocationSelector";
import {
  clearGuestGeoPreference,
  fetchTalukaVendorPageCards,
  listActiveGeoStates,
  loadGuestGeoPreference,
  saveGuestGeoPreference,
  validateGeoSelection,
  type TalukaPageCursor,
} from "@/services/geoLocations";
import type { GeoSelection, GeoState } from "@/locations/types";

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

  // Three database-backed discovery modes share one listing owner:
  // District/Taluka (default), Near Me, and PIN/locality. Keeping the fetch
  // orchestration here guarantees category/filter pagination cannot diverge
  // between selectors.
  const [discoveryMode, setDiscoveryMode] = useState<"taluka" | "quick">("taluka");
  const [geoStates, setGeoStates] = useState<GeoState[]>([]);
  const [geoSelection, setGeoSelection] = useState<GeoSelection | null>(null);
  const [geoDistrictName, setGeoDistrictName] = useState("");
  const [geoTalukaName, setGeoTalukaName] = useState("");
  const [geoLoading, setGeoLoading] = useState(true);
  const [geoError, setGeoError] = useState("");
  const [locationSelection, setLocationSelection] = useState<CategoryLocationSelection | null>(null);
  const talukaActive = discoveryMode === "taluka" && geoSelection !== null;
  const quickLocationActive = discoveryMode === "quick" && locationSelection !== null;
  const locationActive = talukaActive || quickLocationActive;
  const [locationCards, setLocationCards] = useState<PublicVendorListing[]>([]);
  const [locationCardMeta, setLocationCardMeta] = useState<Record<string, { tier: number; talukaName: string }>>({});
  const [locationOffset, setLocationOffset] = useState(0);
  const [locationCursor, setLocationCursor] = useState<TalukaPageCursor | null>(null);
  const [locationHasMore, setLocationHasMore] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationRequestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    setGeoLoading(true);
    setGeoError("");
    Promise.all([listActiveGeoStates(), loadGuestGeoPreference()])
      .then(async ([states, stored]) => {
        if (!active) return;
        setGeoStates(states);
        if (states.length === 0) {
          setGeoError("No active service locations are available right now.");
          return;
        }
        if (!stored) return;
        const validated = await validateGeoSelection(stored);
        if (!active) return;
        if (!validated) {
          await clearGuestGeoPreference();
          return;
        }
        setGeoSelection({ stateId: validated.stateId, districtId: validated.districtId, talukaId: validated.talukaId });
        setGeoDistrictName(validated.districtName);
        setGeoTalukaName(validated.talukaName);
      })
      .catch(() => {
        if (active) setGeoError("District and Taluka options could not be loaded. Try again.");
      })
      .finally(() => { if (active) setGeoLoading(false); });
    return () => { active = false; };
  }, []);

  const selectGeoLocation = useCallback((selection: GeoSelection, districtName: string, talukaName: string) => {
    setGeoSelection(selection);
    setGeoDistrictName(districtName);
    setGeoTalukaName(talukaName);
    setLocationSelection(null);
    setGeoError("");
    void saveGuestGeoPreference(selection);
  }, []);

  const resolveGeoLabel = useCallback((districtName: string, talukaName: string) => {
    setGeoDistrictName(districtName);
    setGeoTalukaName(talukaName);
  }, []);

  const fetchLocationPage = useCallback((reset: boolean) => {
    if (!locationActive) return;
    const requestSequence = ++locationRequestSequence.current;
    setLocationLoading(true);
    setLocationError("");
    const offsetToUse = reset ? 0 : locationOffset;
    const minRating = filters.minimumRating > 0 ? filters.minimumRating : undefined;
    const maxPrice = filters.maximumPrice > 0 ? filters.maximumPrice : undefined;
    const activeTalukaId = talukaActive ? geoSelection?.talukaId : null;
    const request = activeTalukaId
      ? fetchTalukaVendorPageCards({
        categoryNames: databaseCategoryCandidates(displayCategory),
        talukaId: activeTalukaId,
        search: query,
        minRating,
        maxPrice,
        sort: filters.sort,
        limit: LOCATION_PAGE_SIZE,
        offset: reset ? 0 : locationOffset,
        after: reset ? null : locationCursor,
      }).then((result) => ({
        vendors: result.cards.map((card) => card.vendor),
        meta: Object.fromEntries(result.cards.map((card) => [card.vendor.id, { tier: card.tier, talukaName: card.talukaName }])),
        nextOffset: result.nextOffset,
        nextCursor: result.nextCursor,
        hasMore: result.cards.length === LOCATION_PAGE_SIZE,
      }))
      : locationSelection?.mode === "nearMe"
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
        meta: {},
        nextOffset: result.nextOffset,
        nextCursor: null,
        hasMore: result.hasMore,
      }))
      : locationSelection?.mode === "pincode" ? fetchPincodeVendors({
        pincode: locationSelection.pincode,
        categoryDisplayName: displayCategory,
        localityIds: locationSelection.localityIds ?? undefined,
        minRating,
        maxPrice,
        limit: LOCATION_PAGE_SIZE,
        offset: offsetToUse,
      }).then((result) => ({
        vendors: result.cards.map((card) => card.vendor),
        meta: {},
        nextOffset: result.nextOffset,
        nextCursor: null,
        hasMore: result.hasMore,
      })) : Promise.resolve({ vendors: [], meta: {}, nextOffset: 0, nextCursor: null, hasMore: false });
    request
      .then(({ vendors, meta, nextOffset, nextCursor, hasMore }) => {
        if (requestSequence !== locationRequestSequence.current) return;
        setLocationCards((previous) => (reset ? vendors : [...previous, ...vendors]));
        setLocationCardMeta((previous) => (reset ? meta : { ...previous, ...meta }));
        setLocationHasMore(hasMore);
        setLocationOffset(nextOffset);
        setLocationCursor(nextCursor);
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
  }, [locationActive, talukaActive, geoSelection, locationSelection, displayCategory, filters.minimumRating, filters.maximumPrice, filters.sort, query, locationOffset, locationCursor]);

  // Selecting/clearing a location, changing category, or narrowing by
  // rating/price all reset the location-mode cursor (mirrors the same
  // pagination-reset rule the legacy Taluka flow followed). Sort has no
  // server-side equivalent for these two RPCs, so it's applied client-side
  // via applySearchAndSort below instead of retriggering a fetch.
  useEffect(() => {
    locationRequestSequence.current += 1;
    if (!locationActive) {
      setLocationCards([]);
      setLocationCardMeta({});
      setLocationOffset(0);
      setLocationCursor(null);
      setLocationHasMore(true);
      setLocationError("");
      return;
    }
    setLocationCards([]);
    setLocationCardMeta({});
    setLocationOffset(0);
    setLocationCursor(null);
    setLocationHasMore(true);
    fetchLocationPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationActive, discoveryMode, geoSelection, locationSelection, displayCategory, filters.minimumRating, filters.maximumPrice, filters.sort, talukaActive ? query : ""]);

  const loadMoreLocation = useCallback(() => {
    if (locationLoading || !locationHasMore || !locationActive) return;
    fetchLocationPage(false);
  }, [fetchLocationPage, locationActive, locationHasMore, locationLoading]);

  const compact = width < 1100;
  const desktop = width >= 1100;
  const contentWidth = Math.min(width - (width >= 1100 ? 96 : 32), 1120);
  const colors = brandColors(isDark);
  const background = colors.background;
  const text = isDark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const locationSubtitle = talukaActive
    ? `${geoTalukaName}, ${geoDistrictName}`
    : quickLocationActive && locationSelection
      ? describeCategoryLocationSelection(locationSelection)
      : city;

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

  // Taluka results are fully filtered and sorted by the bounded RPC so tier
  // order can never be destroyed client-side. Near Me/PIN retain their
  // existing client-side search/sort layer.
  const locationFilteredVendors = useMemo(
    () => talukaActive ? locationCards : applySearchAndSort(locationCards),
    [applySearchAndSort, locationCards, talukaActive],
  );

  const listRows: ListRow[] = useMemo(() => {
    const source = locationActive ? locationFilteredVendors : filteredVendors;
    if (!talukaActive) return source.map((vendor) => ({ kind: "vendor", vendor }));
    const rows: ListRow[] = [];
    let previousTier = 0;
    for (const vendor of source) {
      const meta = locationCardMeta[vendor.id];
      if (meta?.tier > 0 && meta.tier !== previousTier) {
        rows.push({ kind: "separator", key: `nearby-tier-${meta.tier}`, label: `Nearby · ${meta.talukaName}` });
      }
      rows.push({ kind: "vendor", vendor });
      if (meta) previousTier = meta.tier;
    }
    return rows;
  }, [filteredVendors, locationActive, locationCardMeta, locationFilteredVendors, talukaActive]);
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
          <View style={styles.locationModes}>
            <View style={[styles.modeSwitch, { borderColor: border, backgroundColor: colors.card }]} accessibilityRole="tablist">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: discoveryMode === "taluka" }}
                onPress={() => setDiscoveryMode("taluka")}
                style={[styles.modeButton, discoveryMode === "taluka" && { backgroundColor: colors.primary }]}
              >
                <MapPinned size={16} color={discoveryMode === "taluka" ? "#FFFFFF" : colors.primaryStrong} />
                <Text style={[styles.modeButtonText, { color: discoveryMode === "taluka" ? "#FFFFFF" : text }]}>District & Taluka</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: discoveryMode === "quick" }}
                onPress={() => setDiscoveryMode("quick")}
                style={[styles.modeButton, discoveryMode === "quick" && { backgroundColor: colors.primary }]}
              >
                <LocateFixed size={16} color={discoveryMode === "quick" ? "#FFFFFF" : colors.primaryStrong} />
                <Text style={[styles.modeButtonText, { color: discoveryMode === "quick" ? "#FFFFFF" : text }]}>Near Me or PIN</Text>
              </Pressable>
            </View>

            {discoveryMode === "taluka" ? (
              <>
                <TalukaLocationSelector
                  states={geoStates}
                  value={geoSelection}
                  onChange={selectGeoLocation}
                  onResolvedLabel={resolveGeoLabel}
                  loading={geoLoading}
                />
                {geoError ? <Text accessibilityRole="alert" style={[styles.locationModeError, { color: colors.destructive }]}>{geoError}</Text> : null}
              </>
            ) : (
              <CategoryLocationSelector
                dark={isDark}
                value={locationSelection}
                onChange={setLocationSelection}
              />
            )}
          </View>
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
  locationModes: { gap: 10 },
  modeSwitch: { minHeight: 48, padding: 4, borderWidth: 1, borderRadius: 16, flexDirection: "row", gap: 4 },
  modeButton: { flex: 1, minHeight: 40, paddingHorizontal: 10, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  modeButtonText: { flexShrink: 1, fontFamily: fonts.sans.bold, fontSize: typeScale.metadata, textAlign: "center" },
  locationModeError: { fontFamily: fonts.sans.medium, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
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
