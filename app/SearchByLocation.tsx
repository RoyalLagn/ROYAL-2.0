import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, type ListRenderItemInfo, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import { Check, Mail, RefreshCw, SearchX } from "lucide-react-native";
import HomeReveal from "@/components/home/HomeReveal";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import VendorListingCard from "@/components/listing/VendorListingCard";
import { SkeletonList } from "@/components/loading/Skeleton";
import PageLoader from "@/components/loading/PageLoader";
import { useFavorites } from "@/context/FavoritesContext";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { useCategories } from "@/context/CategoryContext";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import type { PublicVendorListing } from "@/services/publicVendorListings";
import { fetchPincodeVendors, type PincodeVendorCard } from "@/services/pincodeVendorDiscovery";
import { lookupIndianPincode, PincodeLookupUnavailableError } from "@/services/locations";
import type { PincodeLocality } from "@/locations/types";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

const PINK = brandPalette.light.primary;
const VENDOR_CARD_PLACEHOLDER = require("../assets/images/optimized/vendor-placeholder.webp");
const PAGE_SIZE = 20;

type Stage = "entering" | "browsing";

export default function SearchByLocationScreen() {
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

  const [stage, setStage] = useState<Stage>("entering");
  const [pincodeInput, setPincodeInput] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState("");

  const [resolvedPincode, setResolvedPincode] = useState<string | null>(null);
  const [localities, setLocalities] = useState<PincodeLocality[]>([]);
  // null = "All Locations" (the default). A non-empty array narrows to
  // specific localities, OR'd together.
  const [selectedLocalityIds, setSelectedLocalityIds] = useState<string[] | null>(null);

  const [category, setCategory] = useState<string | null>(null);

  const [cards, setCards] = useState<PincodeVendorCard[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");

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
      const found = result.geo?.localities ?? [];
      setResolvedPincode(trimmed);
      setLocalities(found);
      setSelectedLocalityIds(null);
      setStage("browsing");
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

  const changePincode = useCallback(() => {
    setStage("entering");
    setResolvedPincode(null);
    setLocalities([]);
    setSelectedLocalityIds(null);
    setCategory(null);
    setCards([]);
  }, []);

  const toggleLocality = useCallback((localityId: string) => {
    setSelectedLocalityIds((current) => {
      if (current === null) return [localityId];
      if (current.includes(localityId)) {
        const next = current.filter((id) => id !== localityId);
        return next.length ? next : null; // falling back to empty means "All Locations" again
      }
      return [...current, localityId];
    });
  }, []);

  const selectAllLocalities = useCallback(() => setSelectedLocalityIds(null), []);

  const loadResults = useCallback((reset: boolean) => {
    if (!resolvedPincode) return;
    setResultsLoading(true);
    setResultsError("");
    fetchPincodeVendors({
      pincode: resolvedPincode,
      categoryDisplayName: category ?? undefined,
      localityIds: selectedLocalityIds ?? undefined,
      limit: PAGE_SIZE,
      offset: reset ? 0 : offset,
    })
      .then((result) => {
        setCards((previous) => (reset ? result.cards : [...previous, ...result.cards]));
        setHasMore(result.hasMore);
        setOffset(result.nextOffset);
      })
      .catch(() => {
        // FlatList may call onEndReached again after a failed request. Mark the
        // result set exhausted until the user changes a filter/location or
        // explicitly retries, otherwise a missing/unavailable RPC causes an
        // unbounded request loop.
        setHasMore(false);
        setResultsError("We couldn't load vendors for this location right now.");
      })
      .finally(() => setResultsLoading(false));
  }, [resolvedPincode, category, selectedLocalityIds, offset]);

  useEffect(() => {
    if (stage !== "browsing" || !resolvedPincode || !localities.length) return;
    setCards([]);
    setOffset(0);
    setHasMore(true);
    loadResults(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, resolvedPincode, localities.length, category, selectedLocalityIds]);

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

  const renderCard = useCallback(({ item, index }: ListRenderItemInfo<PincodeVendorCard>) => (
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

  const selectedLocalityNames = selectedLocalityIds
    ? localities.filter((locality) => selectedLocalityIds.includes(locality.id)).map((locality) => locality.name).join(", ")
    : "All Locations";

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      {pincodeLoading || (resultsLoading && cards.length === 0) ? <PageLoader /> : null}
      <PublicWebNavbar activeRoute="Home" />
      <View style={[styles.top, { width: contentWidth }]}>
        <HomeReveal direction="down">
          <View style={styles.headerRow}>
            <Mail size={18} color={PINK} />
            <Text style={[styles.title, { color: text }]}>Search by Location</Text>
          </View>
          <Text style={[styles.subtitle, { color: muted }]}>
            Find vendors in any PIN code, no matter where you are right now
          </Text>
        </HomeReveal>

        {stage === "entering" ? (
          <HomeReveal delay={20}>
            <View style={[styles.pinCard, { borderColor: border, backgroundColor: colors.card }]}>
              <Text style={[styles.pinLabel, { color: text }]}>Enter PIN Code</Text>
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
                  onSubmitEditing={submitPincode}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={pincodeLoading}
                  onPress={submitPincode}
                  style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
                >
                  <Text style={styles.primaryActionText}>{pincodeLoading ? "Finding…" : "Find Locations"}</Text>
                </Pressable>
              </View>
              {pincodeError ? <Text style={styles.errorText}>{pincodeError}</Text> : null}
            </View>
          </HomeReveal>
        ) : null}

        {stage === "browsing" ? (
          <>
            <HomeReveal delay={15}>
              <View style={styles.pincodeSummaryRow}>
                <Text style={[styles.pincodeSummary, { color: text }]}>📮 {resolvedPincode}</Text>
                <Pressable accessibilityRole="button" onPress={changePincode}>
                  <Text style={[styles.changeLink, { color: colors.primaryStrong }]}>Change PIN</Text>
                </Pressable>
              </View>
            </HomeReveal>

            {localities.length === 0 ? (
              <HomeReveal delay={30}>
                <View style={[styles.empty, { borderColor: border, backgroundColor: colors.card }]}>
                  <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                    <SearchX size={24} color={colors.primaryStrong} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: text }]}>No locations found for this PIN.</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={changePincode}
                    style={({ pressed }) => [styles.emptyAction, pressed && styles.actionPressed]}
                  >
                    <Text style={styles.emptyActionText}>Try another PIN</Text>
                  </Pressable>
                </View>
              </HomeReveal>
            ) : (
              <>
                <HomeReveal delay={30}>
                  <Text style={[styles.sectionLabel, { color: muted }]}>
                    {localities.length} location{localities.length === 1 ? "" : "s"} found
                  </Text>
                  <View style={styles.chipsRowStatic}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={selectAllLocalities}
                      style={[
                        styles.localityChip,
                        { borderColor: selectedLocalityIds === null ? PINK : border, backgroundColor: selectedLocalityIds === null ? PINK : colors.card },
                      ]}
                    >
                      {selectedLocalityIds === null ? <Check size={14} color="#FFFFFF" /> : null}
                      <Text style={[styles.chipText, { color: selectedLocalityIds === null ? "#FFFFFF" : text }]}>All Locations</Text>
                    </Pressable>
                    {localities.map((locality) => {
                      const active = selectedLocalityIds?.includes(locality.id) ?? false;
                      return (
                        <Pressable
                          key={locality.id}
                          accessibilityRole="button"
                          onPress={() => toggleLocality(locality.id)}
                          style={[
                            styles.localityChip,
                            { borderColor: active ? PINK : border, backgroundColor: active ? PINK : colors.card },
                          ]}
                        >
                          {active ? <Check size={14} color="#FFFFFF" /> : null}
                          <Text style={[styles.chipText, { color: active ? "#FFFFFF" : text }]}>{locality.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </HomeReveal>

                <HomeReveal delay={45}>
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

                <HomeReveal delay={60}>
                  <Text style={[styles.resultsSummary, { color: muted }]}>
                    {resultsLoading && cards.length === 0
                      ? "Searching…"
                      : `${category ?? "Vendors"} in ${resolvedPincode} (${selectedLocalityNames}) — ${cards.length} found`}
                  </Text>
                </HomeReveal>
              </>
            )}
          </>
        ) : null}
      </View>

      {stage === "browsing" && localities.length > 0 ? (
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
          ListEmptyComponent={resultsLoading && cards.length === 0 ? (
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
                No {category ? category.toLowerCase() : "vendors"} found{" "}
                {selectedLocalityIds ? `in ${selectedLocalityNames}` : `across these locations`}.
              </Text>
              {selectedLocalityIds ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={selectAllLocalities}
                  style={({ pressed }) => [styles.emptyAction, pressed && styles.actionPressed]}
                >
                  <Text style={styles.emptyActionText}>Search All Locations</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      ) : null}

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
  pinCard: { marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 20 },
  pinLabel: { fontFamily: fonts.sans.semibold, fontSize: typeScale.bodyCompact },
  pinRow: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "center", maxWidth: 360 },
  pinInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: fonts.sans.medium, fontSize: typeScale.bodyCompact },
  primaryAction: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
  primaryActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  errorText: { marginTop: 8, color: "#D64545", fontFamily: fonts.sans.medium, fontSize: typeScale.caption },
  actionPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  pincodeSummaryRow: { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pincodeSummary: { fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  changeLink: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  sectionLabel: { marginTop: 16, marginBottom: 8, fontFamily: fonts.sans.semibold, fontSize: typeScale.caption },
  chipsRow: { gap: 8, paddingRight: 8 },
  chipsRowStatic: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.25, alignItems: "center", justifyContent: "center" },
  localityChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.25, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  chipText: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  resultsSummary: { marginTop: 14, fontFamily: fonts.sans.medium, fontSize: typeScale.metadata },
  scroll: { flex: 1 },
  list: { alignSelf: "center", gap: 14, paddingTop: 6 },
  empty: { alignSelf: "center", minHeight: 220, marginTop: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 24, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 15, fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  emptyText: { maxWidth: 380, marginTop: 7, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  emptyAction: { minHeight: 44, marginTop: 12, paddingHorizontal: 18, borderRadius: 14, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  emptyActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
});
