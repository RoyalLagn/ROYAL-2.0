import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, type ListRenderItemInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Pressable from "@/components/InteropSafePressable";
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
import { useFavorites } from "@/context/FavoritesContext";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import {
  databaseCategoryCandidates, getApprovedPublicVendors, normalizeMarketplaceCategoryName, subscribeToPublicVendorChanges, type PublicVendorListing, } from "@/services/publicVendorListings";
import {
  findMarketplaceCategory, resolveMarketplaceCategoryImage, } from "@/data/marketplaceCategories";
import { SkeletonList } from "@/components/loading/Skeleton";
import PageLoader from "@/components/loading/PageLoader";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
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
import { getCurrentDeviceLocation, getDevicePermissionStatus, getLastDetectedLocationLabel, reverseGeocodeLabel, type DeviceCoordinates } from "@/services/deviceLocation";
import { fetchLocationRankedVendors } from "@/services/vendorDiscovery";
import { buildVendorListingPath, buildVendorProfilePathBySlug, displayLocationFromSlug } from "@/services/publicSeoRoutes";
import { vendorWebBase } from "@/services/contactActions";

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
  const raw = value.trim().replace(/^wedding-/i, "");
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
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ category?: string; location?: string; query?: string }>();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();

  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const displayCategory = resolveCategory(categoryParam);
  const locationParam = Array.isArray(params.location) ? params.location[0] : params.location;
  const requestedLocation = displayLocationFromSlug(locationParam);
  const initialQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterSection, setFilterSection] = useState<"sort" | "price" | "rating" | "filters">("filters");
  const [approvedVendors, setApprovedVendors] = useState<PublicVendorListing[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState("");
  const [currentLocationLabel, setCurrentLocationLabel] = useState("Current location");
  const [deviceOrigin, setDeviceOrigin] = useState<DeviceCoordinates | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const canonicalUrl = `${vendorWebBase()}${buildVendorListingPath(displayCategory, requestedLocation)}`;
    const pageTitle = requestedLocation
      ? `Wedding ${displayCategory} in ${requestedLocation} | RoyalLagn`
      : `Wedding ${displayCategory} | RoyalLagn`;
    const description = requestedLocation
      ? `Discover verified wedding ${displayCategory.toLowerCase()} in ${requestedLocation} on RoyalLagn.`
      : `Discover verified wedding ${displayCategory.toLowerCase()} on RoyalLagn.`;
    document.title = pageTitle;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);
  }, [displayCategory, requestedLocation]);

  // District/Taluka is the canonical marketplace discovery path. GPS and
  // direct PIN search remain separate, explicit features on their own routes.
  const [geoStates, setGeoStates] = useState<GeoState[]>([]);
  const [geoSelection, setGeoSelection] = useState<GeoSelection | null>(null);
  const [, setGeoDistrictName] = useState("");
  const [, setGeoTalukaName] = useState("");
  const [geoLoading, setGeoLoading] = useState(true);
  const [geoError, setGeoError] = useState("");
  const talukaActive = geoSelection !== null;
  const gpsActive = !talukaActive && deviceOrigin !== null;
  const locationActive = talukaActive || gpsActive;
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

  useEffect(() => {
    let active = true;
    (async () => {
      const cachedLabel = await getLastDetectedLocationLabel();
      if (active && cachedLabel) setCurrentLocationLabel(cachedLabel);
      if (await getDevicePermissionStatus() !== "granted" || !active) return;
      try {
        const coords = await getCurrentDeviceLocation();
        if (active) setDeviceOrigin(coords);
        const label = await reverseGeocodeLabel(coords).catch(() => null);
        if (active && label) setCurrentLocationLabel(label);
      } catch {
        // Never substitute the manual Taluka selection for device GPS.
      }
    })();
    return () => { active = false; };
  }, []);

  const selectGeoLocation = useCallback((selection: GeoSelection, districtName: string, talukaName: string) => {
    setGeoSelection(selection);
    setGeoDistrictName(districtName);
    setGeoTalukaName(talukaName);
    setGeoError("");
    void saveGuestGeoPreference(selection);
  }, []);

  const clearGeoLocation = useCallback(() => {
    setGeoSelection(null);
    setGeoDistrictName("");
    setGeoTalukaName("");
    setGeoError("");
    void clearGuestGeoPreference();
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
      : gpsActive && deviceOrigin
        ? fetchLocationRankedVendors({
          latitude: deviceOrigin.latitude,
          longitude: deviceOrigin.longitude,
          categoryDisplayName: displayCategory,
          search: query,
          minRating,
          maxPrice,
          sort: filters.sort,
          limit: LOCATION_PAGE_SIZE,
          offset: reset ? 0 : locationOffset,
        }).then((result) => ({
          vendors: result.cards.map((card) => card.vendor),
          meta: {},
          nextOffset: result.nextOffset,
          nextCursor: null,
          hasMore: result.hasMore,
        }))
        : Promise.resolve({ vendors: [], meta: {}, nextOffset: 0, nextCursor: null, hasMore: false });
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
  }, [locationActive, talukaActive, gpsActive, geoSelection, deviceOrigin, displayCategory, filters.minimumRating, filters.maximumPrice, filters.sort, query, locationOffset, locationCursor]);

  // Any location, category, search, filter, or sort change starts a fresh
  // server-ranked page so pagination never mixes two ordering strategies.
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
  }, [locationActive, geoSelection, deviceOrigin, displayCategory, filters.minimumRating, filters.maximumPrice, filters.sort, query]);

  const loadMoreLocation = useCallback(() => {
    if (locationLoading || !locationHasMore || !locationActive) return;
    fetchLocationPage(false);
  }, [fetchLocationPage, locationActive, locationHasMore, locationLoading]);

  const compact = width < 720;
  const desktop = width >= 1100;
  const pageGutter = width < 380 ? 24 : width < 768 ? 32 : width < 1100 ? 48 : 96;
  const contentWidth = Math.min(width - pageGutter, 960);
  const colors = brandColors(isDark);
  const background = colors.background;
  const text = isDark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const locationSubtitle = requestedLocation || currentLocationLabel;

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
      .filter((vendor) => vendor.category.toLowerCase() === displayCategory.toLowerCase())
      .filter((vendor) => !requestedLocation || vendor.location.toLowerCase().includes(requestedLocation.toLowerCase())),
    [approvedVendors, displayCategory, requestedLocation],
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

  const filteredVendors = useMemo(
    () => applySearchAndSort(vendors),
    [applySearchAndSort, vendors],
  );

  // Location results are fully filtered and sorted by their bounded RPCs so
  // neither Taluka tier order nor GPS membership ranking is changed here.
  const locationFilteredVendors = useMemo(
    () => locationCards,
    [locationCards],
  );

  const listRows: ListRow[] = useMemo(() => {
    const nearbyIds = new Set(locationFilteredVendors.map((vendor) => vendor.id));
    const source = talukaActive
      ? locationFilteredVendors
      : gpsActive
        ? [
          ...locationFilteredVendors,
          ...(!locationHasMore
            ? filteredVendors.filter((vendor) => !nearbyIds.has(vendor.id))
            : []),
        ]
        : filteredVendors;
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
  }, [filteredVendors, gpsActive, locationCardMeta, locationFilteredVendors, locationHasMore, talukaActive]);
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
              pathname: buildVendorProfilePathBySlug(vendor.slug) as "/vendor/[slug]",
              params: { slug: vendor.slug },
            })
          }
          onToggleFavorite={(source) => toggleVendorFavorite(vendor, source)}
        />
      </HomeReveal>
    );
  }, [isDark, compact, isFavorite, fallbackImage, router, toggleVendorFavorite, border, muted]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      {(vendorsLoading && !approvedVendors.length) || (locationActive && locationLoading && visibleVendorCount === 0) ? <PageLoader /> : null}
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
            active={{ sort: filters.sort !== "popular", price: filters.maximumPrice > 0, rating: filters.minimumRating > 0 }}
            onPress={openFilters}
            trailing={<TalukaLocationSelector states={geoStates} value={geoSelection} onChange={selectGeoLocation} onClear={clearGeoLocation} onResolvedLabel={resolveGeoLabel} loading={geoLoading} hideLabel compact />}
          />
          {geoError ? <Text accessibilityRole="alert" style={[styles.locationModeError, { color: colors.destructive }]}>{geoError}</Text> : null}
        </HomeReveal>

        <HomeReveal delay={95}>
          <ResultsSummary count={visibleVendorCount} category={displayCategory} sortLabel={sortLabel} dark={isDark} onSort={() => openFilters("sort")} hasMore={talukaActive && locationHasMore} />
        </HomeReveal>
      </View>

      <FlatList
        data={listRows}
        keyExtractor={(row) => (row.kind === "vendor" ? row.vendor.id : row.key)}
        renderItem={renderRow}
        extraData={favorites}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom: desktop ? 44 : 112 }]}
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
              style={({ pressed, hovered, focused }) => [styles.emptyAction, (hovered || focused) && styles.emptyActionHover, pressed && styles.emptyActionPressed]}
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
              {!geoSelection
                ? "Choose a District and Taluka to see local vendors first, followed by nearby Talukas."
                : "Try another keyword, adjust the price or rating filters, or choose another Taluka."}
            </Text>
            {(query || activeFilterCount > 0) ? (
              <Pressable accessibilityRole="button" onPress={clearSearchAndFilters} style={({ pressed, hovered, focused }) => [styles.emptyAction, (hovered || focused) && styles.emptyActionHover, pressed && styles.emptyActionPressed]}>
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
  top: { alignSelf: "center", paddingTop: 2, paddingBottom: 10 },
  locationModes: { gap: 10 },
  locationModeError: { fontFamily: fonts.sans.medium, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  chips: { marginBottom: 2 },
  scroll: { flex: 1 },
  list: { alignSelf: "center", gap: 12, paddingTop: 8 },
  empty: { minHeight: 250, marginTop: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 15, fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  emptyText: { maxWidth: 380, marginTop: 7, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  emptyAction: { minHeight: 44, marginTop: 16, paddingHorizontal: 18, borderRadius: 14, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center" },
  emptyActionHover: { transform: [{ translateY: -1 }] },
  emptyActionPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  emptyActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  separator: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { fontFamily: fonts.sans.semibold, fontSize: typeScale.caption, textAlign: "center" },
});
