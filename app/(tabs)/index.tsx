import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Alert,
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
import { getVendorById } from "@/data/vendorData";
import HeroCarousel from "@/components/home/HeroCarousel";
import HomeReveal from "@/components/home/HomeReveal";
import LocationSelector from "@/components/home/LocationSelector";
import HomeFilterModal, { DEFAULT_HOME_FILTERS, type HomeFilters } from "@/components/home/HomeFilterModal";
import { useCustomerLocation } from "@/context/LocationContext";
import { TEMP_AVAILABLE_VENDOR_IDS } from "@/data/homeAvailability";
import CompactSearchBar from "@/components/listing/CompactSearchBar";

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

const popularVendors = [
  { id:"d1",  name:"Dream Decorators",         category:"Decorators",    rating:4.9, startingPrice:"₹45k", location:"Pune",  image:"https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400&auto=format&fit=crop&q=80" },
  { id:"p1",  name:"Magic Moments Photography",category:"Photographers", rating:4.8, startingPrice:"₹25k", location:"Pune",  image:"https://images.unsplash.com/photo-1606800052052-a08af7148866?w=400&auto=format&fit=crop&q=80" },
  { id:"c1",  name:"Royal Caterers",           category:"Caterers",      rating:4.7, startingPrice:"₹35k", location:"Pune",  image:"https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&auto=format&fit=crop&q=80" },
  { id:"v1",  name:"Royal Mahal Banquet",      category:"Venues",        rating:4.9, startingPrice:"₹2.5L",location:"Lonavala",image:"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=400&auto=format&fit=crop&q=80" },
  { id:"m1",  name:"Glam Studio by Priya",     category:"Makeup Artists",rating:4.9, startingPrice:"₹15k", location:"Pune",  image:"https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&auto=format&fit=crop&q=80" },
  { id:"me1", name:"Henna Hands",              category:"Mehndi Artists",rating:4.9, startingPrice:"₹8k",  location:"Pune",  image:"https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=400&auto=format&fit=crop&q=80" },
  { id:"dj1", name:"DJ RaJ Sound",             category:"DJs",           rating:4.9, startingPrice:"₹20k", location:"Pune",  image:"https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80" },
  { id:"bw1", name:"Rani Bridal House",        category:"Bridal Wear",   rating:4.9, startingPrice:"₹25k", location:"Pune",  image:"https://images.unsplash.com/photo-1594552072238-b8f02c8f5c22?w=400&auto=format&fit=crop&q=80" },
  { id:"gw1", name:"Nawab Sherwanis",          category:"Groom Wear",    rating:4.9, startingPrice:"₹20k", location:"Pune",  image:"https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&auto=format&fit=crop&q=80" },
  { id:"pw1", name:"Love Stories Studio",      category:"Pre Wedding Shoot",rating:4.9,startingPrice:"₹20k",location:"Lonavala",image:"https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=400&auto=format&fit=crop&q=80" },
];

function parseCompactPrice(value: string) {
  const normalized = value.replace(/[₹,\s]/g, "").toLowerCase();
  const amount = Number.parseFloat(normalized) || 0;
  if (normalized.includes("l")) return amount * 100000;
  if (normalized.includes("k")) return amount * 1000;
  return amount;
}

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchText, setSearchText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_HOME_FILTERS);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { city } = useCustomerLocation();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 1100;
  const featureWidth = Math.min(screenWidth - (isDesktop ? 48 : 40), 1280);
  const categoryColumns = isDesktop ? 10 : 5;
  const categoryItemWidth = featureWidth / categoryColumns;
  const categoryIconSize = isDesktop ? 76 : screenWidth >= 600 ? 72 : 58;
  const vendorCardWidth = isDesktop ? 360 : Math.min(280, Math.max(250, screenWidth * 0.72));
  const listBannerHeight = Math.min(Math.round(featureWidth * (887 / 1774)), 220);

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
    return popularVendors
      .map((vendor) => {
        const current = getRating(vendor.id, vendor.rating, 0);
        return { ...vendor, rating: current.rating, reviews: current.reviews };
      })
      .filter((vendor) =>
        (!filters.minimumRating || vendor.rating >= filters.minimumRating)
        && (!filters.maximumBudget || parseCompactPrice(vendor.startingPrice) <= filters.maximumBudget)
        && (!filters.category || vendor.category === filters.category)
        && (!filters.availabilityOnly || TEMP_AVAILABLE_VENDOR_IDS.has(vendor.id))
        && (!filters.nearbyOnly || vendor.location.toLowerCase().includes(city.toLowerCase()))
      )
      .sort((a, b) => {
        if (filters.sort === "rating") return b.rating - a.rating;
        if (filters.sort === "price") return parseCompactPrice(a.startingPrice) - parseCompactPrice(b.startingPrice);
        return Number(b.location.includes(city)) - Number(a.location.includes(city)) || b.rating - a.rating;
      });
  }, [city, filters, getRating]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Compact mobile header ── */}
        {!isDesktop ? (
          <HomeReveal direction="down" style={[s.header, { width: featureWidth }]}>
            <View style={s.headerSide}>
              <LocationSelector dark={isDark} />
            </View>

            <View pointerEvents="none" style={s.logoWrap}>
              <Text style={s.logoText}>
                <Text style={s.logoPink}>Royal</Text>
                <Text style={[s.logoBlack, { color: text }]}>Lagn</Text>
              </Text>
            </View>

            <View style={[s.headerSide, s.headerRight]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Notifications, 1 unread"
                style={s.bellWrap}
                onPress={() => Alert.alert("Notifications", "You have 1 new notification.")}
                activeOpacity={0.7}
              >
                <Bell size={20} color={text} />
                <View style={s.badge}><Text style={s.badgeTxt}>1</Text></View>
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
            style={[s.filterBtn, { backgroundColor: card }]}
            onPress={() => setFiltersVisible(true)}
            activeOpacity={0.76}
          >
            <SlidersHorizontal size={16} color={PINK} />
            <Text style={s.filterTxt}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</Text>
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
                  <Text style={[s.catLabel, { color: isDark ? "#DDD0D8" : "#374151" }]} numberOfLines={2}>
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
              const vendorResult = getVendorById(v.id);
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
                    onPress={() => {
                      if (vendorResult) toggleFavorite({ ...vendorResult.vendor, category: vendorResult.category });
                    }}
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
  header:          { minHeight: 56, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSide:      { flex: 1, minWidth: 0, justifyContent: "center" },
  headerRight:     { alignItems: "flex-end" },
  logoWrap:        { flex: 1, alignItems: "center" },
  logoText:        { fontFamily: "System", fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  logoPink:        { color: PINK },
  logoBlack:       {},
  bellWrap:        { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", position: "relative" },
  badge:           { position: "absolute", top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: PINK, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  badgeTxt:        { color: "#FFF", fontSize: 8, fontWeight: "800" },

  /* Search and filters */
  searchPad:       { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8, marginBottom: 14 },
  searchBar:       { flex: 1 },
  filterBtn:       { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1.5, borderColor: PINK },
  filterTxt:       { color: PINK, fontFamily: "System", fontSize: 12, fontWeight: "800" },

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
