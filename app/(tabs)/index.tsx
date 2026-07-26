import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
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
  Building2,
  UtensilsCrossed,
  Camera,
  Palette,
  Sparkles,
  Hand,
  Headphones,
  Shirt,
  User,
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
import HomeFilterModal, { DEFAULT_HOME_FILTERS, type HomeFilters } from "@/components/home/HomeFilterModal";
import { useCustomerLocation } from "@/context/LocationContext";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { useNotifications } from "@/context/NotificationContext";
import {
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";

const PINK = "#E91E63";
const TRENDING_SEARCHES = ["Wedding Photographers", "Mandap Decorators", "Destination Wedding", "Bridal Makeup"];

const categories = [
  { id: "1",  name: "Venues",         icon: Building2,       color: "#F97316", bg: "#FFF3EA" },
  { id: "2",  name: "Caterers",       icon: UtensilsCrossed, color: "#EC4899", bg: "#FFF0F7" },
  { id: "3",  name: "Photographers",  icon: Camera,          color: "#3B82F6", bg: "#EFF6FF" },
  { id: "4",  name: "Decorators",     icon: Palette,         color: "#22C55E", bg: "#F0FDF4" },
  { id: "5",  name: "DJs",            icon: Headphones,      color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "6",  name: "Makeup\nArtists",icon: Sparkles,        color: "#EF4444", bg: "#FFF1F1" },
  { id: "7",  name: "Mehndi\nArtists",icon: Hand,            color: "#F97316", bg: "#FFF3EA" },
  { id: "8",  name: "Bridal\nWear",   icon: Shirt,           color: "#EC4899", bg: "#FFF0F7" },
  { id: "9",  name: "Groom\nWear",    icon: User,            color: "#3B82F6", bg: "#EFF6FF" },
  { id: "15", name: "More\nCategories",icon: MoreHorizontal, color: "#6B7280", bg: "#F3F4F6" },
];

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchText, setSearchText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_HOME_FILTERS);
  const [liveVendors, setLiveVendors] = useState<PublicVendorListing[]>([]);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { city } = useCustomerLocation();
  const { unreadCount } = useNotifications();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 1100;
  const horizontalInset = isDesktop ? 24 : screenWidth < 380 ? 14 : screenWidth < 480 ? 18 : 20;
  const featureWidth = Math.min(screenWidth - horizontalInset * 2, 1280);
  const categoryColumns = isDesktop ? 10 : 5;
  const categoryItemWidth = featureWidth / categoryColumns;
  const categoryIconSize = isDesktop
    ? 76
    : screenWidth >= 600
      ? 72
      : Math.min(58, Math.max(48, categoryItemWidth - 4));
  const vendorCardWidth = isDesktop ? 360 : Math.min(280, Math.max(250, screenWidth * 0.72));
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

  const bg     = isDark ? "#141414" : "#FFFFFF";
  const card   = isDark ? "#1E1E1E" : "#FFFFFF";
  const text   = isDark ? "#F5F0F3" : "#111827";
  const muted  = isDark ? "#AAA0A5" : "#6B7280";
  const border = isDark ? "#2A2A2A" : "#E5E7EB";

  const catNameForNav = (name: string) => name.replace(/\n/g, " ");
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
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Compact mobile header ── */}
        {!isDesktop ? (
          <HomeReveal direction="down" style={[s.header, { width: featureWidth }]}>
            <View style={s.headerLocation}>
              <LocationSelector dark={isDark} compact={screenWidth < 380} />
            </View>

            <View pointerEvents="none" style={s.logoWrap}>
              <Text style={s.logoText}>
                <Text style={s.logoPink}>Royal</Text>
                <Text style={[s.logoBlack, { color: text }]}>Lagn</Text>
              </Text>
            </View>

            <View style={s.headerRight}>
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

        {/* ── Global search ── */}
        <HomeReveal delay={45} style={[s.searchPad, { width: featureWidth }]}>
          <CompactSearchBar
            accessibilityLabel="Search vendors, categories and services"
            value={searchText}
            onChangeText={setSearchText}
            onSubmit={submitSearch}
            placeholder="Search vendors, categories, services…"
            dark={isDark}
            style={s.searchBar}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open filters"
            style={[s.filterBtn, screenWidth < 380 && s.filterBtnNarrow, { backgroundColor: card }]}
            onPress={() => setFiltersVisible(true)}
            activeOpacity={0.76}
          >
            <SlidersHorizontal size={16} color={PINK} />
            <Text numberOfLines={1} style={[s.filterTxt, screenWidth < 380 && s.filterTxtNarrow]}>
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Text>
          </TouchableOpacity>
        </HomeReveal>

        {/* ── Hero carousel ── */}
        <HomeReveal delay={85} style={[s.heroPad, { width: featureWidth }]}>
          <HeroCarousel width={featureWidth} city={city} desktop={isDesktop} />
        </HomeReveal>

        {/* ── Top Categories ── */}
        <View style={[s.section, { width: featureWidth }]}>
          <View style={s.sectionHead}>
            <Text style={[s.sectionTitle, { color: text }]}>Top Categories</Text>
            <TouchableOpacity
              style={s.viewAllRow}
              onPress={() => router.push("/(tabs)/Categories")}
            >
              <Text style={s.viewAll}>View All</Text>
              <ChevronRight size={13} color={PINK} />
            </TouchableOpacity>
          </View>

          <View style={s.catGrid}>
            {categories.map((cat) => {
              const Icon = cat.icon;
              const catBg = isDark ? cat.color + "22" : cat.bg;
              const catBorder = isDark ? cat.color + "44" : cat.color + "33";
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catItem, { width: categoryItemWidth }]}
                  onPress={() =>
                    cat.id === "15"
                      ? router.push("/(tabs)/Categories")
                      : router.push({
                          pathname: "/VendorsListing",
                          params: { category: catNameForNav(cat.name) },
                        })
                  }
                  activeOpacity={0.7}
                >
                  <View style={[s.catIconWrap, { width: categoryIconSize, height: categoryIconSize, backgroundColor: catBg, borderColor: catBorder }]}>
                    <Icon size={Math.round(categoryIconSize * 0.42)} color={cat.color} strokeWidth={1.8} />
                  </View>
                  <Text
                    style={[s.catLabel, screenWidth < 380 && s.catLabelNarrow, { color: isDark ? "#DDD0D8" : "#374151" }]}
                    numberOfLines={2}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Trending searches ── */}
        <View style={[s.trendingSection, { width: featureWidth, borderTopColor: border }]}>
          <Text style={[s.sectionTitle, { color: text }]}>Trending Searches</Text>
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
          <View style={s.sectionHead}>
            <View style={s.popularTitleRow}>
              <Text style={[s.sectionTitle, { color: text }]}>Popular Near You</Text>
              <View style={[s.nearBadge, { backgroundColor: isDark ? "#351D28" : "#FFF1F6", borderColor: isDark ? "#5B2940" : "#F7C7D9" }]}>
                <MapPin size={11} color={PINK} />
                <Text style={s.nearBadgeText}>Near {city}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.viewAllRow}
              onPress={() => router.push("/(tabs)/Categories")}
            >
              <Text style={s.viewAll}>View All</Text>
              <ChevronRight size={13} color={PINK} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
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
                    <View style={[s.vendorImgWrap, { height: Math.round(vendorCardWidth * 0.55) }]}>
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
                      <Text style={[s.vendorName, { color: text }]} numberOfLines={1}>{v.name}</Text>
                      <Text style={[s.vendorCat, { color: muted }]} numberOfLines={1}>{v.category}</Text>
                      <View style={s.vendorMeta}>
                        <MapPin size={11} color={muted} />
                        <Text style={[s.vendorLoc, { color: muted }]}>{v.location}</Text>
                        <Text style={[s.vendorPrice, { color: text }]}>{v.startingPrice} onwards</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={isFav ? `Remove ${v.name} from favorites` : `Add ${v.name} to favorites`}
                    style={[s.heartBtn, isFav && s.heartBtnActive]}
                    onPress={() => toggleFavorite(v)}
                  >
                    <Heart size={17} color={isFav ? "#FFF" : "#3A3035"} fill={isFav ? "#FFF" : "transparent"} />
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

const s = StyleSheet.create({
  root:            { flex: 1 },
  scroll:          { paddingBottom: 24 },

  /* Header */
  header:          { minHeight: 52, alignSelf: "center", flexDirection: "row", alignItems: "center" },
  headerLocation:  { width: "50%", minWidth: 0, paddingRight: 52, alignItems: "flex-start", justifyContent: "center" },
  headerRight:     { width: "50%", minWidth: 0, paddingLeft: 52, alignItems: "flex-end", justifyContent: "center" },
  logoWrap:        { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  logoText:        { fontFamily: "System", fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  logoPink:        { color: PINK },
  logoBlack:       {},
  bellWrap:        { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", position: "relative" },
  badge:           { position: "absolute", top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: PINK, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  badgeTxt:        { color: "#FFF", fontSize: 8, fontWeight: "800" },

  /* Search and filters */
  searchPad:       { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 14 },
  searchBar:       { flex: 1, minWidth: 0 },
  filterBtn:       { height: 58, minWidth: 82, maxWidth: 116, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 11, borderRadius: 18, borderWidth: 1.5, borderColor: PINK },
  filterBtnNarrow: { minWidth: 76, paddingHorizontal: 8, gap: 4 },
  filterTxt:       { color: PINK, fontFamily: "System", fontSize: 12, fontWeight: "800" },
  filterTxtNarrow: { fontSize: 11 },

  /* Hero */
  heroPad:         { alignSelf: "center", marginBottom: 22 },

  /* Categories */
  section:         { alignSelf: "center", marginBottom: 10 },
  sectionHead:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle:    { fontFamily: "serif", fontSize: 22, lineHeight: 29, fontWeight: "700", letterSpacing: -0.35 },
  viewAllRow:      { flexDirection: "row", alignItems: "center", gap: 1 },
  viewAll:         { color: PINK, fontSize: 13, fontWeight: "600" },
  catGrid:         { flexDirection: "row", flexWrap: "wrap" },
  catItem:         { alignItems: "center", marginBottom: 19, paddingHorizontal: 2 },
  catIconWrap:     { borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 7, borderWidth: 1 },
  catLabel:        { fontSize: 10.5, textAlign: "center", lineHeight: 14, fontWeight: "500" },
  catLabelNarrow:  { fontSize: 9.5, lineHeight: 12 },

  /* Trending */
  trendingSection:{ alignSelf: "center", borderTopWidth: 1, paddingTop: 14, marginBottom: 23 },
  trendingRow:     { gap: 10, paddingTop: 9, paddingRight: 2 },
  trendingChip:    { minHeight: 43, minWidth: 190, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#7F5065", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  trendingText:    { fontSize: 11, fontWeight: "600" },

  /* Popular Near You */
  popularSection:  { alignSelf: "center", marginBottom: 23 },
  popularTitleRow: { minWidth: 0, flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  nearBadge:       { minHeight: 26, maxWidth: 120, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 3 },
  nearBadgeText:   { flexShrink: 1, color: PINK, fontSize: 9, fontWeight: "700" },
  vendorScroll:    { gap: 14, paddingHorizontal: 2, paddingBottom: 12 },
  vendorCard:      { borderWidth: 1, borderRadius: 18, overflow: "hidden", shadowColor: "#55303F", shadowOpacity: 0.11, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  vendorMain:      { flex: 1 },
  vendorImgWrap:   { position: "relative", overflow: "hidden" },
  vendorImg:       { width: "100%", height: "100%" },
  heartBtn:        { position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,.94)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  heartBtnActive:  { backgroundColor: PINK },
  imgBottomRow:    { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: 9 },
  ratingBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(27,25,27,.72)", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20 },
  ratingBadgeTxt:  { color: "#FFF", fontSize: 11, fontWeight: "800" },
  verifiedBadge:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: PINK, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,.9)" },
  verifiedTxt:     { color: "#FFF", fontSize: 9, fontWeight: "800" },
  vendorInfo:      { paddingHorizontal: 13, paddingVertical: 12 },
  vendorName:      { fontFamily: "serif", fontSize: 16, fontWeight: "700", marginBottom: 2 },
  vendorCat:       { fontSize: 10.5, marginBottom: 7 },
  vendorMeta:      { flexDirection: "row", alignItems: "center", gap: 3 },
  vendorLoc:       { fontSize: 10, flex: 1 },
  vendorPrice:     { fontSize: 10, fontWeight: "700", color: PINK },
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
