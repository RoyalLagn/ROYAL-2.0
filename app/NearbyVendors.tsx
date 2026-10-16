import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, type ListRenderItemInfo, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { type Href, useRouter } from "expo-router";
import { buildVendorListingPath } from "@/services/publicSeoRoutes";
import { vendorProfileHref } from "@/services/contactActions";
import { Check, ChevronDown, LocateFixed, MapPin, RefreshCw, Search, SearchX, ShieldAlert, SlidersHorizontal, X } from "lucide-react-native";
import HomeReveal from "@/components/home/HomeReveal";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import VendorListingCard from "@/components/listing/VendorListingCard";
import { SkeletonList } from "@/components/loading/Skeleton";
import PageLoader from "@/components/loading/PageLoader";
import Pressable from "@/components/InteropSafePressable";
import { useFavorites } from "@/context/FavoritesContext";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { useCategories } from "@/context/CategoryContext";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import type { PublicVendorListing } from "@/services/publicVendorListings";
import {
  fetchNearbyVendors,
  NEARBY_RADIUS_OPTIONS_KM,
  DEFAULT_NEARBY_RADIUS_KM,
  type NearbyVendorCard,
} from "@/services/vendorDiscovery";
import {
  getDevicePermissionStatus,
  getCurrentDeviceLocation,
  requestDeviceLocationPermission,
  reverseGeocodeLabel,
  hasPreviouslyDeniedLocation,
  DeviceLocationError,
  type DeviceCoordinates,
} from "@/services/deviceLocation";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import { isPublicWideLayout } from "@/utils/responsiveLayout";

const PINK = brandPalette.light.primary;
const VENDOR_CARD_PLACEHOLDER = require("../assets/images/optimized/vendor-placeholder.webp");
const PAGE_SIZE = 20;

type Stage = "checking" | "locating" | "ready" | "denied" | "unavailable";

export default function NearbyVendorsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const desktopWeb = Platform.OS === "web" && width >= 1100;
  const wideLayout = isPublicWideLayout(width, height);
  const compact = !wideLayout;
  const contentWidth = Math.min(width - (wideLayout ? (desktopWeb ? 96 : 48) : 32), 1120);
  const colors = brandColors(isDark);
  const background = colors.background;
  const text = isDark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;

  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { searchCategories } = useCategories();

  const [stage, setStage] = useState<Stage>("checking");
  const [origin, setOrigin] = useState<DeviceCoordinates | null>(null);
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  const [locationError, setLocationError] = useState("");
  const locationRequestId = useRef(0);

  const [category, setCategory] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_NEARBY_RADIUS_KM);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [minimumRating, setMinimumRating] = useState(0);

  const [cards, setCards] = useState<NearbyVendorCard[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");

  // On mount: only look at the *cached* permission status -- never call the
  // OS prompt automatically, and never re-prompt on re-render (P: "Do not
  // repeatedly request permission every time the screen renders").
  useEffect(() => {
    let active = true;
    (async () => {
      const [status, previouslyDenied] = await Promise.all([
        getDevicePermissionStatus(),
        hasPreviouslyDeniedLocation(),
      ]);
      if (!active) return;
      if (status === "granted") {
        void beginLocating();
      } else if (previouslyDenied || status === "denied") {
        setStage("denied");
      } else {
        setStage("checking");
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginLocating = useCallback(async () => {
    const requestId = ++locationRequestId.current;
    setStage("locating");
    setLocationError("");
    setOriginLabel(null);
    try {
      const coords = await getCurrentDeviceLocation();
      if (requestId !== locationRequestId.current) return;
      setOrigin(coords);
      setStage("ready");
      const label = await reverseGeocodeLabel(coords).catch(() => null);
      // A slow reverse-geocode response from an older GPS request must never
      // label a newer origin. Distance and display now share one request ID.
      if (requestId === locationRequestId.current && label) setOriginLabel(label);
    } catch (error) {
      const reason = error instanceof DeviceLocationError ? error.reason : "unknown";
      if (reason === "denied") {
        setStage("denied");
      } else {
        setStage("unavailable");
        setLocationError("We couldn't access your location. You can try again or search by PIN code instead.");
      }
    }
  }, []);

  const requestPermission = useCallback(async () => {
    const status = await requestDeviceLocationPermission();
    if (status === "granted") {
      void beginLocating();
    } else {
      setStage("denied");
    }
  }, [beginLocating]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const openManualSearch = useCallback(() => {
    if (category) {
      router.push(buildVendorListingPath(category) as Href);
      return;
    }
    router.push("/(tabs)/Categories");
  }, [category, router]);

  // Ref-backed fetch lock: onEndReached can fire multiple times before a
  // setResultsLoading(true) state update actually commits, which used to let
  // two calls through with the same `offset` and append the same page of
  // vendors twice -- producing duplicate `vendor.id` keys in the FlatList.
  const fetchInFlight = useRef(false);

  const loadResults = useCallback((reset: boolean, radius: number = radiusKm) => {
    if (!origin || fetchInFlight.current) return;
    fetchInFlight.current = true;
    setResultsLoading(true);
    setResultsError("");
    fetchNearbyVendors({
      latitude: origin.latitude,
      longitude: origin.longitude,
      categoryDisplayName: category ?? undefined,
      search: searchQuery || undefined,
      radiusKm: radius,
      minRating: minimumRating || undefined,
      limit: PAGE_SIZE,
      offset: reset ? 0 : offset,
    })
      .then((result) => {
        setCards((previous) => {
          const merged = reset ? result.cards : [...previous, ...result.cards];
          const seen = new Set<string>();
          // Belt-and-suspenders: drop any vendor id already present so a
          // stray overlapping page can never produce duplicate list keys.
          return merged.filter((card) => {
            if (seen.has(card.vendor.id)) return false;
            seen.add(card.vendor.id);
            return true;
          });
        });
        setHasMore(result.hasMore);
        setOffset(result.nextOffset);
      })
      .catch(() => {
        setResultsError("We couldn't load nearby vendors right now.");
      })
      .finally(() => {
        fetchInFlight.current = false;
        setResultsLoading(false);
      });
  }, [origin, category, searchQuery, minimumRating, offset, radiusKm]);

  useEffect(() => {
    if (stage !== "ready" || !origin) return;
    setCards([]);
    setOffset(0);
    setHasMore(true);
    loadResults(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, origin, category, searchQuery, minimumRating, radiusKm]);

  const loadMore = useCallback(() => {
    if (resultsLoading || !hasMore || fetchInFlight.current) return;
    loadResults(false);
  }, [resultsLoading, hasMore, loadResults]);

  const toggleVendorFavorite = useCallback((vendor: PublicVendorListing, source: FavoriteSourceRef) => {
    toggleFavorite({
      id: vendor.id,
      slug: vendor.slug,
      name: vendor.name,
      category: vendor.category,
      rating: vendor.rating,
      reviews: vendor.reviews,
      priceLevel: vendor.priceLevel,
      startingPrice: vendor.startingPrice,
      location: vendor.location,
      tags: vendor.tags,
      image: vendor.image,
    }, source);
  }, [toggleFavorite]);

  const fallbackImage = useMemo(
    () => (category ? resolveMarketplaceCategoryImage(category).fallbackSource : VENDOR_CARD_PLACEHOLDER),
    [category],
  );

  const renderCard = useCallback(({ item, index }: ListRenderItemInfo<NearbyVendorCard>) => (
    <HomeReveal delay={Math.min(index * 30, 210)}>
      <VendorListingCard
        vendor={item.vendor}
        dark={isDark}
        compact={compact}
        favorite={isFavorite(item.vendor.id)}
        fallbackImage={fallbackImage}
        onOpen={() => router.push(vendorProfileHref(item.vendor.slug, "nearby") as Href)}
        onToggleFavorite={(source) => toggleVendorFavorite(item.vendor, source)}
      />
    </HomeReveal>
  ), [isDark, compact, isFavorite, fallbackImage, router, toggleVendorFavorite]);

  const showLocationPrompt = stage === "checking" || stage === "denied" || stage === "unavailable";
  const android = Platform.OS === "android";
  const showLoadingSkeleton = stage === "locating"
    || (stage === "ready" && resultsLoading && cards.length === 0);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      {showLoadingSkeleton ? <PageLoader /> : null}
      <PublicWebNavbar activeRoute="NearMe" />
      <FlatList
        data={stage === "ready" ? cards : []}
        keyExtractor={(item) => item.vendor.id}
        renderItem={renderCard}
        extraData={favorites}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.pageList, { width: contentWidth, paddingBottom: desktopWeb ? 40 : 112 }]}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        onEndReachedThreshold={0.4}
        onEndReached={stage === "ready" ? loadMore : undefined}
        ListHeaderComponent={(
      <View style={styles.top}>
        <HomeReveal direction="down">
          <View style={[styles.locationHero, { backgroundColor: background }]}>
            {stage === "ready" && origin ? (
              <View style={[styles.currentLocation, { borderColor: border, backgroundColor: background }]}>
                <View style={styles.heroIcon}><MapPin size={18} color={PINK} /></View>
                <View style={styles.locationTextWrap}>
                  <Text style={[styles.currentLocationLabel, { color: muted }]}>YOUR CURRENT LOCATION</Text>
                  <Text style={[styles.currentLocationText, { color: text }]} numberOfLines={2}>{originLabel ?? `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}`}</Text>
                </View>
              </View>
            ) : null}

            {showLocationPrompt ? (
              <View style={[styles.permissionPanel, wideLayout && styles.permissionPanelDesktop, { backgroundColor: background, borderColor: border }]}>
                <View style={styles.permissionHeading}>
                  <View style={styles.fallbackIcon}><ShieldAlert size={18} color={colors.primaryStrong} /></View>
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={android ? 1.3 : undefined} style={[styles.fallbackTitle, android && styles.fallbackTitleAndroid, { color: text }]}>
                      {stage === "checking"
                        ? "Use your current location"
                        : stage === "denied"
                          ? "Location permission is off"
                          : "Location is unavailable"}
                    </Text>
                    <Text maxFontSizeMultiplier={android ? 1.3 : undefined} style={[styles.fallbackText, android && styles.fallbackTextAndroid, { color: muted }]}>
                      {locationError || "Allow GPS to see accurate distance. RoyalLagn requests it only when you choose this option."}
                    </Text>
                  </View>
                </View>
                <View style={[styles.permissionActions, wideLayout && styles.permissionActionsDesktop]}>
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(255,255,255,0.18)" }}
                    onPress={requestPermission}
                    style={styles.primaryAction}
                  >
                    <LocateFixed size={16} color="#FFFFFF" />
                    <Text maxFontSizeMultiplier={android ? 1.3 : undefined} style={[styles.primaryActionText, android && styles.primaryActionTextAndroid]}>{stage === "checking" ? "Use my location" : "Try GPS again"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: "rgba(233,30,99,0.08)" }}
                    onPress={openManualSearch}
                    style={[styles.secondaryAction, { borderColor: border }]}
                  >
                    <MapPin size={15} color={colors.primaryStrong} />
                    <Text maxFontSizeMultiplier={android ? 1.3 : undefined} style={[styles.secondaryActionText, android && styles.secondaryActionTextAndroid, { color: colors.primaryStrong }]}>Choose District & Taluka</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </HomeReveal>

        {stage === "ready" ? (
          <View style={[styles.filterPanel, { borderColor: border, backgroundColor: colors.card }]}>
            <View style={styles.filterHeader}>
              <Text style={[styles.resultsSummary, { color: text }]}>
                {resultsLoading && cards.length === 0 ? "Searching…" : `${cards.length} within ${radiusKm} km`}
              </Text>
            </View>
            <View style={[styles.filterBody, wideLayout && styles.filterBodyDesktop]}>
              <View style={[styles.searchBox, wideLayout && styles.searchBoxDesktop, { borderColor: border, backgroundColor: background }]}>
                <Search size={17} color={muted} />
                <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Search vendors or services" placeholderTextColor={muted} accessibilityLabel="Search nearby vendors or services" style={[styles.searchInput, { color: text }]} />
              </View>
              <View style={styles.selectorRow}>
              <View style={[styles.selectorVisual, { borderColor: border, backgroundColor: background }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose vendor category" android_ripple={{ color: "rgba(233,30,99,0.08)" }} onPress={() => setCategoryPickerOpen(true)} style={styles.selectorHitArea}>
                <View style={styles.filterSelectCopy}>
                  <Text style={[styles.filterSelectLabel, { color: muted }]}>Category</Text>
                  <Text style={[styles.categorySelectText, { color: text }]} numberOfLines={1}>{category ?? "All categories"}</Text>
                </View>
                <ChevronDown size={18} color={muted} />
              </Pressable>
              </View>
              <View style={[styles.selectorVisual, { borderColor: border, backgroundColor: background }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open rating and radius filters" android_ripple={{ color: "rgba(233,30,99,0.08)" }} onPress={() => setFilterPickerOpen(true)} style={styles.selectorHitArea}>
                <SlidersHorizontal size={17} color={PINK} />
                <View style={styles.filterSelectCopy}>
                  <Text style={[styles.filterSelectLabel, { color: muted }]}>Filters</Text>
                  <Text style={[styles.categorySelectText, { color: text }]} numberOfLines={1}>{minimumRating ? `${minimumRating}+ ★` : "Any rating"} · {radiusKm} km</Text>
                </View>
                <ChevronDown size={18} color={muted} />
              </Pressable>
              </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>
        )}
        ListFooterComponent={resultsLoading && cards.length > 0 ? (
          <SkeletonList count={1} height={compact ? 172 : 220} gap={14} />
        ) : null}
        ListEmptyComponent={showLoadingSkeleton ? (
          <SkeletonList count={compact ? 3 : 4} height={compact ? 172 : 220} gap={14} />
        ) : stage === "ready" && resultsError ? (
            <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                <RefreshCw size={22} color={colors.primaryStrong} />
              </View>
              <Text style={[styles.emptyTitle, { color: text }]}>Vendors are taking a moment</Text>
              <Text style={[styles.emptyText, { color: muted }]}>{resultsError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => loadResults(true)}
                style={({ pressed }) => [styles.emptyAction, pressed && styles.actionPressed]}
              >
                <Text style={styles.emptyActionText}>Try again</Text>
              </Pressable>
            </View>
          ) : stage === "ready" ? (
            <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                <SearchX size={24} color={colors.primaryStrong} />
              </View>
              <Text style={[styles.emptyTitle, { color: text }]}>
                No {category ? category.toLowerCase() : "vendors"} found within {radiusKm} km
              </Text>
              <Text style={[styles.emptyText, { color: muted }]}>Try expanding your search radius.</Text>
              <View style={styles.expandRow}>
                {NEARBY_RADIUS_OPTIONS_KM.filter((option) => option > radiusKm).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    onPress={() => setRadiusKm(option)}
                    style={({ pressed }) => [styles.emptyAction, pressed && styles.actionPressed]}
                  >
                    <Text style={styles.emptyActionText}>{option} km</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
      />

      <Modal visible={filterPickerOpen} transparent animationType="fade" onRequestClose={() => setFilterPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterPickerOpen(false)}>
          <Pressable style={[styles.categoryMenu, { backgroundColor: colors.card }]} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.categoryMenuHeader, { borderBottomColor: border }]}>
              <View style={styles.flex}><Text style={[styles.categoryMenuTitle, { color: text }]}>Filters</Text><Text style={[styles.categoryMenuSubtitle, { color: muted }]}>Minimum rating and distance</Text></View>
              <Pressable accessibilityLabel="Close filters" onPress={() => setFilterPickerOpen(false)} style={styles.modalClose}><X size={19} color={text} /></Pressable>
            </View>
            <ScrollView style={styles.categoryMenuScroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalSectionLabel, { color: muted }]}>MINIMUM RATING</Text>
              <View style={styles.modalChipRow}>{[0, 3, 4, 4.5].map((option) => { const active = option === minimumRating; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setMinimumRating(option)} style={({ pressed }) => [styles.modalChip, { borderColor: active ? PINK : border, backgroundColor: active ? PINK : background }, pressed && styles.actionPressed]}><Text style={[styles.chipText, { color: active ? "#FFFFFF" : text }]}>{option === 0 ? "Any rating" : `${option}+ ★`}</Text></Pressable>; })}</View>
              <Text style={[styles.modalSectionLabel, styles.modalSectionDivider, { color: muted, borderTopColor: border }]}>SEARCH RADIUS</Text>
              <View style={styles.modalChipRow}>{NEARBY_RADIUS_OPTIONS_KM.map((option) => { const active = option === radiusKm; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setRadiusKm(option)} style={({ pressed }) => [styles.modalChip, { borderColor: active ? PINK : border, backgroundColor: active ? PINK : background }, pressed && styles.actionPressed]}><Text style={[styles.chipText, { color: active ? "#FFFFFF" : text }]}>{option} km</Text></Pressable>; })}</View>
              <Pressable onPress={() => setFilterPickerOpen(false)} style={({ pressed }) => [styles.doneButton, pressed && styles.actionPressed]}><Text style={styles.doneButtonText}>Show results</Text></Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryPickerOpen(false)}>
          <Pressable style={[styles.categoryMenu, { backgroundColor: colors.card }]} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.categoryMenuHeader, { borderBottomColor: border }]}>
              <View style={styles.flex}><Text style={[styles.categoryMenuTitle, { color: text }]}>Choose category</Text><Text style={[styles.categoryMenuSubtitle, { color: muted }]}>All vendor categories</Text></View>
              <Pressable accessibilityLabel="Close category dropdown" onPress={() => setCategoryPickerOpen(false)} style={styles.modalClose}><X size={19} color={text} /></Pressable>
            </View>
            <ScrollView style={styles.categoryMenuScroll} keyboardShouldPersistTaps="handled">
              {[{ id: "all", name: "All categories" }, ...searchCategories].map((item) => {
                const active = item.id === "all" ? category === null : category === item.name;
                return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { setCategory(item.id === "all" ? null : item.name); setCategoryPickerOpen(false); }} style={({ pressed }) => [styles.categoryOption, active && styles.categoryOptionActive, pressed && styles.actionPressed]}><Text style={[styles.categoryOptionText, { color: active ? PINK : text }]}>{item.name}</Text>{active ? <Check size={18} color={PINK} /> : null}</Pressable>;
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {!desktopWeb ? <StandaloneMobileTabBar activeRoute="index" /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  top: { width: "100%", paddingTop: 16, paddingBottom: 10 },
  locationHero: { width: "100%" },
  heroIcon: { width: 38, height: 38, flexShrink: 0, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0F5" },
  currentLocation: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  locationTextWrap: { flex: 1, minWidth: 0 },
  currentLocationText: { marginTop: 2, fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact },
  currentLocationLabel: { fontFamily: fonts.sans.semibold, fontSize: 9, lineHeight: 12, letterSpacing: 0.55 },
  permissionPanel: { borderWidth: 1, borderRadius: 16, padding: 16, justifyContent: "center" },
  permissionPanelDesktop: { width: "100%", maxWidth: 680, alignSelf: "center", padding: 22 },
  permissionHeading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  fallbackIcon: { width: 38, height: 38, flexShrink: 0, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0F5" },
  fallbackTitle: { fontFamily: fonts.sans.bold, fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle },
  fallbackTitleAndroid: { includeFontPadding: false },
  fallbackText: { maxWidth: 410, marginTop: 5, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab },
  fallbackTextAndroid: { includeFontPadding: false },
  permissionActions: { marginTop: 16, gap: 9 },
  permissionActionsDesktop: { flexDirection: "row", alignItems: "center" },
  primaryAction: { minHeight: 48, overflow: "hidden", paddingHorizontal: 18, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: PINK },
  primaryActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  primaryActionTextAndroid: { includeFontPadding: false },
  secondaryAction: { minHeight: 48, overflow: "hidden", paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryActionText: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  secondaryActionTextAndroid: { includeFontPadding: false },
  filterPanel: { marginTop: 16, overflow: "hidden", borderWidth: 1, borderRadius: 18, padding: 16 },
  filterHeader: { flexDirection: "row", justifyContent: "flex-end" },
  filterBody: { gap: 14 },
  filterBodyDesktop: { flexDirection: "row", alignItems: "flex-end", gap: 18 },
  searchBox: { minHeight: 48, marginTop: 14, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  searchBoxDesktop: { flex: 1, minWidth: 250, marginBottom: 1 },
  searchInput: { flex: 1, minHeight: 44, fontFamily: fonts.sans.medium, fontSize: typeScale.bodyCompact, outlineStyle: "none" } as never,
  compactFilters: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 18 },
  filterGroup: { minWidth: 190 },
  sectionLabel: { marginTop: 12, marginBottom: 7, fontFamily: fonts.sans.semibold, fontSize: typeScale.caption },
  sectionLabelInline: { marginBottom: 8, fontFamily: fonts.sans.semibold, fontSize: typeScale.caption },
  categoryBlock: { marginTop: 15, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(120,113,120,0.24)" },
  selectorRow: { flex: 1, minWidth: 0, flexDirection: "row", gap: 10, marginTop: 14 },
  selectorVisual: { flex: 1, minWidth: 0, height: 46, overflow: "hidden", borderWidth: 1, borderRadius: 14 },
  selectorHitArea: { flex: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  filterSelectCopy: { flex: 1, minWidth: 0 },
  filterSelectLabel: { fontFamily: fonts.sans.semibold, fontSize: 9, lineHeight: 12, letterSpacing: 0.45 },
  categorySelectText: { flex: 1, minWidth: 0, fontFamily: fonts.sans.semibold, fontSize: typeScale.bodyCompact },
  chipsRowStatic: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  radiusChip: { minHeight: 36, minWidth: 58, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  ratingChip: { minHeight: 36, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  resultsSummary: { flexShrink: 0, minHeight: 30, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, overflow: "hidden", backgroundColor: "#FFF0F5", color: "#BE185D", fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
  actionPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  scroll: { flex: 1 },
  pageList: { alignSelf: "center", gap: 14 },
  empty: { alignSelf: "center", minHeight: 210, marginTop: 4, borderWidth: 1, borderRadius: 18, paddingHorizontal: 24, paddingVertical: 24, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 14, fontFamily: fonts.sans.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  emptyText: { maxWidth: 380, marginTop: 7, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  emptyAction: { minHeight: 48, marginTop: 12, paddingHorizontal: 18, borderRadius: 14, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  emptyActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  expandRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBackdrop: { flex: 1, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,25,28,0.48)" },
  categoryMenu: { width: "100%", maxWidth: 480, maxHeight: "78%", overflow: "hidden", borderRadius: 18 },
  categoryMenuHeader: { minHeight: 70, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryMenuTitle: { fontFamily: fonts.sans.bold, fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle },
  categoryMenuSubtitle: { marginTop: 2, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata },
  modalClose: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  categoryMenuScroll: { paddingHorizontal: 8, paddingVertical: 8 },
  categoryOption: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  categoryOptionActive: { backgroundColor: "#FFF0F5" },
  categoryOptionText: { flex: 1, fontFamily: fonts.sans.semibold, fontSize: typeScale.bodyCompact },
  modalSectionLabel: { marginTop: 10, marginBottom: 7, paddingHorizontal: 8, fontFamily: fonts.sans.bold, fontSize: 9, lineHeight: 13, letterSpacing: 0.65 },
  modalSectionDivider: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  modalChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 8 },
  modalChip: { minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  doneButton: { minHeight: 48, marginHorizontal: 8, marginTop: 20, marginBottom: 14, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
  doneButtonText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
});
