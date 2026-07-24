import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
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
  X,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { useFavorites } from "@/context/FavoritesContext";
import { getVendorById } from "@/data/vendorData";
import HeroCarousel from "@/components/home/HeroCarousel";
import HomeReveal from "@/components/home/HomeReveal";
import LocationSelector from "@/components/home/LocationSelector";
import HomeFilterModal, { DEFAULT_HOME_FILTERS, type HomeFilters } from "@/components/home/HomeFilterModal";
import { useCustomerLocation } from "@/context/LocationContext";

const PINK = "#E91E63";

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

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchText, setSearchText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_HOME_FILTERS);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { city } = useCustomerLocation();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 1100;
  const featureWidth = Math.min(screenWidth - (isDesktop ? 48 : 40), 1280);
  const heroCardWidth = screenWidth - 32;
  const listBannerHeight = Math.min(Math.round(heroCardWidth * (887 / 1774)), 220);

  const bg     = isDark ? "#141414" : "#FFFFFF";
  const card   = isDark ? "#1E1E1E" : "#FFFFFF";
  const text   = isDark ? "#F5F0F3" : "#111827";
  const muted  = isDark ? "#AAA0A5" : "#6B7280";
  const border = isDark ? "#2A2A2A" : "#E5E7EB";

  const catNameForNav = (name: string) => name.replace(/\n/g, " ");
  const searchParams = (value: HomeFilters = filters) => ({
    query: searchText.trim(),
    location: city,
    rating: value.minimumRating ? String(value.minimumRating) : undefined,
    budget: value.maximumBudget ? String(value.maximumBudget) : undefined,
    category: value.category || undefined,
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
    filters.nearbyOnly,
    filters.sort !== "recommended",
  ].filter(Boolean).length;
  const nearbyVendors = useMemo(
    () => [...popularVendors].sort((a, b) => Number(b.location.includes(city)) - Number(a.location.includes(city))),
    [city],
  );

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

        {/* ── Main heading ── */}
        <HomeReveal delay={45} style={[s.headingPad, { width: featureWidth }]}>
          <Text style={[s.mainHeading, isDesktop && s.mainHeadingDesktop, { color: text }]}>
            {"Find your "}
            <Text style={s.headingPink}>perfect</Text>
            {"\nwedding team"}
          </Text>
        </HomeReveal>

        {/* ── Search and Filters ── */}
        <HomeReveal delay={85} style={[s.searchPad, { width: featureWidth }]}>
          <View style={[s.searchBar, { backgroundColor: isDark ? "#252525" : "#F9FAFB", borderColor: border }]}>
            <TextInput
              accessibilityLabel="Search vendors, categories and services"
              style={[s.searchInput, { color: text }]}
              placeholder="Search vendors, categories, services…"
              placeholderTextColor={muted}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
              onSubmitEditing={submitSearch}
            />
            {searchText ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchText("")} style={s.clearSearch}>
                <X size={16} color={muted} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Submit global search" onPress={submitSearch} style={s.searchSubmit} activeOpacity={0.78}>
              <Search size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open filters"
            style={s.filterBtn}
            onPress={() => setFiltersVisible(true)}
            activeOpacity={0.75}
          >
            <SlidersHorizontal size={16} color={PINK} />
            <Text style={s.filterTxt}>Filters{activeFilterCount ? ` ${activeFilterCount}` : ""}</Text>
          </TouchableOpacity>
        </HomeReveal>

        {/* ── Hero carousel ── */}
        <HomeReveal delay={120} style={[s.heroPad, { width: featureWidth }]}>
          <HeroCarousel width={featureWidth} city={city} desktop={isDesktop} />
        </HomeReveal>

        {/* ── Top Categories ── */}
        <View style={s.section}>
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
                  style={s.catItem}
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
                  <View style={[s.catIconWrap, { backgroundColor: catBg, borderColor: catBorder }]}>
                    <Icon size={24} color={cat.color} />
                  </View>
                  <Text style={[s.catLabel, { color: isDark ? "#DDD0D8" : "#374151" }]} numberOfLines={2}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Popular Near You ── */}
        <View style={s.popularSection}>
          <View style={[s.sectionHead, { paddingHorizontal: 16 }]}>
            <Text style={[s.sectionTitle, { color: text }]}>Popular Near You</Text>
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
                <TouchableOpacity
                  key={v.id}
                  style={[s.vendorCard, { backgroundColor: card }]}
                  onPress={() =>
                    router.push({
                      pathname: "/VendorsProfile",
                      params: { vendorId: v.id, category: v.category },
                    })
                  }
                  activeOpacity={0.88}
                >
                  {/* Image */}
                  <View style={s.vendorImgWrap}>
                    <Image source={{ uri: v.image }} style={s.vendorImg} resizeMode="cover" />

                    {/* Heart */}
                    <TouchableOpacity
                      style={[s.heartBtn, isFav && s.heartBtnActive]}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (vendorResult) {
                          toggleFavorite({ ...vendorResult.vendor, category: vendorResult.category });
                        }
                      }}
                    >
                      <Heart size={12} color="#FFF" fill={isFav ? "#FFF" : "transparent"} />
                    </TouchableOpacity>

                    {/* Bottom overlays */}
                    <View style={s.imgBottomRow}>
                      <View style={s.ratingBadge}>
                        <Star size={10} color="#FACC15" fill="#FACC15" />
                        <Text style={s.ratingBadgeTxt}>{v.rating}</Text>
                      </View>
                      <View style={s.verifiedBadge}>
                        <BadgeCheck size={10} color="#FFF" />
                        <Text style={s.verifiedTxt}>Verified</Text>
                      </View>
                    </View>
                  </View>

                  {/* Info */}
                  <View style={s.vendorInfo}>
                    <Text style={[s.vendorName, { color: text }]} numberOfLines={1}>{v.name}</Text>
                    <Text style={[s.vendorCat, { color: muted }]} numberOfLines={1}>{v.category}</Text>
                    <View style={s.vendorMeta}>
                      <MapPin size={10} color={muted} />
                      <Text style={[s.vendorLoc, { color: muted }]}>{v.location}</Text>
                      <Text style={[s.vendorPrice, { color: text }]}>{v.startingPrice} onwards</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── List Your Business ── */}
        <View style={s.listBanner}>
          <Image
            source={require("../../assets/list-business-bg.png")}
            style={{ width: heroCardWidth, height: listBannerHeight }}
            resizeMode="stretch"
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

  /* Main heading */
  headingPad:      { alignSelf: "center", paddingTop: 7, paddingBottom: 12 },
  mainHeading:     { fontFamily: "System", fontSize: 25, fontWeight: "900", lineHeight: 30, letterSpacing: -0.75 },
  mainHeadingDesktop: { fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  headingPink:     { color: PINK },

  /* Search */
  searchPad:       { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 },
  searchBar:       { flex: 1, minWidth: 0, height: 54, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, shadowColor: "#8F526B", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  searchInput:     { flex: 1, minWidth: 0, fontFamily: "System", fontSize: 12, paddingVertical: 0, outlineStyle: "none" } as never,
  clearSearch:     { width: 28, height: 40, alignItems: "center", justifyContent: "center" },
  searchSubmit:    { width: 40, height: 40, borderRadius: 13, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  filterBtn:       { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: "rgba(233,30,99,.035)" },
  filterTxt:       { color: PINK, fontFamily: "System", fontSize: 12, fontWeight: "800" },

  /* Hero */
  heroPad:         { alignSelf: "center", marginBottom: 18 },

  /* Categories */
  section:         { paddingHorizontal: 16, marginBottom: 8 },
  sectionHead:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle:    { fontSize: 17, fontWeight: "700" },
  viewAllRow:      { flexDirection: "row", alignItems: "center", gap: 1 },
  viewAll:         { color: PINK, fontSize: 13, fontWeight: "600" },
  catGrid:         { flexDirection: "row", flexWrap: "wrap" },
  catItem:         { width: "20%", alignItems: "center", marginBottom: 18 },
  catIconWrap:     { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 6, borderWidth: 1 },
  catLabel:        { fontSize: 10, textAlign: "center", lineHeight: 14, fontWeight: "500" },

  /* Popular Near You */
  popularSection:  { marginBottom: 20 },
  vendorScroll:    { paddingHorizontal: 16, gap: 12 },
  vendorCard:      { width: 148, borderRadius: 14, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  vendorImgWrap:   { position: "relative" },
  vendorImg:       { width: "100%", height: 120 },
  heartBtn:        { position: "absolute", top: 7, right: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  heartBtnActive:  { backgroundColor: PINK },
  imgBottomRow:    { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: 7 },
  ratingBadge:     { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20 },
  ratingBadgeTxt:  { color: "#FFF", fontSize: 10, fontWeight: "700" },
  verifiedBadge:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: PINK, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 20 },
  verifiedTxt:     { color: "#FFF", fontSize: 9, fontWeight: "700" },
  vendorInfo:      { padding: 8 },
  vendorName:      { fontSize: 12, fontWeight: "700", marginBottom: 1 },
  vendorCat:       { fontSize: 10, marginBottom: 5 },
  vendorMeta:      { flexDirection: "row", alignItems: "center", gap: 3 },
  vendorLoc:       { fontSize: 9, flex: 1 },
  vendorPrice:     { fontSize: 9, fontWeight: "600", color: PINK },

  /* List Your Business */
  listBanner:      { marginHorizontal: 16, borderRadius: 20, overflow: "hidden", marginBottom: 20 },
  listBannerImg:   { width: "100%" },
  listOverlay:     { justifyContent: "center" },
  listLeft:        { width: "55%", paddingLeft: 18, paddingVertical: 18 },
  listTitle:       { fontSize: 17, fontWeight: "800", color: PINK, marginBottom: 4 },
  listSub:         { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  registerBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PINK, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 50 },
  registerTxt:     { color: "#FFF", fontSize: 13, fontWeight: "700" },
});
