import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, type ListRenderItemInfo, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import { LocateFixed, MapPin, RefreshCw, SearchX, ShieldAlert } from "lucide-react-native";
import HomeReveal from "@/components/home/HomeReveal";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import VendorListingCard from "@/components/listing/VendorListingCard";
import { SkeletonList } from "@/components/loading/Skeleton";
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
import { lookupIndianPincode, PincodeLookupUnavailableError } from "@/services/locations";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

const PINK = "#E91E63";
const VENDOR_CARD_PLACEHOLDER = require("../assets/images/optimized/vendor-placeholder.webp");
const PAGE_SIZE = 20;

type Stage = "checking" | "locating" | "ready" | "denied" | "unavailable";

export default function NearbyVendorsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 1100;
  const desktop = width >= 1100;
  const contentWidth = Math.min(width - (width >= 1100 ? 96 : 32), 1120);
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

  const [pincodeInput, setPincodeInput] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState("");

  const [category, setCategory] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_NEARBY_RADIUS_KM);

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
    setStage("locating");
    setLocationError("");
    try {
      const coords = await getCurrentDeviceLocation();
      setOrigin(coords);
      setStage("ready");
      reverseGeocodeLabel(coords).then((label) => { if (label) setOriginLabel(label); }).catch(() => {});
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

  const submitPincode = useCallback(async () => {
    const trimmed = pincodeInput.trim();
    if (!/^[1-9][0-9]{5}$/.test(trimmed)) {
      setPincodeError("Enter a valid six-digit PIN code.");
      return;
    }
    setPincodeLoading(true);
    setPincodeError("");
    try {
      const result = await lookupIndianPincode(trimmed);
      const localities = result.geo?.localities ?? [];
      const withCoords = localities.find((locality) => locality.latitude != null && locality.longitude != null);
      if (!withCoords || withCoords.latitude == null || withCoords.longitude == null) {
        setPincodeError("We don't have coordinates for this PIN code yet. Try a nearby PIN.");
        return;
      }
      setOrigin({ latitude: withCoords.latitude, longitude: withCoords.longitude });
      const label = [withCoords.taluka?.name ?? withCoords.name, withCoords.district?.name].filter(Boolean).join(", ");
      setOriginLabel(label || null);
      setStage("ready");
    } catch (error) {
      setPincodeError(
        error instanceof PincodeLookupUnavailableError
          ? "PIN-code lookup is temporarily unavailable. Please try again shortly."
          : "We couldn't resolve that PIN code. Please check it and try again.",
      );
    } finally {
      setPincodeLoading(false);
    }
  }, [pincodeInput]);

  const loadResults = useCallback((reset: boolean, radius: number = radiusKm) => {
    if (!origin) return;
    setResultsLoading(true);
    setResultsError("");
    fetchNearbyVendors({
      latitude: origin.latitude,
      longitude: origin.longitude,
      categoryDisplayName: category ?? undefined,
      radiusKm: radius,
      limit: PAGE_SIZE,
      offset: reset ? 0 : offset,
    })
      .then((result) => {
        setCards((previous) => (reset ? result.cards : [...previous, ...result.cards]));
        setHasMore(result.hasMore);
        setOffset(result.nextOffset);
      })
      .catch(() => {
        setResultsError("We couldn't load nearby vendors right now.");
      })
      .finally(() => setResultsLoading(false));
  }, [origin, category, offset, radiusKm]);

  useEffect(() => {
    if (stage !== "ready" || !origin) return;
    setCards([]);
    setOffset(0);
    setHasMore(true);
    loadResults(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, origin, category, radiusKm]);

  const loadMore = useCallback(() => {
    if (resultsLoading || !hasMore) return;
    loadResults(false);
  }, [resultsLoading, hasMore, loadResults]);

  const toggleVendorFavorite = useCallback((vendor: PublicVendorListing, source: FavoriteSourceRef) => {
    toggleFavorite({
      id: vendor.id,
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
        onOpen={() => router.push({ pathname: "/VendorsProfile", params: { vendorId: item.vendor.id, category: item.vendor.category } })}
        onToggleFavorite={(source) => toggleVendorFavorite(item.vendor, source)}
      />
    </HomeReveal>
  ), [isDark, compact, isFavorite, fallbackImage, router, toggleVendorFavorite]);

  const showPinFallback = stage === "denied" || stage === "unavailable";
  const showLoadingSkeleton = stage === "checking" || stage === "locating"
    || (stage === "ready" && resultsLoading && cards.length === 0);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      <PublicWebNavbar activeRoute="Home" />
      <View style={[styles.top, { width: contentWidth }]}>
        <HomeReveal direction="down">
          <View style={styles.headerRow}>
            <MapPin size={18} color={PINK} />
            <Text style={[styles.title, { color: text }]}>
              {stage === "ready" ? `Near ${originLabel ?? "you"}` : "Near Me"}
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: muted }]}>
            Wedding vendors sorted by distance from your current location
          </Text>
        </HomeReveal>

        {showPinFallback ? (
          <HomeReveal delay={20}>
            <View style={[styles.fallbackCard, { borderColor: border, backgroundColor: colors.card }]}>
              <View style={[styles.fallbackIcon, { backgroundColor: colors.muted }]}>
                <ShieldAlert size={20} color={colors.primaryStrong} />
              </View>
              <Text style={[styles.fallbackTitle, { color: text }]}>
                {stage === "denied"
                  ? "Location permission is required for nearby vendors."
                  : "We couldn't access your location."}
              </Text>
              {locationError ? <Text style={[styles.fallbackText, { color: muted }]}>{locationError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                onPress={requestPermission}
                style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
              >
                <LocateFixed size={16} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Allow Location</Text>
              </Pressable>
              <Text style={[styles.orText, { color: muted }]}>or enter your PIN code</Text>
              <View style={styles.pinRow}>
                <TextInput
                  value={pincodeInput}
                  onChangeText={(value) => { setPincodeInput(value.replace(/[^0-9]/g, "").slice(0, 6)); setPincodeError(""); }}
                  placeholder="411057"
                  placeholderTextColor={muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.pinInput, { color: text, borderColor: border, backgroundColor: background }]}
                  accessibilityLabel="PIN code"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={pincodeLoading}
                  onPress={submitPincode}
                  style={({ pressed }) => [styles.secondaryAction, { borderColor: colors.primaryStrong }, pressed && styles.actionPressed]}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.primaryStrong }]}>
                    {pincodeLoading ? "Finding…" : "Find Vendors"}
                  </Text>
                </Pressable>
              </View>
              {pincodeError ? <Text style={styles.errorText}>{pincodeError}</Text> : null}
            </View>
          </HomeReveal>
        ) : null}

        {stage === "ready" ? (
          <>
            <HomeReveal delay={35}>
              <Text style={[styles.sectionLabel, { color: muted }]}>What are you looking for?</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[{ id: "all", name: "All categories" }, ...searchCategories]}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.chipsRow}
                renderItem={({ item }) => {
                  const active = item.id === "all" ? category === null : category === item.name;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCategory(item.id === "all" ? null : item.name)}
                      style={[
                        styles.chip,
                        { borderColor: active ? PINK : border, backgroundColor: active ? PINK : colors.card },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : text }]}>{item.name}</Text>
                    </Pressable>
                  );
                }}
              />
            </HomeReveal>

            <HomeReveal delay={55}>
              <Text style={[styles.sectionLabel, { color: muted }]}>Within</Text>
              <View style={styles.chipsRowStatic}>
                {NEARBY_RADIUS_OPTIONS_KM.map((option) => {
                  const active = option === radiusKm;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      onPress={() => setRadiusKm(option)}
                      style={[
                        styles.radiusChip,
                        { borderColor: active ? PINK : border, backgroundColor: active ? PINK : colors.card },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : text }]}>{option} km</Text>
                    </Pressable>
                  );
                })}
              </View>
            </HomeReveal>

            <HomeReveal delay={75}>
              <Text style={[styles.resultsSummary, { color: muted }]}>
                {resultsLoading && cards.length === 0
                  ? "Searching…"
                  : `${cards.length} vendor${cards.length === 1 ? "" : "s"} found within ${radiusKm} km`}
              </Text>
            </HomeReveal>
          </>
        ) : null}
      </View>

      {stage === "ready" ? (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.vendor.id}
          renderItem={renderCard}
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
          onEndReached={loadMore}
          ListFooterComponent={resultsLoading && cards.length > 0 ? (
            <SkeletonList count={1} height={compact ? 172 : 220} gap={14} />
          ) : null}
          ListEmptyComponent={showLoadingSkeleton ? (
            <SkeletonList count={compact ? 3 : 4} height={compact ? 172 : 220} gap={14} />
          ) : resultsError ? (
            <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card, width: contentWidth }]}>
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
          ) : (
            <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card, width: contentWidth }]}>
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
          )}
        />
      ) : (
        <View style={styles.checkingSpacer}>
          {showLoadingSkeleton ? (
            <SkeletonList count={3} height={compact ? 172 : 220} gap={14} />
          ) : null}
        </View>
      )}

      {!desktop ? <StandaloneMobileTabBar activeRoute="index" /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { alignSelf: "center", paddingBottom: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  subtitle: { marginTop: 4, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  sectionLabel: { marginTop: 16, marginBottom: 8, fontFamily: fonts.sans.semibold, fontSize: typeScale.caption },
  chipsRow: { gap: 8, paddingRight: 8 },
  chipsRowStatic: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.25, alignItems: "center", justifyContent: "center" },
  radiusChip: { minHeight: 38, minWidth: 64, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.25, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  resultsSummary: { marginTop: 14, fontFamily: fonts.sans.medium, fontSize: typeScale.metadata },
  fallbackCard: { marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: "center" },
  fallbackIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  fallbackTitle: { marginTop: 12, fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  fallbackText: { marginTop: 6, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  primaryAction: { minHeight: 46, marginTop: 16, paddingHorizontal: 22, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: PINK },
  primaryActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  orText: { marginTop: 14, fontFamily: fonts.sans.regular, fontSize: typeScale.caption },
  pinRow: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "center", width: "100%", maxWidth: 320 },
  pinInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: fonts.sans.medium, fontSize: typeScale.bodyCompact },
  secondaryAction: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.25, alignItems: "center", justifyContent: "center" },
  secondaryActionText: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  errorText: { marginTop: 8, color: "#D64545", fontFamily: fonts.sans.medium, fontSize: typeScale.caption, textAlign: "center" },
  actionPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  scroll: { flex: 1 },
  list: { alignSelf: "center", gap: 14, paddingTop: 6 },
  checkingSpacer: { flex: 1, alignItems: "center", paddingHorizontal: 16 },
  empty: { alignSelf: "center", minHeight: 220, marginTop: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 24, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 15, fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  emptyText: { maxWidth: 380, marginTop: 7, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  emptyAction: { minHeight: 44, marginTop: 12, paddingHorizontal: 18, borderRadius: 14, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  emptyActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  expandRow: { flexDirection: "row", gap: 10, marginTop: 4 },
});
