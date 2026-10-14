import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowUpDown, ChevronDown, ChevronRight, PanelsTopLeft, Rows3, Search as SearchIcon } from "lucide-react-native";
import { StandaloneMobileTabBar, useMobileTabBarHeight } from "@/components/MobileTabBar";
import { useColorScheme } from "nativewind";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import {
  databaseCategoryCandidates,
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";
import { useCategories } from "@/context/CategoryContext";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import PageLoader from "@/components/loading/PageLoader";
import { useCustomerLocation } from "@/context/LocationContext";
import { buildVendorListingPath } from "@/services/publicSeoRoutes";
import { vendorProfileHref } from "@/services/contactActions";
import {
  rankTopRatedVendorsByLocation,
  rankVendorsByLocationAndMembership,
  vendorMembershipPriority,
} from "@/locations/domain";
import VendorListingCard from "@/components/listing/VendorListingCard";
import { useFavorites } from "@/context/FavoritesContext";
import { fetchLocationRankedVendors } from "@/services/vendorDiscovery";
import {
  getCurrentDeviceLocation,
  getDevicePermissionStatus,
  getLastDetectedCoordinates,
  requestDeviceLocationPermission,
  requestDeviceLocationServices,
  reverseGeocodeLabel,
  saveLocationDisplayLabel,
} from "@/services/deviceLocation";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import CategoryListingHeader from "@/components/listing/CategoryListingHeader";
import CategorySearchBar from "@/components/categories/CategorySearchBar";
import HomeFilterModal, { DEFAULT_HOME_FILTERS, type HomeFilters } from "@/components/home/HomeFilterModal";
import ResultsSummary from "@/components/listing/ResultsSummary";
import Pressable from "@/components/InteropSafePressable";
import { TalukaLocationSelector } from "@/components/locations/TalukaLocationSelector";
import type { GeoSelection, GeoState } from "@/locations/types";
import { discoveryLayout } from "@/constants/discoveryLayout";
import {
  clearGuestGeoPreference,
  fetchTalukaVendorPageCards,
  listActiveGeoStates,
  loadGuestGeoPreference,
  saveGuestGeoPreference,
  validateGeoSelection,
} from "@/services/geoLocations";
import { listFeaturedVendorIdsForPincode, subscribeToFeaturedPlacements } from "@/services/featuredVendorPlacements";
import { isPublicWideLayout } from "@/utils/responsiveLayout";

const GLOBAL_PAGES = [
  { label: "Categories", detail: "Browse every wedding service", keywords: "categories services vendors browse", route: "/(tabs)/Categories" as const },
  { label: "Favorites", detail: "Open your saved vendors", keywords: "favorites saved wishlist shortlist heart", route: "/(tabs)/favorites" as const },
  { label: "Profile", detail: "Manage your RoyalLagn account", keywords: "profile account settings edit personal", route: "/(tabs)/profile" as const },
  { label: "Help & Support", detail: "Get help using RoyalLagn", keywords: "help support contact assistance faq", route: "/Help" as const },
  { label: "About RoyalLagn", detail: "Learn more about the platform", keywords: "about royallagn company information", route: "/About" as const },
  { label: "Privacy Policy", detail: "Review privacy information", keywords: "privacy policy data security", route: "/PrivacyPolicy" as const },
  { label: "Terms & Conditions", detail: "Review application terms", keywords: "terms conditions legal policy", route: "/Terms" as const },
  { label: "Become a Vendor", detail: "List your wedding business", keywords: "become vendor register business list", route: "/VendorAuth" as const },
];

function matchesKeyword(haystack: string, keyword: string) {
  const tokens = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const normalized = haystack.toLowerCase();
  return tokens.every((token) => normalized.includes(token));
}

export default function SearchScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width, height } = useWindowDimensions();
  const { getRating } = useReviewRatings();
  const { searchCategories } = useCategories();
  const { preference, location: customerLocation } = useCustomerLocation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const mobileTabBarHeight = useMobileTabBarHeight();
  const params = useLocalSearchParams<{
    query?: string;
    location?: string;
    rating?: string;
    budget?: string;
    category?: string;
    nearby?: string;
    sort?: string;
    featured?: string;
    pincode?: string;
  }>();
  const featuredOnly = (Array.isArray(params.featured) ? params.featured[0] : params.featured) === "true";
  const featuredPincode = Array.isArray(params.pincode) ? params.pincode[0] : params.pincode;
  const initialQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [vendors, setVendors] = useState<PublicVendorListing[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [featuredVendorIds, setFeaturedVendorIds] = useState<string[]>([]);
  const [featuredVendorsLoading, setFeaturedVendorsLoading] = useState(featuredOnly);
  const [distanceByVendor, setDistanceByVendor] = useState<Record<string, number>>({});
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [listingLayout, setListingLayout] = useState<"strip" | "grid">("strip");
  const [, setLocationLoading] = useState(false);
  const [geoStates, setGeoStates] = useState<GeoState[]>([]);
  const [geoSelection, setGeoSelection] = useState<GeoSelection | null>(null);
  const [geoTalukaName, setGeoTalukaName] = useState("");
  const [geoResults, setGeoResults] = useState<PublicVendorListing[]>([]);
  const [geoTierByVendor, setGeoTierByVendor] = useState<Record<string, number>>({});
  const [geoLoading, setGeoLoading] = useState(true);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    const nextQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
    setDraftQuery(nextQuery);
    setQuery(nextQuery);
  }, [params.query]);

  useEffect(() => {
    let active = true;
    const load = () => {
      getApprovedPublicVendors()
        .then((items) => {
          if (active) setVendors(items);
        })
        .catch(() => {
          if (active) setVendors([]);
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

  useEffect(() => {
    if (!featuredOnly) {
      setFeaturedVendorsLoading(false);
      return;
    }
    let active = true;
    const load = () => listFeaturedVendorIdsForPincode(featuredPincode)
      .then((ids) => { if (active) setFeaturedVendorIds(ids); })
      .catch(() => { if (active) setFeaturedVendorIds([]); })
      .finally(() => { if (active) setFeaturedVendorsLoading(false); });
    void load();
    const unsubscribe = subscribeToFeaturedPlacements(() => void load());
    return () => { active = false; unsubscribe(); };
  }, [featuredOnly, featuredPincode]);

  const [filters, setFilters] = useState<HomeFilters>(() => ({
    ...DEFAULT_HOME_FILTERS,
    minimumRating: Number(Array.isArray(params.rating) ? params.rating[0] : params.rating) || 0,
    maximumBudget: Number(Array.isArray(params.budget) ? params.budget[0] : params.budget) || 0,
    category: Array.isArray(params.category) ? params.category[0] : params.category ?? "",
    nearbyOnly: (Array.isArray(params.nearby) ? params.nearby[0] : params.nearby) === "true",
    sort: (Array.isArray(params.sort) ? params.sort[0] : params.sort ?? "recommended") as HomeFilters["sort"],
  }));

  useEffect(() => {
    let active = true;
    setGeoLoading(true);
    Promise.all([listActiveGeoStates(), loadGuestGeoPreference()])
      .then(async ([states, stored]) => {
        if (!active) return;
        setGeoStates(states);
        if (!stored) return;
        const validated = await validateGeoSelection(stored);
        if (!active) return;
        if (validated) {
          setGeoSelection({ stateId: validated.stateId, districtId: validated.districtId, talukaId: validated.talukaId });
          setGeoTalukaName(validated.talukaName);
        } else {
          await clearGuestGeoPreference();
        }
      })
      .catch(() => { if (active) setGeoError("Location options could not be loaded. Try again."); })
      .finally(() => { if (active) setGeoLoading(false); });
    return () => { active = false; };
  }, []);

  const allCategoryNames = useMemo(() => {
    const names = searchCategories.flatMap((category) => databaseCategoryCandidates(category.name));
    return [...new Set(names)];
  }, [searchCategories]);

  useEffect(() => {
    if (!geoSelection?.talukaId || !allCategoryNames.length) {
      setGeoResults([]);
      setGeoTierByVendor({});
      return;
    }
    let active = true;
    setGeoLoading(true);
    setGeoError("");
    const categoryNames = filters.category ? databaseCategoryCandidates(filters.category) : allCategoryNames;
    fetchTalukaVendorPageCards({
      categoryNames,
      talukaId: geoSelection.talukaId,
      search: query || undefined,
      minRating: filters.minimumRating || undefined,
      maxPrice: filters.maximumBudget || undefined,
      sort: filters.sort === "recommended" ? "popular" : filters.sort,
      limit: 200,
    })
      .then((page) => {
        if (!active) return;
        setGeoResults(page.cards.map((card) => card.vendor));
        setGeoTierByVendor(Object.fromEntries(
          page.cards.map((card) => [card.vendor.id, card.tier]),
        ));
      })
      .catch(() => { if (active) setGeoError("Vendors for this location could not be loaded. Try another location."); })
      .finally(() => { if (active) setGeoLoading(false); });
    return () => { active = false; };
  }, [allCategoryNames, filters.category, filters.maximumBudget, filters.minimumRating, filters.sort, geoSelection, query]);

  const selectGeoLocation = useCallback((selection: GeoSelection, _districtName: string, talukaName: string) => {
    setGeoSelection(selection);
    setGeoTalukaName(talukaName);
    setGeoError("");
    setFilters((current) => ({ ...current, nearbyOnly: false }));
    void saveGuestGeoPreference(selection);
    void saveLocationDisplayLabel(talukaName);
  }, []);

  const clearGeoLocation = useCallback(() => {
    setGeoSelection(null);
    setGeoTalukaName("");
    setGeoError("");
    void clearGuestGeoPreference();
  }, []);

  const loadDistances = useCallback(async (requestAccess: boolean) => {
    setLocationLoading(true);
    try {
      let coordinates = await getLastDetectedCoordinates();
      if (!coordinates) {
        let permission = await getDevicePermissionStatus();
        if (permission !== "granted" && requestAccess) permission = await requestDeviceLocationPermission();
        if (permission !== "granted") {
          if (requestAccess) Alert.alert("Location permission needed", "Allow location access to sort vendors nearest to you.");
          return false;
        }
        if (requestAccess && !(await requestDeviceLocationServices())) return false;
        coordinates = await getCurrentDeviceLocation().catch(() => null);
      }
      if (!coordinates) return false;
      const ranked = await fetchLocationRankedVendors({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        categoryDisplayName: filters.category || undefined,
        search: query || undefined,
        sort: "popular",
        limit: 200,
      });
      setDistanceByVendor(Object.fromEntries(ranked.cards.map((card) => [card.vendor.id, card.distanceKm])));
      return true;
    } catch {
      if (requestAccess) Alert.alert("Location unavailable", "Turn on device location and try Near Me again.");
      return false;
    } finally {
      setLocationLoading(false);
    }
  }, [filters.category, query]);

  const useCurrentLocation = useCallback(async () => {
    let permission = await getDevicePermissionStatus();
    if (permission !== "granted") permission = await requestDeviceLocationPermission();
    if (permission !== "granted") throw new Error("Location permission was not granted.");
    if (!(await requestDeviceLocationServices())) throw new Error("Location services remain off.");
    const coordinates = await getCurrentDeviceLocation();
    const label = await reverseGeocodeLabel(coordinates).catch(() => null);
    setGeoSelection(null);
    setGeoTalukaName("");
    setGeoError("");
    await clearGuestGeoPreference();
    if (label) await saveLocationDisplayLabel(label);
    setFilters((current) => ({ ...current, nearbyOnly: true }));
    await loadDistances(true);
  }, [loadDistances]);

  useEffect(() => {
    void loadDistances(false);
  }, [loadDistances]);

  const results = useMemo(() => {
    const sourceVendors = featuredOnly ? vendors : geoSelection ? geoResults : vendors;
    const ratedVendors = sourceVendors.map((vendor) => {
      const current = getRating(vendor.id, vendor.rating, vendor.reviews);
      return {
        ...vendor,
        rating: current.rating,
        reviews: current.reviews,
        distanceKm: distanceByVendor[vendor.id] ?? null,
      };
    });
    const filtered = ratedVendors.filter((vendor) => {
      const searchable = [
        vendor.name,
        vendor.category,
        vendor.location,
        vendor.tags.join(" "),
        vendor.services.join(" "),
        vendor.description,
      ].join(" ");
      return matchesKeyword(searchable, query)
        && (!featuredOnly || featuredVendorIds.includes(vendor.id))
        && (!filters.category || vendor.category === filters.category)
        && (!filters.minimumRating || vendor.rating >= filters.minimumRating)
        && (!filters.maximumBudget || (
          vendor.startingPriceValue > 0
          && vendor.startingPriceValue <= filters.maximumBudget
        ))
        && (!filters.nearbyOnly || typeof vendor.distanceKm === "number");
    });

    const baseSorted = [...filtered].sort((a, b) => {
      if (featuredOnly && filters.sort === "rating") {
        return b.rating - a.rating
          || vendorMembershipPriority(b.membershipPlan) - vendorMembershipPriority(a.membershipPlan)
          || b.reviews - a.reviews;
      }
      if (featuredOnly && filters.sort === "price") {
        return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
          - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
      }
      if (featuredOnly) return featuredVendorIds.indexOf(a.id) - featuredVendorIds.indexOf(b.id);
      if (filters.nearbyOnly) {
        return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      }
      if (filters.sort === "rating") {
        const locationTierDifference = geoSelection
          ? (geoTierByVendor[a.id] ?? Number.MAX_SAFE_INTEGER)
            - (geoTierByVendor[b.id] ?? Number.MAX_SAFE_INTEGER)
          : 0;
        return locationTierDifference
          || b.rating - a.rating
          || vendorMembershipPriority(b.membershipPlan) - vendorMembershipPriority(a.membershipPlan)
          || b.reviews - a.reviews;
      }
      if (filters.sort === "price") {
        return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
          - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
      }
      return b.rating - a.rating || b.reviews - a.reviews;
    });
    if (!featuredOnly && filters.sort === "recommended" && !filters.nearbyOnly) {
      return rankVendorsByLocationAndMembership(baseSorted, preference);
    }
    if (!featuredOnly && filters.sort === "rating" && !geoSelection) {
      return rankTopRatedVendorsByLocation(baseSorted, preference);
    }
    return baseSorted;
  }, [distanceByVendor, featuredOnly, featuredVendorIds, filters, geoResults, geoSelection, geoTierByVendor, getRating, preference, query, vendors]);

  const pageResults = useMemo(() => {
    if (!query.trim()) return { fixedPages: [], categoryPages: [] };
    const fixedPages = GLOBAL_PAGES.filter((page) => matchesKeyword(`${page.label} ${page.detail} ${page.keywords}`, query));
    const categoryPages = searchCategories
      .filter((category) => matchesKeyword(`${category.name} ${category.description} wedding vendors services`, query))
      .slice(0, 5)
      .map((category) => ({
        label: category.name,
        detail: `Browse ${category.name.toLowerCase()}`,
        category: category.name,
      }));
    return { fixedPages, categoryPages };
  }, [query, searchCategories]);

  const activeFilterCount = [filters.minimumRating > 0, filters.maximumBudget > 0, Boolean(filters.category), filters.nearbyOnly, filters.sort !== "recommended"].filter(Boolean).length;
  const locationLabel = geoTalukaName || customerLocation || "Choose location";
  const wideLayout = isPublicWideLayout(width, height) || width >= 900;
  const compact = !wideLayout && width < 700;
  const horizontalInset = wideLayout ? (Platform.OS === "web" ? discoveryLayout.webPageGutter : 24) : width < 380 ? 14 : width < 600 ? 16 : 24;
  const contentWidth = Math.min(width - horizontalInset * 2, discoveryLayout.webContentMaxWidth);
  const gridColumns = wideLayout ? discoveryLayout.webGridColumns : discoveryLayout.mobileGridColumns;
  const gridCardWidth = Math.floor((contentWidth - discoveryLayout.gridGap * (gridColumns - 1)) / gridColumns);
  const listingTitle = featuredOnly
    ? "Featured Near You"
    : filters.sort === "rating" && !query.trim()
      ? "Top Rated Vendors"
      : "Find Vendors";
  const sortLabel = featuredOnly && filters.sort === "recommended"
    ? "Featured"
    : filters.sort === "rating"
      ? "Highest rated"
      : filters.sort === "price"
        ? "Lowest price"
        : "Recommended";
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      {vendorsLoading || featuredVendorsLoading || (!featuredOnly && Boolean(geoSelection) && geoLoading) ? <PageLoader /> : null}
      <PublicWebNavbar
        activeRoute={undefined}
        locationControl={(
          <TalukaLocationSelector
            states={geoStates}
            value={geoSelection}
            displayLabel={locationLabel}
            onChange={selectGeoLocation}
            onClear={clearGeoLocation}
            onUseCurrentLocation={useCurrentLocation}
            loading={geoLoading}
            hideLabel
            compact
            variant="navbar"
          />
        )}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: mobileTabBarHeight }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        <View>
          <View style={{ width: contentWidth, alignSelf: "center" }}>
            <CategoryListingHeader dark={isDark} category={listingTitle} />
          </View>
        </View>
        <View style={[styles.stickySearch, { backgroundColor: isDark ? "#070B14" : "#FFFBFD" }]}>
          <View style={{ width: contentWidth, alignSelf: "center" }}>
            <CategorySearchBar
              dark={isDark}
              query={draftQuery}
              activeFilterCount={activeFilterCount}
              accessibilityLabel="Search vendors, categories and services"
              placeholder="Search vendors, categories, services…"
              onChangeQuery={(value) => {
                setDraftQuery(value);
                setQuery(value.trim());
              }}
              onOpenFilters={() => setFiltersVisible(true)}
            />
            <View style={styles.filterStrip}>
              <View style={styles.refinementControls}>
                <TalukaLocationSelector
                  states={geoStates}
                  value={geoSelection}
                  displayLabel={locationLabel}
                  onChange={selectGeoLocation}
                  onUseCurrentLocation={useCurrentLocation}
                  loading={geoLoading}
                  hideLabel
                  compact
                  compactWidth={compact ? 116 : 190}
                />
                <View style={[styles.layoutSegment, { backgroundColor: isDark ? "#211E20" : "#FFFFFF", borderColor: isDark ? "#44333B" : "#F0D4DF" }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${gridColumns} by ${gridColumns} grid view`}
                    accessibilityState={{ selected: listingLayout === "grid" }}
                    onPress={() => setListingLayout("grid")}
                    style={({ pressed }) => [styles.layoutSegmentButton, listingLayout === "grid" && styles.layoutSegmentButtonActive, pressed && styles.controlPressed]}
                  >
                    <PanelsTopLeft size={17} color={listingLayout === "grid" ? "#D91B5C" : isDark ? "#B7AAB0" : "#786D73"} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Use list view"
                    accessibilityState={{ selected: listingLayout === "strip" }}
                    onPress={() => setListingLayout("strip")}
                    style={({ pressed }) => [styles.layoutSegmentButton, listingLayout === "strip" && styles.layoutSegmentButtonActive, pressed && styles.controlPressed]}
                  >
                    <Rows3 size={17} color={listingLayout === "strip" ? "#D91B5C" : isDark ? "#B7AAB0" : "#786D73"} strokeWidth={2} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose sorting, currently ${sortLabel}`}
                  onPress={() => setFiltersVisible(true)}
                  style={({ pressed, hovered, focused }) => [
                    styles.sortControl,
                    { backgroundColor: isDark ? "#2A2025" : "#FFF4F8", borderColor: isDark ? "#44333B" : "#F0D4DF" },
                    (hovered || focused) && styles.controlInteractive,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <ArrowUpDown size={15} color="#D91B5C" strokeWidth={2.2} />
                  <Text numberOfLines={1} style={styles.sortControlText}>{sortLabel}</Text>
                  <ChevronDown size={14} color="#D91B5C" strokeWidth={2.2} />
                </Pressable>
              </View>
              {geoError ? <Text accessibilityRole="alert" style={styles.locationError}>{geoError}</Text> : null}
            </View>
          </View>
        </View>
        <View style={[styles.results, { width: contentWidth }]}>
          <ResultsSummary count={results.length} category="Vendors" sortLabel={sortLabel} dark={isDark} onSort={() => setFiltersVisible(true)} showSort={false} />

        {pageResults.fixedPages.length || pageResults.categoryPages.length ? (
          <View className="bg-card border border-border rounded-2xl p-2">
            <Text className="text-foreground text-sm font-bold px-2 pt-1 pb-2">Pages & categories</Text>
            {pageResults.fixedPages.map((page) => (
              <TouchableOpacity key={page.label} onPress={() => router.push(page.route)} className="min-h-[52px] px-2 flex-row items-center border-t border-border">
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{page.label}</Text>
                  <Text className="text-muted-foreground text-2xs mt-0.5">{page.detail}</Text>
                </View>
                <ChevronRight size={16} className="text-primary" />
              </TouchableOpacity>
            ))}
            {pageResults.categoryPages.map((page) => (
              <TouchableOpacity key={page.category} onPress={() => router.push(buildVendorListingPath(page.category) as Href)} className="min-h-[52px] px-2 flex-row items-center border-t border-border">
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{page.label}</Text>
                  <Text className="text-muted-foreground text-2xs mt-0.5">{page.detail}</Text>
                </View>
                <ChevronRight size={16} className="text-primary" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={listingLayout === "grid" ? styles.gridResults : styles.stripResults}>
          {results.map((vendor) => (
            <View key={`${vendor.category}-${vendor.id}`} style={listingLayout === "grid" ? { width: gridCardWidth } : styles.stripCard}>
              <VendorListingCard
                vendor={vendor}
                dark={isDark}
                compact={compact}
                layout={listingLayout}
                cardWidth={listingLayout === "grid" ? gridCardWidth : undefined}
                favorite={isFavorite(vendor.id)}
                fallbackImage={resolveMarketplaceCategoryImage(vendor.category).fallbackSource}
                onOpen={() => router.push(vendorProfileHref(vendor.slug, "search") as Href)}
                onToggleFavorite={(source) => toggleFavorite(vendor, source)}
              />
            </View>
          ))}
        </View>

        {!results.length ? (
          <View className="min-h-[180px] bg-card border border-border rounded-2xl items-center justify-center px-6">
            <SearchIcon size={26} className="text-primary" />
            <Text className="text-foreground font-bold mt-3">No vendor matches found</Text>
            <Text className="text-muted-foreground text-xs text-center mt-1">Try a broader keyword or reset filters from Home.</Text>
          </View>
        ) : null}
        </View>
      </ScrollView>

      <StandaloneMobileTabBar activeRoute={null} />
      <HomeFilterModal
        visible={filtersVisible}
        dark={isDark}
        value={filters}
        city={customerLocation}
        onClose={() => setFiltersVisible(false)}
        onApply={(next) => {
          setFilters(next);
          setFiltersVisible(false);
          if (next.nearbyOnly) {
            setGeoSelection(null);
            setGeoTalukaName("");
            void clearGuestGeoPreference();
            void loadDistances(true);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  stickySearch: {
    marginTop: discoveryLayout.headerSearchOverlap,
    paddingTop: discoveryLayout.stickySearchPaddingTop,
    paddingBottom: discoveryLayout.stickySearchPaddingBottom,
    zIndex: 10,
  },
  filterStrip: { marginTop: discoveryLayout.controlsGap },
  refinementControls: { flexDirection: "row", alignItems: "center", gap: 7 },
  layoutSegment: { height: 42, width: 74, padding: 2, borderWidth: 1, borderRadius: 13, flexDirection: "row", alignItems: "center" },
  layoutSegmentButton: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  layoutSegmentButtonActive: { backgroundColor: "#FFF0F6", borderWidth: 1, borderColor: "#E91E63" },
  sortControl: { flex: 1, minWidth: 0, height: 42, borderWidth: 1, borderRadius: 21, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  sortControlText: { flexShrink: 1, color: "#D91B5C", fontSize: 12, fontWeight: "700" },
  controlInteractive: { transform: [{ translateY: -1 }], borderColor: "#D91B5C" },
  controlPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  locationError: { color: "#DC2626", fontSize: 12, lineHeight: 16, marginTop: 5 },
  scroll: { flex: 1 },
  results: {
    alignSelf: "center",
    paddingTop: 6,
    paddingHorizontal: 0,
    gap: discoveryLayout.resultsGap,
  },
  stripResults: { gap: discoveryLayout.resultsGap },
  stripCard: { width: "100%" },
  gridResults: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: discoveryLayout.gridGap },
});
