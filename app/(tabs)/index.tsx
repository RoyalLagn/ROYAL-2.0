import React, { useEffect, useMemo, useState } from "react";
import { Alert, View, Text, ScrollView, Image, Pressable, TouchableOpacity, StyleSheet, useWindowDimensions, } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Bell, LocateFixed, MapPin, MessageSquareText, Share2, Search, ChevronRight, Star, SlidersHorizontal, LayoutGrid, } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { useFavorites } from "@/context/FavoritesContext";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import HeroCarousel from "@/components/home/HeroCarousel";
import HomeReveal from "@/components/home/HomeReveal";
import SectionHeader from "@/components/home/SectionHeader";
import HomeFilterModal, { DEFAULT_HOME_FILTERS, type HomeFilters } from "@/components/home/HomeFilterModal";
import { HERO_IMAGE_ASPECT } from "@/types/hero";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { useNotifications } from "@/context/NotificationContext";
import {
  getApprovedPublicVendors, subscribeToPublicVendorChanges, type PublicVendorListing, } from "@/services/publicVendorListings";
import { usePublicAuth } from "@/context/PublicAuthContext";
import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import HomeVendorCard from "@/components/home/HomeVendorCard";
import HomeSectionReveal from "@/components/home/HomeSectionReveal";
import { shareRoyalLagnApp } from "@/services/AppShareService";
import { useCategories } from "@/context/CategoryContext";
import { VendorCardSkeletonRow } from "@/components/loading/Skeleton";
import PageLoader from "@/components/loading/PageLoader";
import { BREAKPOINTS } from "@/utils/responsiveLayout";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { MotionDuration, MotionStagger } from "@/utils/motion";
import {
  getCurrentDeviceLocation,
  getDevicePermissionStatus,
  reverseGeocodeLabel,
} from "@/services/deviceLocation";
import { useCustomerLocation } from "@/context/LocationContext";
import { rankVendorsByLocationAndMembership } from "@/locations/domain";

const PINK = brandPalette.light.primaryStrong;
const TRENDING_SEARCHES = ["Wedding Photographers", "Mandap Decorators", "Destination Wedding", "Bridal Makeup"];
const PRIMARY_CATEGORY_COUNT = 10;
/** Optimized WebP floral corner (was 1.4MB PNG). */
const FLOWER_ORNAMENT = require("../../assets/images/optimized/flowersvg.webp");
/** Lightweight vendor-card fallback — avoids bundling multi‑MB category-fallback PNGs on Home. */
const VENDOR_CARD_PLACEHOLDER = require("../../assets/images/optimized/vendor-placeholder.webp");
const LIST_BUSINESS_BG = require("../../assets/images/optimized/list-business-bg.webp");

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchText, setSearchText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categoryTogglePressed, setCategoryTogglePressed] = useState(false);
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_HOME_FILTERS);
  const [liveVendors, setLiveVendors] = useState<PublicVendorListing[]>([]);
  // True only until the *first* vendor fetch settles -- background
  // refreshes (realtime updates) never flip this back on, so previously
  // loaded cards stay visible instead of being replaced by skeletons.
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { unreadCount } = useNotifications();
  const { profile } = usePublicAuth();
  const {
    preference: customerLocationPreference,
    location: customerLocation,
    loading: customerLocationLoading,
  } = useCustomerLocation();
  const { homeCategories: categories, loading: categoriesLoading } = useCategories();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [homeLocation, setHomeLocation] = useState<string | null>(null);
  const [homeLocationLoading, setHomeLocationLoading] = useState(false);
  const { width: screenWidth, height: viewportHeight } = useWindowDimensions();
  const homeScrollY = useSharedValue(0);
  const handleHomeScroll = useAnimatedScrollHandler((event) => {
    homeScrollY.value = event.contentOffset.y;
  });
  const isDesktop = screenWidth >= 1100;
  const horizontalInset = isDesktop ? 24 : screenWidth < 380 ? 14 : screenWidth < 480 ? 18 : 20;
  const featureWidth = Math.min(screenWidth - horizontalInset * 2, 1280);
  const headerSideWidth = screenWidth < BREAKPOINTS.normalPhone ? 96 : 108;
  const headerLogoWidth = Math.max(96, Math.min(176, featureWidth - headerSideWidth * 2));
  const categoryColumns = screenWidth < 360 ? 4 : 5;
  const categoryItemWidth = featureWidth / categoryColumns;
  const categoryCardWidth = isDesktop
    ? Math.min(176, categoryItemWidth - 32)
    : screenWidth >= 600
      ? Math.min(102, categoryItemWidth - 20)
      : Math.min(70, Math.max(54, categoryItemWidth - 10));
  const vendorCardGap = screenWidth >= BREAKPOINTS.smallTablet ? 14 : 12;
  const vendorCardWidth = isDesktop
    ? 360
    : screenWidth >= 600
      ? 260
      : Math.max(130, (featureWidth - vendorCardGap) / 2);
  const vendorImageHeight = Math.round(vendorCardWidth);
  const listBannerHeight = Math.min(Math.round(featureWidth * (887 / 1774)), 220);
  const sectionSpacing = isDesktop ? 48 : screenWidth >= 600 ? 42 : 36;
  const compactSectionSpacing = isDesktop ? 40 : screenWidth >= 600 ? 36 : 30;

  // Tablet + desktop: text/search left, 16:9 image right (image column larger).
  // Image drives height via aspect-ratio — left panel stretches to match, never
  // the other way around. Mobile stacks text above the same 16:9 image.
  const isHeroSplit = screenWidth >= BREAKPOINTS.smallTablet;
  // Image column ~62% so it stays larger than the text column on all desktop widths.
  const heroSplitRightWidth = isHeroSplit
    ? Math.round(Math.max(featureWidth * 0.62, featureWidth - 380))
    : featureWidth;
  const heroSplitLeftWidth = isHeroSplit
    ? featureWidth - heroSplitRightWidth
    : 0;

  useEffect(() => {
    let active = true;
    const load = () => {
      getApprovedPublicVendors()
        .then((vendors) => {
          if (active) setLiveVendors(vendors);
        })
        .catch(() => {
          if (active) setLiveVendors([]);
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
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Never prompt from the home screen. If permission was already granted,
  // refresh the same device GPS + first-party locality label used by Near Me.
  useEffect(() => {
    let active = true;
    (async () => {
      if (await getDevicePermissionStatus() !== "granted" || !active) return;
      setHomeLocationLoading(true);
      try {
        const coords = await getCurrentDeviceLocation();
        const label = await reverseGeocodeLabel(coords).catch(() => null);
        if (active) setHomeLocation(label ?? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      } catch {
        if (active) setHomeLocation(null);
      } finally {
        if (active) setHomeLocationLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const colors = brandColors(isDark);
  const bg = colors.background;
  const card = colors.card;
  const text = isDark ? "#F5F0F3" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const heroBorder = isDark ? "#3A2530" : colors.border;
  const PINK = colors.primaryStrong;
  const STAR = colors.rating;

  const catNameForNav = (name: string) => name;
  const openCategory = (name: string) => router.push({
    pathname: "/VendorsListing",
    params: { category: catNameForNav(name) },
  });
  const primaryCategories = categories.slice(0, PRIMARY_CATEGORY_COUNT);
  const displayedCategories = showAllCategories ? categories : primaryCategories;
  const searchParams = (value: HomeFilters = filters, query = searchText) => ({
    query: query.trim(),
    rating: value.minimumRating ? String(value.minimumRating) : undefined,
    budget: value.maximumBudget ? String(value.maximumBudget) : undefined,
    category: value.category || undefined,
    availability: value.availabilityOnly ? "true" : undefined,
    nearby: value.nearbyOnly ? "true" : undefined,
    sort: value.sort,
  });
  const submitSearch = () => router.push({ pathname: "/Search", params: searchParams() });
  const applyFilters = (value: HomeFilters) => {
    setFilters(value);
    setFiltersVisible(false);
    if (value.nearbyOnly) {
      router.push("/NearbyVendors");
      return;
    }
    router.push({ pathname: "/Search", params: searchParams(value) });
  };
  const shareApp = async () => {
    try {
      await shareRoyalLagnApp();
    } catch {
      Alert.alert("Unable to share", "Please try sharing RoyalLagn again.");
    }
  };
  const activeFilterCount = [
    filters.minimumRating > 0,
    filters.maximumBudget > 0,
    Boolean(filters.category),
    filters.availabilityOnly,
    filters.nearbyOnly,
    filters.sort !== "recommended",
  ].filter(Boolean).length;
  const firstName = profile?.full_name.trim().split(/\s+/)[0] || "there";
  const currentHour = currentTime.getHours();
  const greeting = currentHour < 12
    ? "Good Morning"
    : currentHour < 17
      ? "Good Afternoon"
      : "Good Evening";
  const nearbyVendors = useMemo(() => {
    const ratedVendors = liveVendors
      .map((vendor) => {
        const current = getRating(vendor.id, vendor.rating, vendor.reviews);
        return { ...vendor, rating: current.rating, reviews: current.reviews };
      })
      .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    return rankVendorsByLocationAndMembership(
      ratedVendors,
      customerLocationPreference,
    );
  }, [customerLocationPreference, getRating, liveVendors]);

  const topRatedVendors = useMemo(() => {
    // Show every vendor using the marketplace priority order. Rating remains
    // the tie-breaker after location and membership, and unrated vendors stay
    // visible so the row never looks sparse.
    const ratedVendors = liveVendors
      .map((vendor) => {
        const current = getRating(vendor.id, vendor.rating, 0);
        return { ...vendor, rating: current.rating, reviews: current.reviews };
      })
      .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    return ratedVendors;
  }, [liveVendors, getRating]);

  const inlineSearchSuggestions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (query.length < 2) return { categories: [], vendors: [] };
    const tokens = query.split(/\s+/).filter(Boolean);
    const matches = (value: string) => tokens.every((token) => value.toLowerCase().includes(token));
    return {
      categories: categories.filter((category) => matches(`${category.name} ${category.description}`)).slice(0, 2),
      vendors: nearbyVendors.filter((vendor) => matches([
        vendor.name,
        vendor.category,
        vendor.location,
        vendor.tags.join(" "),
        vendor.services.join(" "),
        vendor.description,
      ].join(" "))).slice(0, 3),
    };
  }, [categories, nearbyVendors, searchText]);
  const hasInlineSearchSuggestions = inlineSearchSuggestions.categories.length > 0 || inlineSearchSuggestions.vendors.length > 0;
  const searchQueryActive = searchText.trim().length >= 2;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      {vendorsLoading || (categoriesLoading && !categories.length) ? <PageLoader /> : null}
      <Animated.ScrollView
        style={{ backgroundColor: bg }}
        showsVerticalScrollIndicator={false}
        onScroll={handleHomeScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[
          s.scroll,
          { paddingBottom: isDesktop ? 32 : 0, backgroundColor: bg },
        ]}
      >

        {/* ── Compact mobile header ── */}
        {!isDesktop ? (
          <HomeReveal direction="down" style={[s.header, { width: featureWidth }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={homeLocation ? `Your current location: ${homeLocation}. Open nearby vendors` : "Set location and find nearby vendors"}
              style={[s.nearMeHeader, { width: headerSideWidth }]}
              onPress={() => router.push("/NearbyVendors")}
              activeOpacity={0.72}
            >
              <View style={s.locationIconWrap}><LocateFixed size={15} color={PINK} /></View>
              <View style={s.locationCopy}>
                <Text style={s.locationEyebrow}>{homeLocation ? "Your location" : "Location"}</Text>
                <Text style={s.nearMeHeaderText} numberOfLines={1}>
                  {homeLocationLoading ? "Locating…" : homeLocation?.split(",")[0]?.trim() || "Set location"}
                </Text>
              </View>
            </TouchableOpacity>

            <View
              pointerEvents="none"
              style={s.headerLogo}
            >
              <RoyalLagnLogo width={headerLogoWidth} height={44} />
            </View>

            <View style={[s.headerActions, { width: headerSideWidth }]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open enquiries"
                style={s.headerAction}
                hitSlop={4}
                onPress={() => router.push("/(tabs)/enquiry")}
                activeOpacity={0.7}
              >
                <MessageSquareText size={20} color={text} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                style={s.headerAction}
                hitSlop={4}
                onPress={() => router.push("/Notifications")}
                activeOpacity={0.7}
              >
                <Bell size={20} color={text} />
                {unreadCount > 0 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeTxt}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Share RoyalLagn"
                style={s.headerAction}
                hitSlop={4}
                onPress={shareApp}
                activeOpacity={0.7}
              >
                <Share2 size={20} color={text} />
              </TouchableOpacity>
            </View>
          </HomeReveal>
        ) : null}

        {!searchQueryActive ? (isHeroSplit ? (
          /* ── Tablet/desktop: text left, 16:9 image right ── */
          <HomeReveal
            delay={25}
            style={[
              s.heroSplitCard,
              {
                width: featureWidth,
                borderColor: heroBorder,
                backgroundColor: card,
                // Breathing room from the web navbar above and Top Categories below.
                marginTop: isDesktop ? 28 : 18,
                marginBottom: isDesktop ? 40 : 30,
              },
            ]}
          >
            <View style={[s.heroSplitLeft, { width: heroSplitLeftWidth }]}>
              <LinearGradient
                colors={isDark ? ["#1B1017", "#2A1421", "#3A1A2A"] : ["#FFFFFF", "#FFF7FA", "#FCE9F1"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Image
                source={FLOWER_ORNAMENT}
                resizeMode="contain"
                style={[s.heroFlowerDesktop, isDark && s.heroFlowerDark]}
              />
              <Text style={[s.greetingText, { color: muted }]}>
                {greeting}, {firstName} 👋
              </Text>
              <Text style={[s.greetingTitle, isDesktop && s.greetingTitleDesktop, { color: text }]}>
                Find your <Text style={s.greetingAccent}>perfect</Text>{"\n"}wedding team
              </Text>
              <Text style={[s.heroSplitDescription, { color: muted }]}>
                Explore handpicked wedding professionals to make your big day unforgettable.
              </Text>
              <View style={s.heroSplitSearchRow}>
                <CompactSearchBar
                  accessibilityLabel="Search vendors, categories and services"
                  value={searchText}
                  onChangeText={setSearchText}
                  onSubmit={submitSearch}
                  placeholder="Search vendors, categories..."
                  dark={isDark}
                  style={s.searchBar}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open filters"
                  style={[s.filterBtn, { backgroundColor: isDark ? "#0E141F" : "#FFFFFF" }]}
                  onPress={() => setFiltersVisible(true)}
                  activeOpacity={0.76}
                >
                  <SlidersHorizontal size={16} color={PINK} />
                  {activeFilterCount ? <View style={s.filterCount}><Text style={s.filterCountText}>{activeFilterCount}</Text></View> : null}
                </TouchableOpacity>
              </View>
            </View>
            <View style={[s.heroSplitRight, { width: heroSplitRightWidth }]}>
              <HeroCarousel width={heroSplitRightWidth} desktop radius={0} />
            </View>
          </HomeReveal>
        ) : (
          /* ── Mobile: one bordered section from greeting through hero image ── */
          <HomeReveal
            delay={25}
            style={[
              s.heroMobileSection,
              {
                width: featureWidth,
                borderColor: heroBorder,
                backgroundColor: card,
              },
            ]}
          >
            <View style={s.heroMobileIntro}>
              <LinearGradient
                colors={isDark ? ["#1B1017", "#2A1421", "#3A1A2A"] : ["#FFFFFF", "#FFF7FA", "#FCE9F1"]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Image
                source={FLOWER_ORNAMENT}
                resizeMode="contain"
                style={[s.heroFlowerMobile, isDark && s.heroFlowerDark]}
              />
              <Text style={[s.greetingText, { color: muted }]}>
                {greeting}, {firstName} 👋
              </Text>
              <Text style={[s.greetingTitle, { color: text }]}>
                Find your <Text style={s.greetingAccent}>perfect</Text>{"\n"}wedding team
              </Text>

              <View style={s.heroMobileSearchRow}>
                <CompactSearchBar
                  accessibilityLabel="Search vendors, categories and services"
                  value={searchText}
                  onChangeText={setSearchText}
                  onSubmit={submitSearch}
                  placeholder="Search vendors, categories..."
                  dark={isDark}
                  style={s.searchBar}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open filters"
                  style={[s.filterBtn, screenWidth < 380 && s.filterBtnNarrow, { backgroundColor: isDark ? "#0E141F" : "#FFFFFF" }]}
                  onPress={() => setFiltersVisible(true)}
                  activeOpacity={0.76}
                >
                  <SlidersHorizontal size={16} color={PINK} />
                  {activeFilterCount ? <View style={s.filterCount}><Text style={s.filterCountText}>{activeFilterCount}</Text></View> : null}
                </TouchableOpacity>
              </View>
            </View>

            {/* Full-bleed 16:9 hero: spans to the section's left/right border edges */}
            <View style={s.heroMobileImageWrap}>
              <HeroCarousel
                width={Math.max(featureWidth - 2, 0)}
                desktop={false}
                radius={0}
              />
            </View>
          </HomeReveal>
        )) : null}

        {searchQueryActive ? (
          <HomeReveal
            style={[
              s.searchHero,
              {
                width: featureWidth,
                marginTop: isDesktop ? 28 : 6,
                backgroundColor: card,
                borderColor: heroBorder,
              },
            ]}
          >
            <View style={[s.searchHeroToolbar, { borderBottomColor: border }]}>
              <CompactSearchBar
                accessibilityLabel="Search vendors, categories and services"
                value={searchText}
                onChangeText={setSearchText}
                onSubmit={submitSearch}
                placeholder="Search vendors, categories..."
                dark={isDark}
                style={s.searchBar}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open filters"
                style={[s.filterBtn, screenWidth < 380 && s.filterBtnNarrow, { backgroundColor: isDark ? "#0E141F" : "#FFFFFF" }]}
                onPress={() => setFiltersVisible(true)}
                activeOpacity={0.76}
              >
                <SlidersHorizontal size={16} color={PINK} />
                {activeFilterCount ? <View style={s.filterCount}><Text style={s.filterCountText}>{activeFilterCount}</Text></View> : null}
              </TouchableOpacity>
            </View>
            <View style={s.searchSuggestions}>
            {hasInlineSearchSuggestions ? (
              <>
                {inlineSearchSuggestions.categories.map((category) => (
                  <TouchableOpacity
                    key={`search-category-${category.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${category.name}`}
                    style={[s.searchSuggestionRow, { borderBottomColor: border }]}
                    activeOpacity={0.72}
                    onPress={() => openCategory(category.name)}
                  >
                    <View style={[s.searchSuggestionIcon, { backgroundColor: isDark ? "#33222B" : "#FFF0F5" }]}>
                      <LayoutGrid size={17} color={PINK} />
                    </View>
                    <View style={s.searchSuggestionCopy}>
                      <Text style={[s.searchSuggestionTitle, { color: text }]} numberOfLines={1}>{category.name}</Text>
                      <Text style={[s.searchSuggestionDetail, { color: muted }]} numberOfLines={1}>Browse wedding services</Text>
                    </View>
                    <ChevronRight size={17} color={muted} />
                  </TouchableOpacity>
                ))}
                {inlineSearchSuggestions.vendors.map((vendor) => (
                  <TouchableOpacity
                    key={`search-vendor-${vendor.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${vendor.name}`}
                    style={[s.searchSuggestionRow, { borderBottomColor: border }]}
                    activeOpacity={0.72}
                    onPress={() => router.push({ pathname: "/VendorsProfile", params: { vendorId: vendor.id, category: vendor.category } })}
                  >
                    <View style={[s.searchSuggestionIcon, { backgroundColor: isDark ? "#33222B" : "#FFF0F5" }]}>
                      <Search size={17} color={PINK} />
                    </View>
                    <View style={s.searchSuggestionCopy}>
                      <Text style={[s.searchSuggestionTitle, { color: text }]} numberOfLines={1}>{vendor.name}</Text>
                      <View style={s.searchSuggestionMeta}>
                        <Text style={[s.searchSuggestionDetail, { color: muted }]} numberOfLines={1}>{vendor.category}</Text>
                        <MapPin size={12} color={muted} />
                        <Text style={[s.searchSuggestionDetail, { color: muted }]} numberOfLines={1}>{vendor.location}</Text>
                      </View>
                    </View>
                    <ChevronRight size={17} color={muted} />
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Search RoyalLagn for ${searchText.trim()}`}
                style={s.searchSuggestionRow}
                activeOpacity={0.72}
                onPress={submitSearch}
              >
                <View style={[s.searchSuggestionIcon, { backgroundColor: isDark ? "#33222B" : "#FFF0F5" }]}>
                  <Search size={17} color={PINK} />
                </View>
                <View style={s.searchSuggestionCopy}>
                  <Text style={[s.searchSuggestionTitle, { color: text }]} numberOfLines={1}>Search all vendors</Text>
                  <Text style={[s.searchSuggestionDetail, { color: muted }]} numberOfLines={1}>See every result for “{searchText.trim()}”</Text>
                </View>
                <ChevronRight size={17} color={muted} />
              </TouchableOpacity>
            )}
            </View>
          </HomeReveal>
        ) : null}

        {/* ── Top Categories ── */}
        <HomeSectionReveal
          scrollY={homeScrollY}
          viewportHeight={viewportHeight}
          style={[s.section, { width: featureWidth, marginBottom: compactSectionSpacing }]}
        >
          <SectionHeader
            title="Top Categories"
            subtitle="Everything you need for the celebration"
            dark={isDark}
            actionLabel="View All"
            onActionPress={() => router.push("/(tabs)/Categories")}
          />

          <View style={s.catGrid}>
            {displayedCategories.map((cat, index) => (
              <HomeCategoryCard
                key={cat.id}
                name={cat.name}
                image={cat.homeImage}
                itemWidth={categoryItemWidth}
                cardWidth={categoryCardWidth}
                dark={isDark}
                animateEntrance={showAllCategories && index >= PRIMARY_CATEGORY_COUNT}
                entranceDelay={Math.min(
                  Math.max(0, index - PRIMARY_CATEGORY_COUNT) * MotionStagger.item,
                  MotionDuration.fast,
                )}
                onPress={() => openCategory(cat.name)}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showAllCategories ? "Show fewer categories" : "Show more categories"}
            accessibilityState={{ expanded: showAllCategories }}
            onPress={() => setShowAllCategories((current) => !current)}
            onPressIn={() => setCategoryTogglePressed(true)}
            onPressOut={() => setCategoryTogglePressed(false)}
            style={[
              s.categoryToggle,
              { backgroundColor: isDark ? colors.card : colors.background, borderColor: colors.frameBorder },
              categoryTogglePressed && s.categoryTogglePressed,
            ]}
          >
            <LayoutGrid size={17} color={PINK} strokeWidth={2.2} />
            <Text style={[s.categoryToggleText, { color: PINK }]}>
              {showAllCategories ? "Fewer Categories" : "More Categories"}
            </Text>
          </Pressable>
        </HomeSectionReveal>

        {/* ── Trending searches ── */}
        <HomeSectionReveal
          scrollY={homeScrollY}
          viewportHeight={viewportHeight}
          style={[s.trendingSection, { width: featureWidth, marginBottom: sectionSpacing }]}
        >
          <SectionHeader
            title="Trending Searches"
            subtitle="Popular ways to start your search"
            dark={isDark}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trendingRow}>
            {TRENDING_SEARCHES.map((term) => (
              <TouchableOpacity
                key={term}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${term}`}
                style={[s.trendingChip, { backgroundColor: card, borderColor: border }]}
                onPress={() => router.push({ pathname: "/Search", params: searchParams(filters, term) })}
                activeOpacity={0.76}
              >
                <Search size={15} color={PINK} />
                <Text style={[s.trendingText, { color: text }]}>{term}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </HomeSectionReveal>

        {/* All vendors, automatically ranked by saved location and membership. */}
        <HomeSectionReveal
          scrollY={homeScrollY}
          viewportHeight={viewportHeight}
          style={[s.popularSection, { width: featureWidth, marginBottom: sectionSpacing }]}
        >
          <SectionHeader
            title="Near Me"
            subtitle={customerLocationPreference
              ? `Nearby first for ${customerLocation}`
              : "Nearby and premium vendors first"}
            dark={isDark}
            actionLabel="View All"
            onActionPress={() => router.push({ pathname: "/Search", params: { sort: "recommended" } })}
          />

          {vendorsLoading || customerLocationLoading ? (
            <View style={s.vendorScroll}>
              <VendorCardSkeletonRow
                count={isDesktop ? 4 : 3}
                width={vendorCardWidth}
                imageHeight={vendorImageHeight}
              />
            </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToAlignment="start"
            snapToInterval={vendorCardWidth + vendorCardGap}
            contentContainerStyle={[s.vendorScroll, { gap: vendorCardGap }]}
          >
            {nearbyVendors.map((v) => {
              const isFav = isFavorite(v.id);
              return (
                <HomeVendorCard
                  key={v.id}
                  vendor={v}
                  width={vendorCardWidth}
                  imageHeight={vendorImageHeight}
                  dark={isDark}
                  favorite={isFav}
                  fallbackSource={VENDOR_CARD_PLACEHOLDER}
                  onOpen={() =>
                      router.push({
                        pathname: "/VendorsProfile",
                        params: { vendorId: v.id, category: v.category },
                      })
                  }
                  onToggleFavorite={(source) => toggleFavorite(v, source)}
                />
              );
            })}
          </ScrollView>
          )}
          {!vendorsLoading && !customerLocationLoading && !nearbyVendors.length ? (
            <Text style={[s.emptyVendors, { color: muted }]}>No approved vendors are available right now.</Text>
          ) : null}
        </HomeSectionReveal>

        {/* ── Top Rated Vendors ── */}
        <HomeSectionReveal
          scrollY={homeScrollY}
          viewportHeight={viewportHeight}
          style={[s.popularSection, { width: featureWidth, marginBottom: sectionSpacing }]}
        >
          <SectionHeader
            title="Top Rated Vendors"
            subtitle="Browse vendors ordered by customer ratings"
            dark={isDark}
            actionLabel="View All"
            onActionPress={() => router.push({ pathname: "/Search", params: { sort: "rating" } })}
            accessory={screenWidth >= BREAKPOINTS.normalPhone ? (
              <View style={[s.nearBadge, { backgroundColor: isDark ? "#3A2E12" : "#FFF8E1", borderColor: isDark ? "#5B4A1E" : "#F5DDA0" }]}>
                <Star size={11} color={STAR} fill={STAR} />
                <Text style={[s.nearBadgeText, { color: colors.ratingForeground }]}>Highest Rated</Text>
              </View>
            ) : null}
          />

          {vendorsLoading ? (
            <View style={s.vendorScroll}>
              <VendorCardSkeletonRow
                count={isDesktop ? 4 : 3}
                width={vendorCardWidth}
                imageHeight={vendorImageHeight}
              />
            </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToAlignment="start"
            snapToInterval={vendorCardWidth + vendorCardGap}
            contentContainerStyle={[s.vendorScroll, { gap: vendorCardGap }]}
          >
            {topRatedVendors.map((v) => {
              const isFav = isFavorite(v.id);
              return (
                <HomeVendorCard
                  key={v.id}
                  vendor={v}
                  width={vendorCardWidth}
                  imageHeight={vendorImageHeight}
                  dark={isDark}
                  favorite={isFav}
                  fallbackSource={VENDOR_CARD_PLACEHOLDER}
                  onOpen={() =>
                      router.push({
                        pathname: "/VendorsProfile",
                        params: { vendorId: v.id, category: v.category },
                      })
                  }
                  onToggleFavorite={(source) => toggleFavorite(v, source)}
                />
              );
            })}
          </ScrollView>
          )}
          {!vendorsLoading && !topRatedVendors.length ? (
            <Text style={[s.emptyVendors, { color: muted }]}>No rated vendors yet.</Text>
          ) : null}
        </HomeSectionReveal>

        {/* ── List Your Business ── */}
        <HomeSectionReveal
          scrollY={homeScrollY}
          viewportHeight={viewportHeight}
          style={[s.listBanner, { width: featureWidth }]}
        >
          <Image
            source={LIST_BUSINESS_BG}
            style={{ width: "100%", height: listBannerHeight }}
            resizeMode="cover"
          />
          <LinearGradient
            colors={isDark
              ? ["rgba(30,10,20,0.55)", "rgba(30,10,20,0.05)"]
              : ["rgba(255,240,247,0.30)", "rgba(255,240,247,0.0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, s.listOverlay]}
          >
            <View style={s.listLeft}>
              <Text style={s.listTitle}>List Your Business</Text>
              <Text style={[s.listSub, { color: colors.secondaryForeground }]}>
                Join thousands of vendors{"\n"}growing with us
              </Text>
              <TouchableOpacity
                style={s.registerBtn}
                onPress={() => router.push({ pathname: "/VendorAuth", params: { tab: "signup" } })}
              >
                <Text style={s.registerTxt}>Register Now</Text>
                <ChevronRight size={13} color="#FFF" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </HomeSectionReveal>

      </Animated.ScrollView>
      <HomeFilterModal
        visible={filtersVisible}
        dark={isDark}
        value={filters}
        city=""
        onClose={() => setFiltersVisible(false)}
        onApply={applyFilters}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create<Record<string, any>>({
  root:            { flex: 1 },
  scroll:          {},

  /* Header */
  header:          { minHeight: 52, alignSelf: "center", flexDirection: "row", alignItems: "center" },
  headerLocation:  { flexShrink: 0, alignItems: "flex-start", justifyContent: "center" },
  nearMeHeader: { minHeight: 44, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12 },
  locationIconWrap: { width: 27, height: 27, flexShrink: 0, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0F5" },
  locationCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  locationEyebrow: { color: "#81777C", fontFamily: fonts.sans.medium, fontSize: 9, lineHeight: 11 },
  nearMeHeaderText: { marginTop: 1, color: brandPalette.light.primaryStrong, fontFamily: fonts.sans.bold, fontSize: typeScale.caption, lineHeight: 15 },
  headerLogo:      { flex: 1, minWidth: 0, height: 44, alignItems: "center", justifyContent: "center" },
  headerActions:   { flexDirection: "row", flexShrink: 0, alignItems: "center" },
  headerAction:    { flex: 1, minWidth: 0, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", position: "relative" },
  badge:           { position: "absolute", top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: PINK, borderWidth: 2, borderColor: brandPalette.light.primaryForeground, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  badgeTxt:        { color: brandPalette.light.primaryForeground, fontFamily: fonts.sans.bold, fontSize: typeScale.caption },

  /* Greeting */
  greetingText:    { fontFamily: fonts.sans.semibold, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.tab, marginBottom: 2 },
  greetingTitle:   { fontFamily: fonts.serif.bold, fontSize: typeScale.metric, lineHeight: typeLeading.sectionTitle, letterSpacing: -0.5 },
  greetingTitleDesktop: { fontSize: typeScale.editorialPageTitle, lineHeight: typeLeading.pageTitle },
  greetingAccent:  { color: PINK, fontFamily: fonts.serif.boldItalic },

  /* Greeting */
  greetingBlock:   { alignSelf: "center", marginTop: 5, marginBottom: 6 },

  /* Search and filters */
  searchPad:       { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, marginBottom: 12 },
  searchBar:       { flex: 1, minWidth: 0 },
  filterBtn:       { width: 58, height: 58, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: brandPalette.light.border, shadowOpacity: 0, elevation: 0 },
  filterBtnNarrow: { width: 56 },
  filterCount:     { position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  filterCountText: { color: brandPalette.light.primaryForeground, fontFamily: fonts.sans.bold, fontSize: typeScale.caption },

  /* Mobile: one bordered section — greeting → search → 16:9 hero (ratio unchanged) */
  heroMobileSection: {
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 22,
    borderWidth: 1,
    borderRadius: 22,
    overflow: "hidden",
  },
  heroMobileIntro: {
    position: "relative",
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 18,
  },
  /* Ornament sits in the top-right here, so the bottom-left artwork is rotated 180°. */
  heroFlowerMobile: {
    position: "absolute",
    top: -34,
    right: -34,
    width: 270,
    height: 270,
    transform: [{ rotate: "180deg" }],
    opacity: 0.9,
  },
  heroFlowerDesktop: {
    position: "absolute",
    left: -32,
    bottom: -32,
    width: 360,
    height: 360,
    opacity: 0.9,
  },
  heroFlowerDark: { opacity: 0.5 },
  heroMobileSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  heroMobileImageWrap: {
    width: "100%",
    overflow: "hidden",
    // Reserve 16:9 even while HeroCarousel loads (prevents CLS into categories).
    aspectRatio: 16 / 9,
    backgroundColor: "#141014",
  },

  /* Hero split (tablet/desktop): left text stretches to image height; image owns 16:9 */
  heroSplitCard:     { alignSelf: "center", flexDirection: "row", alignItems: "stretch", marginTop: 6, marginBottom: 22, borderWidth: 1, borderRadius: 28, overflow: "hidden" },
  heroSplitLeft:     { position: "relative", overflow: "hidden", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 22, flexShrink: 0, minWidth: 0 },
  heroSplitRight:    { flexShrink: 0, overflow: "hidden", aspectRatio: HERO_IMAGE_ASPECT },
  heroSplitDescription:{ fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, marginTop: 8, maxWidth: 320 },
  heroSplitSearchRow:{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },

  /* Inline search results keep discovery on Home while the full search remains available. */
  searchHero: { alignSelf: "center", marginBottom: 26, borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  searchHeroToolbar: { padding: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchSuggestions: { overflow: "hidden" },
  searchSuggestionRow: { minHeight: 58, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  searchSuggestionIcon: { width: 36, height: 36, flexShrink: 0, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  searchSuggestionCopy: { flex: 1, minWidth: 0 },
  searchSuggestionTitle: { fontFamily: fonts.sans.semibold, fontSize: typeScale.bodyCompact },
  searchSuggestionDetail: { flexShrink: 1, fontFamily: fonts.sans.regular, fontSize: typeScale.caption },
  searchSuggestionMeta: { minWidth: 0, marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 },

  /* Categories */
  section:         { alignSelf: "center" },
  catGrid:         { flexDirection: "row", flexWrap: "wrap" },
  categoryToggle:  { alignSelf: "center", minHeight: 44, marginTop: 6, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1.25, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  categoryTogglePressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  categoryToggleText: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },

  /* Trending */
  trendingSection:{ alignSelf: "center" },
  trendingRow:     { gap: 12, paddingTop: 2, paddingRight: 4, paddingBottom: 2 },
  trendingChip:    { minHeight: 48, minWidth: 190, borderWidth: 1, borderRadius: 14, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#7F5065", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  trendingText:    { fontFamily: fonts.sans.semibold, fontSize: typeScale.metadata },

  /* Popular Near You */
  popularSection:  { alignSelf: "center" },
  nearBadge:       { minHeight: 26, maxWidth: 120, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 3 },
  nearBadgeText:   { flexShrink: 1, color: PINK, fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
  vendorScroll:    { paddingHorizontal: 2, paddingRight: 22, paddingBottom: 16 },
  emptyVendors:    { fontFamily: fonts.sans.regular, paddingVertical: 20, textAlign: "center", fontSize: typeScale.metadata },

  /* List Your Business */
  listBanner:      { alignSelf: "center", borderRadius: 20, overflow: "hidden", marginBottom: 20 },
  listBannerImg:   { width: "100%" },
  listOverlay:     { justifyContent: "center" },
  listLeft:        { width: "55%", paddingLeft: 18, paddingVertical: 18 },
  listTitle:       { fontFamily: fonts.sans.bold, fontSize: typeScale.cardTitle, color: PINK, marginBottom: 4 },
  listSub:         { fontFamily: fonts.sans.regular, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginBottom: 14 },
  registerBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PINK, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 50 },
  registerTxt:     { color: brandPalette.light.primaryForeground, fontFamily: fonts.sans.bold, fontSize: typeScale.body },
});
