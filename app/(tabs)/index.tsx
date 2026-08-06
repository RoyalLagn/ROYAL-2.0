import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  MapPin,
  Bell,
  MessageSquareText,
  Share2,
  Search,
  ChevronRight,
  Star,
  SlidersHorizontal,
  BadgeCheck,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { useFavorites } from "@/context/FavoritesContext";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import HeroCarousel from "@/components/home/HeroCarousel";
import HomeReveal from "@/components/home/HomeReveal";
import LocationSelector from "@/components/home/LocationSelector";
import SectionHeader from "@/components/home/SectionHeader";
import HomeFilterModal, { DEFAULT_HOME_FILTERS, type HomeFilters } from "@/components/home/HomeFilterModal";
import { HERO_IMAGE_ASPECT } from "@/types/hero";
import { useCustomerLocation } from "@/context/LocationContext";
import {
  rankVendorsByLocation,
  vendorLocationPriority,
  vendorNearbyLabel,
} from "@/services/locations";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { useNotifications } from "@/context/NotificationContext";
import {
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";
import { usePublicAuth } from "@/context/PublicAuthContext";
import HomeCategoryCard from "@/components/home/HomeCategoryCard";
import FavoriteHeartButton from "@/components/favorites/FavoriteHeartButton";
import { shareRoyalLagnApp } from "@/services/AppShareService";
import { useCategories } from "@/context/CategoryContext";
import SafeImage from "@/components/SafeImage";
import { VendorCardSkeletonRow } from "@/components/loading/Skeleton";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import { BREAKPOINTS } from "@/utils/responsiveLayout";

const PINK = "#E91E63";
const TRENDING_SEARCHES = ["Wedding Photographers", "Mandap Decorators", "Destination Wedding", "Bridal Makeup"];
const PRIMARY_CATEGORY_COUNT = 9;
/** Line-art floral corner. Drawn for a bottom-left corner, so it is rotated for other corners. */
const FLOWER_ORNAMENT = require("../../assets/images/flowersvg.png");

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchText, setSearchText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_HOME_FILTERS);
  const [liveVendors, setLiveVendors] = useState<PublicVendorListing[]>([]);
  // True only until the *first* vendor fetch settles -- background
  // refreshes (realtime updates) never flip this back on, so previously
  // loaded cards stay visible instead of being replaced by skeletons.
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { city, preference, strictCityOnly } = useCustomerLocation();
  const { unreadCount } = useNotifications();
  const { profile } = usePublicAuth();
  const { homeCategories: categories } = useCategories();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 1100;
  const horizontalInset = isDesktop ? 24 : screenWidth < 380 ? 14 : screenWidth < 480 ? 18 : 20;
  const featureWidth = Math.min(screenWidth - horizontalInset * 2, 1280);
  const categoryColumns = isDesktop ? 6 : screenWidth < 360 ? 4 : 5;
  const categoryItemWidth = featureWidth / categoryColumns;
  const categoryCardWidth = isDesktop
    ? Math.min(120, categoryItemWidth - 26)
    : screenWidth >= 600
      ? Math.min(102, categoryItemWidth - 20)
      : Math.min(70, Math.max(54, categoryItemWidth - 10));
  const vendorCardWidth = isDesktop
    ? 360
    : screenWidth >= 600
      ? 230
      : Math.min(168, Math.max(136, screenWidth * 0.4));
  const listBannerHeight = Math.min(Math.round(featureWidth * (887 / 1774)), 220);

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

  const bg     = isDark ? "#070B14" : "#FFFFFF";
  const card   = isDark ? "#0E141F" : "#FFFFFF";
  const text   = isDark ? "#F5F0F3" : "#111827";
  const muted  = isDark ? "#AAA0A5" : "#6B7280";
  const border = isDark ? "#232C3D" : "#E5E7EB";
  const heroBorder = isDark ? "#3A2530" : "#FBCFE8";

  const catNameForNav = (name: string) => name;
  const openCategory = (name: string) => router.push({
    pathname: "/VendorsListing",
    params: { category: catNameForNav(name) },
  });
  const primaryCategories = categories.slice(0, PRIMARY_CATEGORY_COUNT);
  const displayedCategories = showAllCategories ? categories : primaryCategories;
  const searchParams = (value: HomeFilters = filters, query = searchText) => ({
    query: query.trim(),
    location: city,
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
    const eligible = liveVendors
      .map((vendor) => {
        const current = getRating(vendor.id, vendor.rating, 0);
        return { ...vendor, rating: current.rating, reviews: current.reviews };
      })
      .filter((vendor) =>
        (!filters.minimumRating || vendor.rating >= filters.minimumRating)
        && (!filters.maximumBudget || (
          vendor.startingPriceValue > 0
          && vendor.startingPriceValue <= filters.maximumBudget
        ))
        && (!filters.category || vendor.category === filters.category)
        && (!filters.availabilityOnly || vendor.isAvailable)
        && (!filters.nearbyOnly || vendorLocationPriority(vendor, preference) >= 2)
      )
      .sort((a, b) => {
        if (filters.sort === "rating") return b.rating - a.rating;
        if (filters.sort === "price") {
          return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
            - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
        }
        return b.rating - a.rating || b.reviews - a.reviews;
      });
    return rankVendorsByLocation(eligible, preference, strictCityOnly || filters.nearbyOnly);
  }, [filters, getRating, liveVendors, preference, strictCityOnly]);

  const topRatedVendors = useMemo(() => {
    // Show every vendor, best rated first -- unrated vendors sink to the
    // bottom instead of being hidden, so the row never looks sparse.
    return liveVendors
      .map((vendor) => {
        const current = getRating(vendor.id, vendor.rating, 0);
        return { ...vendor, rating: current.rating, reviews: current.reviews };
      })
      .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  }, [liveVendors, getRating]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top"]}>
      <ScrollView
        style={{ backgroundColor: bg }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingBottom: isDesktop ? 32 : 0, backgroundColor: bg },
        ]}
      >

        {/* ── Compact mobile header ── */}
        {!isDesktop ? (
          <HomeReveal direction="down" style={[s.header, { width: featureWidth }]}>
            <View style={s.headerLocation}><LocationSelector dark={isDark} compact /></View>

            <View
              pointerEvents="none"
              style={[
                s.headerLogo,
                {
                  width: screenWidth < 360 ? 152 : 176,
                  marginLeft: screenWidth < 360 ? -76 : -88,
                },
              ]}
            >
              <RoyalLagnLogo width={screenWidth < 360 ? 152 : 176} height={48} />
            </View>

            <View style={s.headerActions}>
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

        {isHeroSplit ? (
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
        )}

        {/* ── Top Categories ── */}
        <View style={[s.section, { width: featureWidth }]}>
          <SectionHeader
            title="Top Categories"
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
                tone={index}
                dark={isDark}
                onPress={() => openCategory(cat.name)}
              />
            ))}
            {!showAllCategories ? (
              <HomeCategoryCard
                name="More Categories"
                itemWidth={categoryItemWidth}
                cardWidth={categoryCardWidth}
                tone={1}
                dark={isDark}
                more
                onPress={() => setShowAllCategories(true)}
              />
            ) : null}
          </View>
          {showAllCategories ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Show fewer categories" onPress={() => setShowAllCategories(false)} style={({ pressed }) => [s.showLessBtn, pressed && s.showLessPressed]}>
              <Text style={s.showLessText}>Show Less</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── Trending searches ── */}
        <View style={[s.trendingSection, { width: featureWidth }]}>
          <SectionHeader title="Trending Searches" dark={isDark} />
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
        </View>

        {/* ── Popular Near You ── */}
        <View style={[s.popularSection, { width: featureWidth }]}>
          <SectionHeader
            title="Popular Near You"
            dark={isDark}
            actionLabel="View All"
            onActionPress={() => router.push("/(tabs)/Categories")}
            accessory={
              <View style={[s.nearBadge, { backgroundColor: isDark ? "#351D28" : "#FFF1F6", borderColor: isDark ? "#5B2940" : "#F7C7D9" }]}>
                <MapPin size={11} color={PINK} />
                <Text style={s.nearBadgeText}>Near {city}</Text>
              </View>
            }
          />

          {vendorsLoading ? (
            <View style={s.vendorScroll}>
              <VendorCardSkeletonRow
                count={isDesktop ? 4 : 3}
                width={vendorCardWidth}
                imageHeight={Math.round(vendorCardWidth * (isDesktop ? 0.55 : 0.68))}
              />
            </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToAlignment="start"
            snapToInterval={vendorCardWidth + 10}
            contentContainerStyle={s.vendorScroll}
          >
            {nearbyVendors.map((v) => {
              const isFav = isFavorite(v.id);
              const nearbyLabel = vendorNearbyLabel(v, preference);
              return (
                <View key={v.id} style={[s.vendorCard, { width: vendorCardWidth, backgroundColor: card, borderColor: border }]}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${v.name}`}
                    style={s.vendorMain}
                    onPress={() =>
                      router.push({
                        pathname: "/VendorsProfile",
                        params: { vendorId: v.id, category: v.category },
                      })
                    }
                    activeOpacity={0.88}
                  >
                    <View style={[s.vendorImgWrap, { height: Math.round(vendorCardWidth * (isDesktop ? 0.55 : 0.68)) }]}>
                      <SafeImage
                        debugLabel={`home vendor card: ${v.name}`}
                        source={{ uri: v.image }}
                        fallbackSource={resolveMarketplaceCategoryImage(v.category).fallbackSource}
                        style={s.vendorImg}
                        resizeMode="cover"
                      />
                      <View style={s.imgBottomRow}>
                        <View style={s.ratingBadge}>
                          <Star size={11} color="#FACC15" fill="#FACC15" />
                          <Text style={s.ratingBadgeTxt}>{v.rating}</Text>
                        </View>
                        <View style={s.verifiedBadge}>
                          <BadgeCheck size={11} color="#FFF" />
                          <Text style={s.verifiedTxt}>Verified</Text>
                        </View>
                      </View>
                      {nearbyLabel ? <View style={s.vendorNearby}><MapPin size={10} color={PINK} /><Text style={s.vendorNearbyText}>{nearbyLabel}</Text></View> : null}
                    </View>
                    <View style={s.vendorInfo}>
                      <Text style={[s.vendorName, isDesktop && s.vendorNameDesktop, { color: text }]} numberOfLines={1}>{v.name}</Text>
                      <Text style={[s.vendorCat, { color: muted }]} numberOfLines={1}>{v.category}</Text>
                      <View style={s.vendorMeta}>
                        <MapPin size={11} color={muted} />
                        <Text style={[s.vendorLoc, { color: muted }]} numberOfLines={1}>{v.location}</Text>
                        <Text style={[s.vendorPrice, { color: text }]} numberOfLines={1}>{v.startingPrice} onwards</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <FavoriteHeartButton
                    favorite={isFav}
                    accessibilityLabel={isFav ? `Remove ${v.name} from favorites` : `Add ${v.name} to favorites`}
                    style={s.heartBtn}
                    activeStyle={s.heartBtnActive}
                    pressedStyle={s.favoritePressed}
                    onToggle={(source) => toggleFavorite(v, source)}
                    size={15}
                    color="#3A3035"
                    activeIconColor={PINK}
                  />
                </View>
              );
            })}
          </ScrollView>
          )}
          {!vendorsLoading && !nearbyVendors.length ? (
            <Text style={[s.emptyVendors, { color: muted }]}>No vendors match these filters. Try clearing one filter.</Text>
          ) : null}
        </View>

        {/* ── Top Rated Vendors ── */}
        <View style={[s.popularSection, { width: featureWidth }]}>
          <SectionHeader
            title="Top Rated Vendors"
            dark={isDark}
            actionLabel="View All"
            onActionPress={() => router.push("/(tabs)/Categories")}
            accessory={
              <View style={[s.nearBadge, { backgroundColor: isDark ? "#3A2E12" : "#FFF8E1", borderColor: isDark ? "#5B4A1E" : "#F5DDA0" }]}>
                <Star size={11} color="#FACC15" fill="#FACC15" />
                <Text style={[s.nearBadgeText, { color: isDark ? "#FACC15" : "#B45309" }]}>Highest Rated</Text>
              </View>
            }
          />

          {vendorsLoading ? (
            <View style={s.vendorScroll}>
              <VendorCardSkeletonRow
                count={isDesktop ? 4 : 3}
                width={vendorCardWidth}
                imageHeight={Math.round(vendorCardWidth * (isDesktop ? 0.55 : 0.68))}
              />
            </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToAlignment="start"
            snapToInterval={vendorCardWidth + 10}
            contentContainerStyle={s.vendorScroll}
          >
            {topRatedVendors.map((v) => {
              const isFav = isFavorite(v.id);
              return (
                <View key={v.id} style={[s.vendorCard, { width: vendorCardWidth, backgroundColor: card, borderColor: border }]}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${v.name}`}
                    style={s.vendorMain}
                    onPress={() =>
                      router.push({
                        pathname: "/VendorsProfile",
                        params: { vendorId: v.id, category: v.category },
                      })
                    }
                    activeOpacity={0.88}
                  >
                    <View style={[s.vendorImgWrap, { height: Math.round(vendorCardWidth * (isDesktop ? 0.55 : 0.68)) }]}>
                      <SafeImage
                        debugLabel={`home top rated vendor card: ${v.name}`}
                        source={{ uri: v.image }}
                        fallbackSource={resolveMarketplaceCategoryImage(v.category).fallbackSource}
                        style={s.vendorImg}
                        resizeMode="cover"
                      />
                      <View style={s.imgBottomRow}>
                        <View style={s.ratingBadge}>
                          <Star size={11} color="#FACC15" fill="#FACC15" />
                          <Text style={s.ratingBadgeTxt}>{v.rating}</Text>
                        </View>
                        <View style={s.verifiedBadge}>
                          <BadgeCheck size={11} color="#FFF" />
                          <Text style={s.verifiedTxt}>Verified</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.vendorInfo}>
                      <Text style={[s.vendorName, isDesktop && s.vendorNameDesktop, { color: text }]} numberOfLines={1}>{v.name}</Text>
                      <Text style={[s.vendorCat, { color: muted }]} numberOfLines={1}>{v.category}</Text>
                      <View style={s.vendorMeta}>
                        <MapPin size={11} color={muted} />
                        <Text style={[s.vendorLoc, { color: muted }]} numberOfLines={1}>{v.location}</Text>
                        <Text style={[s.vendorPrice, { color: text }]} numberOfLines={1}>{v.startingPrice} onwards</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <FavoriteHeartButton
                    favorite={isFav}
                    accessibilityLabel={isFav ? `Remove ${v.name} from favorites` : `Add ${v.name} to favorites`}
                    style={s.heartBtn}
                    activeStyle={s.heartBtnActive}
                    pressedStyle={s.favoritePressed}
                    onToggle={(source) => toggleFavorite(v, source)}
                    size={15}
                    color="#3A3035"
                    activeIconColor={PINK}
                  />
                </View>
              );
            })}
          </ScrollView>
          )}
          {!vendorsLoading && !topRatedVendors.length ? (
            <Text style={[s.emptyVendors, { color: muted }]}>No rated vendors yet.</Text>
          ) : null}
        </View>

        {/* ── List Your Business ── */}
        <View style={[s.listBanner, { width: featureWidth }]}>
          <Image
            source={require("../../assets/list-business-bg.png")}
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
              <Text style={[s.listSub, { color: isDark ? "#FBCFE8" : "#BE185D" }]}>
                Join thousands of vendors{"\n"}growing with us
              </Text>
              <TouchableOpacity
                style={s.registerBtn}
                onPress={() => router.push("/BecomeVendor")}
              >
                <Text style={s.registerTxt}>Register Now</Text>
                <ChevronRight size={13} color="#FFF" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

      </ScrollView>
      <HomeFilterModal
        visible={filtersVisible}
        dark={isDark}
        value={filters}
        city={city}
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
  header:          { minHeight: 54, alignSelf: "center", flexDirection: "row", alignItems: "center", position: "relative" },
  headerLocation:  { zIndex: 2, minWidth: 54, maxWidth: 100, flexShrink: 1, alignItems: "flex-start", justifyContent: "center" },
  headerLogo:      { position: "absolute", zIndex: 1, left: "50%", height: 48, alignItems: "center", justifyContent: "center" },
  headerActions:   { zIndex: 2, marginLeft: "auto", flexDirection: "row", flexShrink: 0, alignItems: "center" },
  headerAction:    { width: 36, height: 44, borderRadius: 18, alignItems: "center", justifyContent: "center", position: "relative" },
  badge:           { position: "absolute", top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: PINK, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  badgeTxt:        { color: "#FFF", fontSize: 8, fontWeight: "800" },

  /* Greeting */
  greetingText:    { fontSize: 12, lineHeight: 17, fontWeight: "600", marginBottom: 2 },
  greetingTitle:   { fontFamily: "serif", fontSize: 22, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  greetingTitleDesktop: { fontSize: 27, lineHeight: 31 },
  greetingAccent:  { color: PINK, fontStyle: "italic" },

  /* Greeting */
  greetingBlock:   { alignSelf: "center", marginTop: 5, marginBottom: 6 },

  /* Search and filters */
  searchPad:       { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2, marginBottom: 12 },
  searchBar:       { flex: 1, minWidth: 0, height: 46 },
  filterBtn:       { width: 46, height: 46, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: "#F04478", shadowOpacity: 0, elevation: 0 },
  filterBtnNarrow: { width: 44 },
  filterCount:     { position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  filterCountText: { color: "#FFF", fontSize: 8, fontWeight: "900" },

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
  },

  /* Hero split (tablet/desktop): left text stretches to image height; image owns 16:9 */
  heroSplitCard:     { alignSelf: "center", flexDirection: "row", alignItems: "stretch", marginTop: 6, marginBottom: 22, borderWidth: 1, borderRadius: 28, overflow: "hidden" },
  heroSplitLeft:     { position: "relative", overflow: "hidden", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 22, flexShrink: 0, minWidth: 0 },
  heroSplitRight:    { flexShrink: 0, overflow: "hidden", aspectRatio: HERO_IMAGE_ASPECT },
  heroSplitDescription:{ fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 320 },
  heroSplitSearchRow:{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },

  /* Categories */
  section:         { alignSelf: "center", marginBottom: 12 },
  catGrid:         { flexDirection: "row", flexWrap: "wrap" },
  showLessBtn:     { alignSelf: "center", minHeight: 38, marginTop: 1, marginBottom: 8, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: "rgba(233,30,99,.25)", backgroundColor: "rgba(233,30,99,.07)", alignItems: "center", justifyContent: "center" },
  showLessPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  showLessText:    { color: PINK, fontSize: 11, fontWeight: "800" },

  /* Trending */
  trendingSection:{ alignSelf: "center", marginBottom: 23 },
  trendingRow:     { gap: 10, paddingTop: 2, paddingRight: 2 },
  trendingChip:    { minHeight: 43, minWidth: 190, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#7F5065", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  trendingText:    { fontSize: 11, fontWeight: "600" },

  /* Popular Near You */
  popularSection:  { alignSelf: "center", marginBottom: 23 },
  nearBadge:       { minHeight: 26, maxWidth: 120, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 3 },
  nearBadgeText:   { flexShrink: 1, color: PINK, fontSize: 9, fontWeight: "700" },
  vendorScroll:    { gap: 10, paddingHorizontal: 2, paddingRight: 18, paddingBottom: 10 },
  vendorCard:      { borderWidth: 1, borderRadius: 16, overflow: "hidden", shadowColor: "#55303F", shadowOpacity: 0.10, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  vendorMain:      { flex: 1 },
  vendorImgWrap:   { position: "relative", overflow: "hidden" },
  vendorImg:       { width: "100%", height: "100%" },
  vendorNearby:    { position: "absolute", top: 8, left: 8, minHeight: 25, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,.94)" },
  vendorNearbyText:{ color: PINK, fontSize: 8.5, fontWeight: "800" },
  heartBtn:        { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,.94)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  heartBtnActive:  { backgroundColor: "rgba(255,255,255,.94)" },
  favoritePressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  imgBottomRow:    { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: 7 },
  ratingBadge:     { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(27,25,27,.72)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20 },
  ratingBadgeTxt:  { color: "#FFF", fontSize: 9.5, fontWeight: "800" },
  verifiedBadge:   { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: PINK, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,.9)" },
  verifiedTxt:     { color: "#FFF", fontSize: 8, fontWeight: "800" },
  vendorInfo:      { paddingHorizontal: 10, paddingVertical: 9 },
  vendorName:      { fontFamily: "serif", fontSize: 13, fontWeight: "700", marginBottom: 2 },
  vendorNameDesktop:{ fontSize: 16 },
  vendorCat:       { fontSize: 9.5, marginBottom: 5 },
  vendorMeta:      { flexDirection: "row", alignItems: "center", gap: 3 },
  vendorLoc:       { fontSize: 8.5, flex: 1 },
  vendorPrice:     { maxWidth: "52%", fontSize: 8.5, fontWeight: "700", color: PINK },
  emptyVendors:    { paddingVertical: 20, textAlign: "center", fontSize: 11 },

  /* List Your Business */
  listBanner:      { alignSelf: "center", borderRadius: 20, overflow: "hidden", marginBottom: 20 },
  listBannerImg:   { width: "100%" },
  listOverlay:     { justifyContent: "center" },
  listLeft:        { width: "55%", paddingLeft: 18, paddingVertical: 18 },
  listTitle:       { fontSize: 17, fontWeight: "800", color: PINK, marginBottom: 4 },
  listSub:         { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  registerBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PINK, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 50 },
  registerTxt:     { color: "#FFF", fontSize: 13, fontWeight: "700" },
});
