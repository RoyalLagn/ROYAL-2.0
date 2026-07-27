import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Platform,
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
  Search,
  ChevronRight,
  Heart,
  MoreHorizontal,
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
import { useCustomerLocation } from "@/context/LocationContext";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { useNotifications } from "@/context/NotificationContext";
import {
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";
import { useMobileTabBarHeight } from "@/components/MobileTabBar";
import { usePublicAuth } from "@/context/PublicAuthContext";

const PINK = "#E91E63";
const TRENDING_SEARCHES = ["Wedding Photographers", "Mandap Decorators", "Destination Wedding", "Bridal Makeup"];
const GLASS_WEB_STYLE = Platform.OS === "web" ? ({ backdropFilter: "blur(10px)" } as never) : undefined;

const categories = [
  { id: "1", name: "Venues", image: require("../../assets/images/category-icons-v3/venues.png") },
  { id: "2", name: "Caterers", image: require("../../assets/images/category-icons-v3/caterers.png") },
  { id: "3", name: "Photographers", image: require("../../assets/images/category-icons-v3/photographers.png") },
  { id: "4", name: "Decorators", image: require("../../assets/images/category-icons-v3/decorators.png") },
  { id: "5", name: "DJs", image: require("../../assets/images/category-icons-v3/djs.png") },
  { id: "6", name: "Makeup Artists", image: require("../../assets/images/category-icons-v3/makeup-artists.png") },
  { id: "7", name: "Mehndi Artists", image: require("../../assets/images/category-icons-v3/mehndi-artists.png") },
  { id: "8", name: "Bridal Wear", image: require("../../assets/images/category-icons-v3/bridal-wear.png") },
  { id: "9", name: "Groom Wear", image: require("../../assets/images/category-icons-v3/groom-wear.png") },
  { id: "10", name: "Jewellery & Accessories", image: require("../../assets/images/category-icons-v3/jewellery-accessories.png") },
  { id: "11", name: "Pandits", image: require("../../assets/images/category-icons-v3/pandits.png") },
  { id: "12", name: "Invites & Cards", image: require("../../assets/images/category-icons-v3/invites-cards.png") },
  { id: "13", name: "Dance & Choreography", image: require("../../assets/images/category-icons-v3/dance-choreography.png") },
  { id: "14", name: "Pre-wedding Shoot", image: require("../../assets/images/category-icons-v3/pre-wedding-shoot.png") },
  { id: "15", name: "Wedding Bands", image: require("../../assets/images/category-icons-v3/wedding-bands.png") },
];
const PRIMARY_CATEGORY_COUNT = 9;

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchText, setSearchText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_HOME_FILTERS);
  const [liveVendors, setLiveVendors] = useState<PublicVendorListing[]>([]);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { city } = useCustomerLocation();
  const { unreadCount } = useNotifications();
  const { profile } = usePublicAuth();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const tabBarHeight = useMobileTabBarHeight();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 1100;
  const horizontalInset = isDesktop ? 24 : screenWidth < 380 ? 14 : screenWidth < 480 ? 18 : 20;
  const featureWidth = Math.min(screenWidth - horizontalInset * 2, 1280);
  const categoryColumns = isDesktop ? 6 : 5;
  const categoryItemWidth = featureWidth / categoryColumns;
  const categoryIconSize = isDesktop
    ? 108
    : screenWidth >= 600
      ? 88
      : Math.min(58, Math.max(46, categoryItemWidth - 16));
  const vendorCardWidth = isDesktop
    ? 360
    : screenWidth >= 600
      ? 230
      : Math.min(168, Math.max(136, screenWidth * 0.4));
  const listBannerHeight = Math.min(Math.round(featureWidth * (887 / 1774)), 220);

  useEffect(() => {
    let active = true;
    const load = () => {
      getApprovedPublicVendors()
        .then((vendors) => {
          if (active) setLiveVendors(vendors);
        })
        .catch(() => {
          if (active) setLiveVendors([]);
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
    return liveVendors
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
        && (!filters.nearbyOnly || vendor.location.toLowerCase().includes(city.toLowerCase()))
      )
      .sort((a, b) => {
        if (filters.sort === "rating") return b.rating - a.rating;
        if (filters.sort === "price") {
          return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
            - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
        }
        return Number(b.location.includes(city)) - Number(a.location.includes(city)) || b.rating - a.rating;
      });
  }, [city, filters, getRating, liveVendors]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: "#FFFFFF" }]} edges={["top"]}>
      <ScrollView
        style={{ backgroundColor: bg }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingBottom: isDesktop ? 32 : tabBarHeight },
        ]}
      >

        {/* ── Compact mobile header ── */}
        {!isDesktop ? (
          <HomeReveal direction="down" style={[s.header, { width: featureWidth }]}>
            <View style={s.headerSide}><LocationSelector dark={isDark} compact /></View>

            <View pointerEvents="none" style={s.headerLogo}>
              <Image
                source={isDark
                  ? require("../../assets/Logo/black-logo-cropped.png")
                  : require("../../assets/Logo/white-logo-cropped.png")}
                resizeMode="contain"
                accessibilityLabel="RoyalLagn Wedding Planner"
                style={[s.headerLogoImage, screenWidth < 360 && s.headerLogoImageNarrow]}
              />
            </View>

            <View style={[s.headerSide, s.headerRight]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                style={s.bellWrap}
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
            </View>
          </HomeReveal>
        ) : null}

        <HomeReveal delay={25} style={[s.greetingBlock, { width: featureWidth }]}>
          <Text style={[s.greetingText, { color: muted }]}>
            {greeting}, {firstName} 👋
          </Text>
          <Text style={[s.greetingTitle, isDesktop && s.greetingTitleDesktop, { color: text }]}>
            Find your <Text style={s.greetingAccent}>perfect</Text>{"\n"}wedding team
          </Text>
        </HomeReveal>

        {/* ── Global search ── */}
        <HomeReveal delay={45} style={[s.searchPad, { width: featureWidth }]}>
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
        </HomeReveal>

        {/* ── Hero carousel ── */}
        <HomeReveal delay={85} style={[s.heroPad, { width: featureWidth }]}>
          <HeroCarousel width={featureWidth} city={city} desktop={isDesktop} />
        </HomeReveal>

        {/* ── Top Categories ── */}
        <View style={[s.section, { width: featureWidth }]}>
          <SectionHeader
            title="Top Categories"
            dark={isDark}
            actionLabel="View All"
            onActionPress={() => router.push("/(tabs)/Categories")}
          />

          <View style={s.catGrid}>
            {displayedCategories.map((cat) => (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${cat.name}`}
                onPress={() => openCategory(cat.name)}
                style={({ pressed, hovered }) => [
                  s.catItem,
                  { width: categoryItemWidth },
                  hovered && Platform.OS === "web" && s.catItemHover,
                  pressed && s.catItemPressed,
                ]}
              >
                <View style={[s.catIconWrap, { width: categoryIconSize, height: categoryIconSize }, isDark && s.catIconWrapDark, GLASS_WEB_STYLE]}>
                  <Image source={cat.image} style={s.catImage} resizeMode="cover" />
                </View>
                <Text
                  style={[s.catLabel, screenWidth < 380 && s.catLabelNarrow, { color: isDark ? "#DDD0D8" : "#374151" }]}
                  numberOfLines={2}
                >
                  {cat.name}
                </Text>
              </Pressable>
            ))}
            {!showAllCategories ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show more categories"
                onPress={() => setShowAllCategories(true)}
                style={({ pressed, hovered }) => [
                  s.catItem,
                  { width: categoryItemWidth },
                  hovered && Platform.OS === "web" && s.catItemHover,
                  pressed && s.catItemPressed,
                ]}
              >
                <View style={[s.catIconWrap, s.moreCategoryTile, { width: categoryIconSize, height: categoryIconSize }, isDark && s.moreCategoryTileDark, GLASS_WEB_STYLE]}>
                  <View style={s.moreIconHalo}>
                    <MoreHorizontal size={Math.round(categoryIconSize * 0.42)} color={PINK} strokeWidth={2} />
                  </View>
                </View>
                <Text style={[s.catLabel, screenWidth < 380 && s.catLabelNarrow, { color: isDark ? "#DDD0D8" : "#374151" }]} numberOfLines={2}>More Categories</Text>
              </Pressable>
            ) : null}
          </View>
          {showAllCategories ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Show fewer categories" onPress={() => setShowAllCategories(false)} style={({ pressed }) => [s.showLessBtn, pressed && s.catItemPressed]}>
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
                      <Image source={{ uri: v.image }} style={s.vendorImg} resizeMode="cover" />
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
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={isFav ? `Remove ${v.name} from favorites` : `Add ${v.name} to favorites`}
                    style={[s.heartBtn, isFav && s.heartBtnActive]}
                    onPress={() => toggleFavorite(v)}
                  >
                    <Heart size={15} color={isFav ? "#FFF" : "#3A3035"} fill={isFav ? "#FFF" : "transparent"} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
          {!nearbyVendors.length ? (
            <Text style={[s.emptyVendors, { color: muted }]}>No vendors match these filters. Try clearing one filter.</Text>
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
  header:          { minHeight: 54, alignSelf: "center", flexDirection: "row", alignItems: "center" },
  headerSide:      { flex: 1, minWidth: 0, alignItems: "flex-start", justifyContent: "center" },
  headerLogo:      { flex: 1.55, minWidth: 0, height: 48, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  headerLogoImage: { width: 150, height: 46 },
  headerLogoImageNarrow: { width: 126, height: 40 },
  headerRight:     { alignItems: "flex-end" },
  bellWrap:        { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", position: "relative" },
  badge:           { position: "absolute", top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: PINK, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  badgeTxt:        { color: "#FFF", fontSize: 8, fontWeight: "800" },

  /* Greeting */
  greetingBlock:   { alignSelf: "center", marginTop: 5, marginBottom: 8 },
  greetingText:    { fontSize: 12, lineHeight: 17, fontWeight: "600", marginBottom: 2 },
  greetingTitle:   { fontFamily: "serif", fontSize: 22, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  greetingTitleDesktop: { fontSize: 27, lineHeight: 31 },
  greetingAccent:  { color: PINK, fontStyle: "italic" },

  /* Search and filters */
  searchPad:       { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 14 },
  searchBar:       { flex: 1, minWidth: 0, height: 46 },
  filterBtn:       { width: 46, height: 46, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: "#F04478", shadowOpacity: 0, elevation: 0 },
  filterBtnNarrow: { width: 44 },
  filterCount:     { position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  filterCountText: { color: "#FFF", fontSize: 8, fontWeight: "900" },

  /* Hero */
  heroPad:         { alignSelf: "center", marginBottom: 22 },

  /* Categories */
  section:         { alignSelf: "center", marginBottom: 12 },
  catGrid:         { flexDirection: "row", flexWrap: "wrap" },
  catItem:         { alignItems: "center", marginBottom: 23, paddingHorizontal: 5 },
  catItemHover:    { transform: [{ translateY: -3 }, { scale: 1.025 }] },
  catItemPressed:  { opacity: 0.9, transform: [{ scale: 0.975 }] },
  catIconWrap:     { overflow: "hidden", borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8, borderWidth: 1, borderColor: "rgba(233,30,99,.32)", backgroundColor: "rgba(255,248,251,.82)", shadowColor: "#E91E63", shadowOpacity: 0.14, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  catIconWrapDark: { backgroundColor: "rgba(43,24,35,.82)", borderColor: "rgba(255,84,141,.38)", shadowColor: "#FF4F8B", shadowOpacity: 0.2 },
  moreCategoryTile:{ backgroundColor: "rgba(255,244,248,.92)", borderColor: "rgba(233,30,99,.38)" },
  moreCategoryTileDark: { backgroundColor: "rgba(73,37,54,.82)", borderColor: "rgba(255,99,151,.40)" },
  moreIconHalo:    { width: "64%", height: "64%", borderRadius: 999, backgroundColor: "rgba(233,30,99,.10)", borderWidth: 1, borderColor: "rgba(233,30,99,.24)", alignItems: "center", justifyContent: "center" },
  catImage:        { width: "100%", height: "100%", borderRadius: 15 },
  catLabel:        { minHeight: 29, fontSize: 9.5, textAlign: "center", lineHeight: 12, fontWeight: "600" },
  catLabelNarrow:  { fontSize: 9, lineHeight: 11.5 },
  showLessBtn:     { alignSelf: "center", minHeight: 38, marginTop: 1, marginBottom: 8, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: "rgba(233,30,99,.25)", backgroundColor: "rgba(233,30,99,.07)", alignItems: "center", justifyContent: "center" },
  showLessText:    { color: PINK, fontSize: 11, fontWeight: "800" },

  /* Trending */
  trendingSection:{ alignSelf: "center", marginBottom: 23 },
  trendingRow:     { gap: 10, paddingTop: 2, paddingRight: 2 },
  trendingChip:    { minHeight: 43, minWidth: 190, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#7F5065", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
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
  heartBtn:        { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,.94)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  heartBtnActive:  { backgroundColor: PINK },
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
