import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionList, type ListRenderItemInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { ArrowUpDown, ChevronDown, Grid2X2, List, RefreshCw, SearchX } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { getCurrentDeviceLocation, getDevicePermissionStatus, getLastDetectedCoordinates, getLastDetectedLocationLabel, requestDeviceLocationPermission, requestDeviceLocationServices, reverseGeocodeLabel, saveLocationDisplayLabel, type DeviceCoordinates } from "@/services/deviceLocation";
import { fetchLocationRankedVendors } from "@/services/vendorDiscovery";
import { buildVendorListingPath, buildVendorProfilePathBySlug, displayLocationFromSlug } from "@/services/publicSeoRoutes";
import { vendorWebBase } from "@/services/contactActions";
import { discoveryLayout } from "@/constants/discoveryLayout";
import { isPublicWideLayout } from "@/utils/responsiveLayout";

const LOCATION_PAGE_SIZE = 20;

type ListRow =
  | { kind: "summary"; key: string }
  | { kind: "empty"; key: string }
  | { kind: "vendor"; vendor: PublicVendorListing }
  | { kind: "vendor-grid"; key: string; vendors: PublicVendorListing[] }
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
  const { width, height } = useWindowDimensions();
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
  const [listingLayout, setListingLayout] = useState<"strip" | "grid">(() => width < 720 ? "grid" : "strip");
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

  // District/Taluka is the canonical marketplace discovery path. GPS remains
  // available as the nearby alternative on this listing surface.
  const [geoStates, setGeoStates] = useState<GeoState[]>([]);
  const [geoSelection, setGeoSelection] = useState<GeoSelection | null>(null);
  const [, setGeoDistrictName] = useState("");
  const [geoTalukaName, setGeoTalukaName] = useState("");
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
    listActiveGeoStates()
      .then((states) => {
        if (!active) return;
        setGeoStates(states);
        if (states.length === 0) {
          setGeoError("No active service locations are available right now.");
        }
      })
      .catch(() => {
        if (active) setGeoError("District and Taluka options could not be loaded. Try again.");
      })
      .finally(() => { if (active) setGeoLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadGuestGeoPreference();
      if (stored) {
        const validated = await validateGeoSelection(stored);
        if (!active) return;
        if (validated) {
          setGeoSelection({ stateId: validated.stateId, districtId: validated.districtId, talukaId: validated.talukaId });
          setGeoDistrictName(validated.districtName);
          setGeoTalukaName(validated.talukaName);
          setDeviceOrigin(null);
          await saveLocationDisplayLabel(validated.talukaName);
          return;
        }
        await clearGuestGeoPreference();
      }
      const coordinates = await getLastDetectedCoordinates();
      if (!active || !coordinates) return;
      setDeviceOrigin(coordinates);
      const label = await getLastDetectedLocationLabel();
      if (active && label) setCurrentLocationLabel(label);
    })().catch(() => {});
    return () => { active = false; };
  }, []);

  const selectGeoLocation = useCallback((selection: GeoSelection, districtName: string, talukaName: string) => {
    setGeoSelection(selection);
    setDeviceOrigin(null);
    setGeoDistrictName(districtName);
    setGeoTalukaName(talukaName);
    setGeoError("");
    void saveGuestGeoPreference(selection);
    void saveLocationDisplayLabel(talukaName);
  }, []);

  const clearGeoLocation = useCallback(() => {
    setGeoSelection(null);
    setGeoDistrictName("");
    setGeoTalukaName("");
    setGeoError("");
    void clearGuestGeoPreference();
  }, []);

  const useCurrentLocation = useCallback(async () => {
    let permission = await getDevicePermissionStatus();
    if (permission !== "granted") permission = await requestDeviceLocationPermission();
    if (permission !== "granted") throw new Error("Location permission was not granted.");
    if (!(await requestDeviceLocationServices())) throw new Error("Location services remain off.");

    // Reuse a recently resolved Home/listing origin only after confirming that
    // device location is currently enabled. This preserves the official Android
    // turn-on prompt when the user has switched location services off.
    if (deviceOrigin) {
      setGeoSelection(null);
      setGeoDistrictName("");
      setGeoTalukaName("");
      setGeoError("");
      await clearGuestGeoPreference();
      return;
    }

    const coords = await getCurrentDeviceLocation();
    const label = await reverseGeocodeLabel(coords).catch(() => null);
    setGeoSelection(null);
    setGeoDistrictName("");
    setGeoTalukaName("");
    setGeoError("");
    setDeviceOrigin(coords);
    if (label) setCurrentLocationLabel(label);
    await clearGuestGeoPreference();
  }, [deviceOrigin]);

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

  const desktopWeb = Platform.OS === "web" && width >= 1100;
  const wideLayout = isPublicWideLayout(width, height);
  const compact = !wideLayout && width < 720;
  const gridColumns = wideLayout
    ? discoveryLayout.webGridColumns
    : discoveryLayout.mobileGridColumns;
  const pageGutter = wideLayout
    ? desktopWeb ? discoveryLayout.webPageGutter : 48
    : width < 380 ? 24 : width < 768 ? 32 : 48;
  const contentWidth = Math.min(
    width - pageGutter,
    wideLayout ? discoveryLayout.webContentMaxWidth : 960,
  );
  const gridCardWidth = Math.max(
    discoveryLayout.gridMinCardWidth,
    Math.floor((contentWidth - discoveryLayout.gridGap * (gridColumns - 1)) / gridColumns),
  );
  const gridViewLabel = gridColumns === discoveryLayout.webGridColumns ? "3-column grid" : "2 by 2 grid";
  const colors = brandColors(isDark);
  const background = colors.background;
  const text = isDark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const navbarLocationLabel = geoTalukaName
    || (gpsActive ? currentLocationLabel : requestedLocation)
    || "Choose location";

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

  const clearSearchAndFilters = useCallback(() => {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
  }, []);

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
  const gridRows = useMemo<ListRow[]>(() => {
    if (listingLayout !== "grid") return listRows;
    const rows: ListRow[] = [];
    let pending: PublicVendorListing[] = [];
    const flush = () => {
      if (!pending.length) return;
      rows.push({ kind: "vendor-grid", key: `vendor-grid-${pending.map((vendor) => vendor.id).join("-")}`, vendors: pending });
      pending = [];
    };
    for (const row of listRows) {
      // Tier separators are useful in the one-column list, but a full-width
      // separator in a two/three-column grid breaks the card row and leaves
      // an artificial empty slot. Grid order already preserves the same
      // local-first, nearby-next ranking, so keep its cards continuous.
      if (row.kind === "separator") continue;
      if (row.kind !== "vendor") {
        flush();
        rows.push(row);
        continue;
      }
      pending.push(row.vendor);
      if (pending.length === gridColumns) flush();
    }
    flush();
    return rows;
  }, [gridColumns, listRows, listingLayout]);
  const displayRows = useMemo<ListRow[]>(
    () => visibleVendorCount > 0
      ? [{ kind: "summary", key: "results-summary" }, ...gridRows]
      : [{ kind: "empty", key: "vendors-empty-state" }],
    [gridRows, visibleVendorCount],
  );

  const activeFilterCount = [
    filters.sort !== "popular",
    filters.maximumPrice > 0,
    filters.minimumRating > 0,
  ].filter(Boolean).length;
  const hasSearchOrFilterRefinement = Boolean(query.trim() || activeFilterCount > 0);

  const openFilters = (section: "sort" | "price" | "rating" | "filters") => {
    setFilterSection(section);
    setFiltersVisible(true);
  };

  const sortLabel = filters.sort === "rating"
    ? "Highest rated"
    : filters.sort === "price"
      ? "Lowest price"
      : "Popular";
  const categorySubtitle = displayCategory === "Photographers"
    ? "Capture your special moments"
    : `Discover trusted ${displayCategory.toLowerCase()}`;

  const toggleVendorFavorite = useCallback((vendor: PublicVendorListing, source: FavoriteSourceRef) => {
    toggleFavorite({
      id: vendor.id,
      slug: vendor.slug,
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
    if (item.kind === "summary") {
      return (
        <HomeReveal delay={95}>
          <ResultsSummary count={visibleVendorCount} category={displayCategory} sortLabel={sortLabel} dark={isDark} onSort={() => openFilters("sort")} showSort={!wideLayout} hasMore={talukaActive && locationHasMore} />
        </HomeReveal>
      );
    }
    if (item.kind === "separator") {
      return (
        <View style={[styles.separator, { borderColor: border }]}>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
          <Text style={[styles.separatorText, { color: muted }]}>{item.label}</Text>
          <View style={[styles.separatorLine, { backgroundColor: border }]} />
        </View>
      );
    }
    if (item.kind === "empty") {
      if (vendorsLoading || (locationActive && locationLoading && !locationCards.length)) {
        return <SkeletonList count={compact ? 3 : 4} height={compact ? 172 : 220} gap={14} />;
      }
      if (vendorsError || (locationActive && locationError)) {
        return (
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
        );
      }
      return (
        <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <SearchX size={24} color={colors.primaryStrong} />
          </View>
          <Text style={[styles.emptyTitle, { color: text }]}>
            {hasSearchOrFilterRefinement
              ? "No matching vendors"
              : locationActive
                ? "Vendors are not available in your area"
                : "Vendors are not available in this category"}
          </Text>
          <Text style={[styles.emptyText, { color: muted }]}>{hasSearchOrFilterRefinement
              ? "No vendors match your search or selected filters. Try clearing them to see more results."
              : locationActive
                ? `No ${displayCategory.toLowerCase()} are currently available in ${navbarLocationLabel}. Try another location.`
                : `No vendors are currently available in ${displayCategory}. Try another category.`}
          </Text>
          {hasSearchOrFilterRefinement ? (
            <Pressable accessibilityRole="button" onPress={clearSearchAndFilters} style={({ pressed, hovered, focused }) => [styles.emptyAction, (hovered || focused) && styles.emptyActionHover, pressed && styles.emptyActionPressed]}>
              <Text style={styles.emptyActionText}>Clear search and filters</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    const renderVendor = (vendor: PublicVendorListing, grid = false) => (
      <VendorListingCard
        vendor={vendor}
        dark={isDark}
        compact={compact}
        layout={grid ? "grid" : "strip"}
        cardWidth={grid ? gridCardWidth : undefined}
        favorite={isFavorite(vendor.id)}
        fallbackImage={fallbackImage}
        onOpen={() => router.push({ pathname: buildVendorProfilePathBySlug(vendor.slug) as "/vendor/[slug]", params: { slug: vendor.slug, src: "listing" } })}
        onToggleFavorite={(source) => toggleVendorFavorite(vendor, source)}
      />
    );
    if (item.kind === "vendor-grid") {
      return <HomeReveal delay={Math.min(index * 30, 210)}><View style={styles.gridRow}>{item.vendors.map((vendor) => <View key={vendor.id} style={{ width: gridCardWidth }}>{renderVendor(vendor, true)}</View>)}</View></HomeReveal>;
    }
    const vendor = item.vendor;
    return (
      <HomeReveal delay={Math.min(index * 30, 210)}>
        {renderVendor(vendor)}
      </HomeReveal>
    );
  }, [isDark, compact, wideLayout, isFavorite, fallbackImage, router, toggleVendorFavorite, border, muted, visibleVendorCount, displayCategory, sortLabel, talukaActive, locationHasMore, vendorsLoading, locationActive, locationLoading, locationCards.length, vendorsError, locationError, colors, text, fetchLocationPage, loadVendors, hasSearchOrFilterRefinement, navbarLocationLabel, clearSearchAndFilters, gridCardWidth]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      {(vendorsLoading && !approvedVendors.length) || (locationActive && locationLoading && visibleVendorCount === 0) ? <PageLoader /> : null}
      <PublicWebNavbar
        activeRoute="Categories"
        locationControl={(
          <TalukaLocationSelector
            states={geoStates}
            value={geoSelection}
            displayLabel={navbarLocationLabel}
            onChange={selectGeoLocation}
            onClear={clearGeoLocation}
            onResolvedLabel={resolveGeoLabel}
            onUseCurrentLocation={useCurrentLocation}
            loading={geoLoading}
            hideLabel
            compact
            variant="navbar"
          />
        )}
      />
      <SectionList
        sections={[{ key: "vendors", data: displayRows }]}
        keyExtractor={(row) => (row.kind === "vendor" ? row.vendor.id : row.key)}
        renderItem={renderRow}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        renderSectionHeader={() => (
          <View style={[styles.stickyControls, { width: contentWidth, backgroundColor: background }]}>
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
              <View style={styles.refinementControls}>
                <TalukaLocationSelector
                  states={geoStates}
                  value={geoSelection}
                  displayLabel={navbarLocationLabel}
                  onChange={selectGeoLocation}
                  onClear={compact ? undefined : clearGeoLocation}
                  onResolvedLabel={resolveGeoLabel}
                  onUseCurrentLocation={useCurrentLocation}
                  loading={geoLoading}
                  hideLabel
                  compact
                  compactWidth={compact ? (width < 360 ? 118 : 138) : undefined}
                />
                <View style={[styles.layoutSegment, { backgroundColor: isDark ? "#251B20" : "#FFF7FA", borderColor: border }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Show vendors in ${gridViewLabel} view`} accessibilityState={{ selected: listingLayout === "grid" }} onPress={() => setListingLayout("grid")} style={({ pressed }) => [styles.layoutOption, listingLayout === "grid" && { backgroundColor: isDark ? "#3A222C" : "#FFF0F6", borderColor: colors.primary }, pressed && styles.controlPressed]}>
                    <Grid2X2 size={18} color={listingLayout === "grid" ? colors.primaryStrong : muted} strokeWidth={2.2} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Show vendors in list view" accessibilityState={{ selected: listingLayout === "strip" }} onPress={() => setListingLayout("strip")} style={({ pressed }) => [styles.layoutOption, listingLayout === "strip" && { backgroundColor: isDark ? "#3A222C" : "#FFF0F6", borderColor: colors.primary }, pressed && styles.controlPressed]}>
                    <List size={19} color={listingLayout === "strip" ? colors.primaryStrong : muted} strokeWidth={2.2} />
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Sort results, currently ${sortLabel}`} onPress={() => openFilters("sort")} style={({ pressed, hovered, focused }) => [styles.sortControl, { backgroundColor: colors.card, borderColor: border }, (hovered || focused) && styles.controlInteractive, pressed && styles.controlPressed]}>
                  <ArrowUpDown size={17} color={colors.primaryStrong} strokeWidth={2.1} />
                  {width >= 360 ? <Text numberOfLines={1} style={[styles.sortControlText, { color: text }]}>{sortLabel}</Text> : null}
                  <ChevronDown size={15} color={colors.primaryStrong} />
                </Pressable>
              </View>
              {geoError ? <Text accessibilityRole="alert" style={[styles.locationModeError, { color: colors.destructive }]}>{geoError}</Text> : null}
            </HomeReveal>
          </View>
        )}
        ListHeaderComponent={(
          <View>
            <HomeReveal direction="down">
              <CategoryListingHeader category={displayCategory} subtitle={categorySubtitle} dark={isDark} />
            </HomeReveal>
          </View>
        )}
        extraData={[favorites, listingLayout]}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.list, { width: contentWidth, paddingBottom: desktopWeb ? 44 : 112 }]}
        stickySectionHeadersEnabled
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        onEndReachedThreshold={0.4}
        onEndReached={locationActive ? loadMoreLocation : undefined}
        ListFooterComponent={locationActive && locationLoading && locationCards.length > 0 ? (
          <SkeletonList count={1} height={compact ? 172 : 220} gap={14} />
        ) : null}
      />

      {!desktopWeb ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}

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
  stickyControls: {
    marginTop: discoveryLayout.headerSearchOverlap,
    paddingTop: discoveryLayout.stickySearchPaddingTop,
    paddingBottom: discoveryLayout.stickySearchPaddingBottom,
    zIndex: 10,
  },
  locationModes: { gap: 10 },
  locationModeError: { fontFamily: fonts.sans.medium, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  chips: { marginTop: discoveryLayout.controlsGap, marginBottom: 2 },
  refinementControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  layoutSegment: { height: 44, flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 2 },
  layoutOption: { width: 40, height: 38, borderWidth: 1, borderColor: "transparent", borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sortControl: { flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderRadius: 22, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  sortControlText: { flexShrink: 1, fontFamily: fonts.sans.semibold, fontSize: typeScale.metadata },
  controlInteractive: { transform: [{ translateY: -1 }] },
  controlPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  scroll: { flex: 1 },
  list: { alignSelf: "center" },
  rowGap: { height: discoveryLayout.resultsGap },
  gridRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", columnGap: discoveryLayout.gridGap },
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
