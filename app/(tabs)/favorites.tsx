import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import CategoryBadge from "@/components/categories/CategoryBadge";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heart, Star, MapPin, Grid2x2, List } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useFocusEffect, useRouter } from "expo-router";
import { useFavorites, FavoriteVendor } from "@/context/FavoritesContext";
import { typeScale, typeLeading } from "@/constants/typography";
import PageLoader from "@/components/loading/PageLoader";
import { MotionDistance, MotionStagger, MotionTiming } from "@/utils/motion";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

export default function FavoritesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { favorites, loading, markFavoritesViewed, removeFavorite } = useFavorites();
  const { width: W } = useWindowDimensions();
  const CARD_W = (W - 48) / 2;

  const [selectedCat, setSelectedCat] = useState("All");
  const [gridView, setGridView] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const bg    = isDark ? "#070B14" : "#FFFFFF";
  const card  = isDark ? "#0E141F" : "#FDF2F8";
  const text  = isDark ? "#F5F0F3" : "#141414";
  const muted = isDark ? "#AAA0A5" : "#787178";
  const border= isDark ? "#2A2A2A" : "#EEE4F0";

  useFocusEffect(
    useCallback(() => {
      markFavoritesViewed();
    }, [markFavoritesViewed]),
  );

  const activeCats = ["All", ...Array.from(new Set(favorites.map((v) => v.category)))];
  const displayed = selectedCat === "All"
    ? favorites
    : favorites.filter((v) => v.category === selectedCat);

  const doRemove = () => {
    if (confirmId) { removeFavorite(confirmId); setConfirmId(null); }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      {loading ? <PageLoader /> : null}

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: isDark ? "#1E1E1E" : "#FFF", borderBottomWidth: 1, borderBottomColor: isDark ? "#2A2A2A" : "#F0E6F0" }]}>
        <View>
          <Text style={[s.pageTitle, { color: text }]}>My Favourites</Text>
          <Text style={[s.pageSubtitle, { color: muted }]}>
            {favorites.length === 0
              ? "Start saving vendors you love"
              : `${favorites.length} vendor${favorites.length > 1 ? "s" : ""} saved`}
          </Text>
        </View>
        <View style={s.headerRight}>
          {favorites.length > 0 && (
            <TouchableOpacity
              style={[s.viewToggle, { backgroundColor: isDark ? "#2A2A2A" : "#FFF0F7" }]}
              onPress={() => setGridView((v) => !v)}
            >
              {gridView
                ? <List size={18} color={PINK} />
                : <Grid2x2 size={18} color={PINK} />}
            </TouchableOpacity>
          )}
          {favorites.length > 0 && (
            <View style={s.heartBadge}>
              <Heart size={15} color={PINK} fill={PINK} />
              <Text style={s.heartBadgeNum}>{favorites.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Body (chips + content) ── */}
      <View style={{ flex: 1 }}>

        {/* Category filter chips */}
        {favorites.length > 0 && (
          <View style={s.chipsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
            >
              {activeCats.map((cat) => {
                const active = selectedCat === cat;
                const count = cat === "All" ? favorites.length : favorites.filter(v => v.category === cat).length;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[s.chip, active ? s.chipActive : { backgroundColor: card, borderColor: border }]}
                    onPress={() => setSelectedCat(cat)}
                  >
                    <Text style={[s.chipTxt, { color: active ? "#FFF" : text }]}>{cat}</Text>
                    <View style={[s.chipCount, { backgroundColor: active ? "rgba(255,255,255,0.25)" : isDark ? "#2A2A2A" : "#F3E6EF" }]}>
                      <Text style={[s.chipCountTxt, { color: active ? "#FFF" : PINK }]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Content */}
        {displayed.length === 0 ? (
          <EmptyState isDark={isDark} text={text} muted={muted} router={router} hasAny={favorites.length > 0} selectedCat={selectedCat} />
        ) : gridView ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={[s.gridList, { paddingBottom: 24 }]}
          >
            <View style={s.grid}>
              {displayed.map((vendor) => (
                <GridCard
                  key={vendor.id}
                  vendor={vendor}
                  isDark={isDark}
                  text={text}
                  muted={muted}
                  cardWidth={CARD_W}
                  onPress={() => router.push({ pathname: "/VendorsProfile", params: { vendorId: vendor.id, category: vendor.category } })}
                  onRemove={() => setConfirmId(vendor.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {displayed.map((vendor) => (
              <ListCard
                key={vendor.id}
                vendor={vendor}
                card={card}
                text={text}
                muted={muted}
                border={border}
                isDark={isDark}
                onPress={() => router.push({ pathname: "/VendorsProfile", params: { vendorId: vendor.id, category: vendor.category } })}
                onRemove={() => setConfirmId(vendor.id)}
              />
            ))}
          </ScrollView>
        )}

      </View>

      {/* ── Remove confirmation modal ── */}
      {confirmId && (
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: card }]}>
            <View style={s.modalIconWrap}>
              <Heart size={28} color={PINK} fill={PINK} />
            </View>
            <Text style={[s.modalTitle, { color: text }]}>Remove from Favourites?</Text>
            <Text style={[s.modalDesc, { color: muted }]}>
              This vendor will be removed. You can always add them back later.
            </Text>
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={[s.cancelBtn, { backgroundColor: isDark ? "#2A2A2A" : "#F3E6EF" }]}
                onPress={() => setConfirmId(null)}
              >
                <Text style={[s.cancelTxt, { color: text }]}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.removeBtn} onPress={doRemove}>
                <Text style={s.removeTxt}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ── Grid Card ── */
function GridCard({ vendor, isDark, text, muted, cardWidth, onPress, onRemove }: {
  vendor: FavoriteVendor; isDark: boolean; text: string; muted: string; cardWidth: number;
  onPress: () => void; onRemove: () => void;
}) {
  return (
    <TouchableOpacity style={[s.gridCard, { width: cardWidth }]} onPress={onPress} activeOpacity={0.9}>
      <View style={s.gridImgWrap}>
        <Image source={{ uri: vendor.image }} style={s.gridImg} resizeMode="contain" />
        {/* Gradient overlay */}
        <View style={s.gridOverlay} />
        {/* Top heart */}
        <TouchableOpacity style={s.gridHeart} onPress={onRemove}>
          <Heart size={16} color="#FFF" fill={PINK} />
        </TouchableOpacity>
        {/* Category badge */}
        <View style={s.gridCatBadge}>
          <CategoryBadge name={vendor.category} style={s.gridCatTxt} />
        </View>
        {/* Rating */}
        <View style={s.gridRatingBadge}>
          <Star size={10} color="#EAB308" fill="#EAB308" />
          <Text style={s.gridRatingTxt}>{vendor.rating}</Text>
        </View>
      </View>
      <View style={[s.gridBody, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}>
        <Text style={[s.gridName, { color: text }]} numberOfLines={2}>{vendor.name}</Text>
        <View style={s.gridMeta}>
          <MapPin size={10} color={PINK} />
          <Text style={[s.gridLocation, { color: PINK }]} numberOfLines={1}> {vendor.location}</Text>
        </View>
        <Text style={[s.gridPrice, { color: isDark ? "#F5A0C0" : "#BE185D" }]}>{vendor.startingPrice}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ── List Card ── */
function ListCard({ vendor, card, text, muted, border, isDark, onPress, onRemove }: {
  vendor: FavoriteVendor; card: string; text: string; muted: string; border: string; isDark: boolean;
  onPress: () => void; onRemove: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.listCard, { backgroundColor: card }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {/* Image */}
      <View style={s.listImgWrap}>
        <Image source={{ uri: vendor.image }} style={s.listImg} resizeMode="contain" />
        <View style={s.listCatBadge}>
          <CategoryBadge name={vendor.category} style={s.listCatTxt} />
        </View>
      </View>

      {/* Body */}
      <View style={s.listBody}>
        <View style={s.listNameRow}>
          <Text style={[s.listName, { color: text }]} numberOfLines={2}>{vendor.name}</Text>
          <TouchableOpacity onPress={onRemove} style={s.listHeartBtn}>
            <Heart size={18} color={PINK} fill={PINK} />
          </TouchableOpacity>
        </View>
        <View style={s.listRatingRow}>
          <Star size={12} color="#EAB308" fill="#EAB308" />
          <Text style={[s.listRatingVal, { color: text }]}> {vendor.rating}</Text>
          <Text style={[s.listRatingCount, { color: muted }]}> ({vendor.reviews})</Text>
        </View>
        <View style={s.listMetaRow}>
          <MapPin size={11} color={PINK} />
          <Text style={[s.listLocation, { color: muted }]} numberOfLines={1}> {vendor.location}</Text>
        </View>
        <Text style={[s.listTags, { color: muted }]} numberOfLines={1}>
          {vendor.tags.join(" • ")}
        </Text>
        <View style={[s.listPriceBadge, { backgroundColor: isDark ? "#252525" : "#FFF0F7" }]}>
          <Text style={s.listPriceTxt}>from {vendor.startingPrice}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ── Empty State ── */
function EmptyState({ isDark, text, muted, router, hasAny, selectedCat }: {
  isDark: boolean; text: string; muted: string; router: any; hasAny: boolean; selectedCat: string;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, MotionTiming.base);
  }, [progress]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - progress.value) * MotionDistance.cardEnter }],
  }));

  return (
    <Animated.View style={[s.empty, entranceStyle]}>
      {/* Decorative hearts */}
      <View style={s.emptyDecor}>
        <EmptyDecorHeart delay={0} style={[s.decorHeart, s.decorHeart1, { backgroundColor: isDark ? "#252525" : "#FFF0F7" }]}>
          <Heart size={20} color={`${PINK}60`} fill={`${PINK}30`} />
        </EmptyDecorHeart>
        <EmptyDecorHeart delay={MotionStagger.item} style={[s.decorHeart, s.decorHeart2, { backgroundColor: isDark ? "#252525" : "#FFF0F7" }]}>
          <Heart size={28} color={`${PINK}70`} fill={`${PINK}40`} />
        </EmptyDecorHeart>
        <EmptyDecorHeart delay={MotionStagger.item * 2} style={[s.decorHeart, s.decorHeart3, { backgroundColor: isDark ? "#252525" : "#FFF0F7" }]}>
          <Heart size={16} color={`${PINK}50`} fill={`${PINK}20`} />
        </EmptyDecorHeart>
      </View>
      <View style={[s.emptyIconWrap, { backgroundColor: isDark ? "#252525" : "#FFF0F7" }]}>
        <Heart size={40} color={PINK} fill={PINK} />
      </View>
      <Text style={[s.emptyTitle, { color: text }]}>
        {hasAny ? `No ${selectedCat} saved` : "No Favourites Yet"}
      </Text>
      <Text style={[s.emptyDesc, { color: muted }]}>
        {hasAny
          ? `You haven't saved any ${selectedCat} yet. Browse the category to find your perfect match.`
          : "Tap the heart on any vendor card to save them here for quick access."}
      </Text>
      <TouchableOpacity
        style={s.exploreBtn}
        onPress={() => router.push("/(tabs)/Categories")}
      >
        <Heart size={16} color="#FFF" style={{ marginRight: 6 }} />
        <Text style={s.exploreTxt}>Browse Vendors</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function EmptyDecorHeart({ children, delay, style }: React.PropsWithChildren<{
  delay: number;
  style: StyleProp<ViewStyle>;
}>) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, MotionTiming.fast));
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - progress.value) * 4 },
      { scale: reducedMotion ? 1 : 0.94 + progress.value * 0.06 },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  root:           { flex: 1 },

  /* Header */
  header:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  pageTitle:      { fontSize: typeScale.sectionTitle, fontWeight: "700", letterSpacing: -0.3 },
  pageSubtitle:   { fontSize: typeScale.body, marginTop: 2 },
  headerRight:    { flexDirection: "row", alignItems: "center", gap: 10 },
  viewToggle:     { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  heartBadge:     { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${PINK}18`, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 50 },
  heartBadgeNum:  { color: PINK, fontWeight: "700", fontSize: typeScale.body },

  /* Chips */
  chipsWrap:      { paddingVertical: 10 },
  chipsRow:       { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip:           { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 50, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipActive:     { backgroundColor: PINK, borderColor: PINK },
  chipTxt:        { fontSize: typeScale.bodyCompact, fontWeight: "600" },
  chipCount:      { borderRadius: 50, paddingHorizontal: 5, paddingVertical: 1 },
  chipCountTxt:   { fontSize: typeScale.caption, fontWeight: "700" },

  /* Grid */
  gridList:       { paddingHorizontal: 16 },
  grid:           { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  gridCard:       { borderRadius: 16, overflow: "hidden", elevation: 3, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  gridImgWrap:    { aspectRatio: 1, position: "relative", backgroundColor: "#FFFFFF" },
  gridImg:        { width: "100%", height: "100%" },
  gridOverlay:    { position: "absolute", bottom: 0, left: 0, right: 0, height: 80, backgroundColor: "rgba(0,0,0,0.35)" },
  gridHeart:      { position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  gridCatBadge:   { position: "absolute", bottom: 8, left: 8, backgroundColor: `${PINK}CC`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 50 },
  gridCatTxt:     { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  gridRatingBadge:{ position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 50 },
  gridRatingTxt:  { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
  gridBody:       { padding: 10 },
  gridName:       { fontSize: typeScale.body, fontWeight: "700", lineHeight: typeLeading.bodyCompact, marginBottom: 4 },
  gridMeta:       { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  gridLocation:   { fontSize: typeScale.metadata, fontWeight: "500" },
  gridPrice:      { fontSize: typeScale.bodyCompact, fontWeight: "700" },

  /* List */
  listCard:       { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
  listImgWrap:    { width: 110, height: 110, position: "relative", backgroundColor: "#FFFFFF" },
  listImg:        { width: "100%", height: "100%" },
  listCatBadge:   { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 4, alignItems: "center" },
  listCatTxt:     { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  listBody:       { flex: 1, padding: 12, justifyContent: "space-between" },
  listNameRow:    { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 5 },
  listName:       { fontSize: typeScale.body, fontWeight: "700", flex: 1, marginRight: 6, lineHeight: typeLeading.bodyCompact },
  listHeartBtn:   { padding: 2 },
  listRatingRow:  { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  listRatingVal:  { fontSize: typeScale.bodyCompact, fontWeight: "600" },
  listRatingCount:{ fontSize: typeScale.metadata },
  listMetaRow:    { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  listLocation:   { fontSize: typeScale.metadata, flex: 1 },
  listTags:       { fontSize: typeScale.metadata, marginBottom: 6 },
  listPriceBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50 },
  listPriceTxt:   { color: PINK, fontSize: typeScale.metadata, fontWeight: "700" },

  /* Empty */
  empty:          { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingBottom: 40 },
  emptyDecor:     { position: "relative", width: 160, height: 80, marginBottom: 8 },
  decorHeart:     { position: "absolute", borderRadius: 50, alignItems: "center", justifyContent: "center" },
  decorHeart1:    { width: 48, height: 48, top: 0, left: 10 },
  decorHeart2:    { width: 64, height: 64, top: 8, left: 48 },
  decorHeart3:    { width: 36, height: 36, top: 4, right: 16 },
  emptyIconWrap:  { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  emptyTitle:     { fontSize: typeScale.sectionTitle, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  emptyDesc:      { fontSize: typeScale.body, textAlign: "center", lineHeight: typeLeading.cardTitle, marginBottom: 28 },
  exploreBtn:     { flexDirection: "row", alignItems: "center", backgroundColor: PINK, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 50 },
  exploreTxt:     { color: "#FFF", fontWeight: "700", fontSize: typeScale.body },

  /* Modal */
  overlay:        { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  modal:          { width: "100%", borderRadius: 24, padding: 24 },
  modalIconWrap:  { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFF0F7", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  modalTitle:     { fontSize: typeScale.editorialCardTitle, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  modalDesc:      { fontSize: typeScale.body, textAlign: "center", marginBottom: 24, lineHeight: typeLeading.body },
  modalBtns:      { flexDirection: "row", gap: 12 },
  cancelBtn:      { flex: 1, paddingVertical: 13, borderRadius: 50, alignItems: "center" },
  cancelTxt:      { fontWeight: "600", fontSize: typeScale.body },
  removeBtn:      { flex: 1, paddingVertical: 13, borderRadius: 50, alignItems: "center", backgroundColor: PINK },
  removeTxt:      { color: "#FFF", fontWeight: "700", fontSize: typeScale.body },
});
