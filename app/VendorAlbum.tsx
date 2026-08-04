import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Film, Images, Play, Sparkles } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FullscreenMediaViewer from "@/components/vendor-profile/FullscreenMediaViewer";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import { getApprovedPublicVendorById, type PublicVendorListing } from "@/services/publicVendorListings";
import { portfolioMediaUrl, type VendorPortfolioMedia } from "@/services/vendorPortfolio";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

function formatDuration(value?: number | null) {
  if (!value) return "";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function AlbumMediaTile({
  item,
  index,
  total,
  size,
  onOpen,
}: {
  item: VendorPortfolioMedia;
  index: number;
  total: number;
  size: number;
  onOpen: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const lift = React.useRef(new Animated.Value(0)).current;
  const imageOpacity = React.useRef(new Animated.Value(0)).current;
  const hovered = React.useRef(false);

  const animate = (nextScale: number, nextLift: number) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: nextScale,
        speed: 28,
        bounciness: 5,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(lift, {
        toValue: nextLift,
        duration: 140,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  };

  return (
    <Animated.View
      style={[
        styles.tileShell,
        {
          width: size,
          height: size,
          transform: [{ translateY: lift }, { scale }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.resource_type} ${index + 1} of ${total}`}
        onPress={onOpen}
        onPressIn={() => animate(0.97, 1)}
        onPressOut={() => animate(hovered.current ? 1.012 : 1, hovered.current ? -3 : 0)}
        onHoverIn={() => {
          hovered.current = true;
          animate(1.012, -3);
        }}
        onHoverOut={() => {
          hovered.current = false;
          animate(1, 0);
        }}
        style={styles.tile}
      >
        <View style={[StyleSheet.absoluteFillObject, styles.mediaSkeleton]} />
        <Animated.Image
          source={{ uri: portfolioMediaUrl(item, "thumbnail") }}
          resizeMode="contain"
          onLoad={() => Animated.timing(imageOpacity, {
            toValue: 1,
            duration: 240,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start()}
          style={[StyleSheet.absoluteFillObject, { opacity: imageOpacity }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(15,7,11,.42)"]}
          style={styles.tileGradient}
        />
        <View pointerEvents="none" style={styles.itemNumber}>
          <Text style={styles.itemNumberText}>{String(index + 1).padStart(2, "0")}</Text>
        </View>
        {item.resource_type === "video" ? (
          <>
            <View pointerEvents="none" style={styles.play}><Play size={18} color="#FFF" fill="#FFF" /></View>
            {item.duration ? <View pointerEvents="none" style={styles.duration}><Text style={styles.durationText}>{formatDuration(item.duration)}</Text></View> : null}
          </>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default function VendorAlbum() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ vendorId?: string; albumId?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const albumId = Array.isArray(params.albumId) ? params.albumId[0] : params.albumId;
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const columns = width >= 980 ? 4 : width >= 620 ? 3 : 2;
  const pageWidth = Math.min(width, 1080);
  const gutter = width < 600 ? 12 : 18;
  const gap = width < 600 ? 7 : 10;
  const tileWidth = (pageWidth - gutter * 2 - gap * (columns - 1)) / columns;

  useEffect(() => {
    let active = true;
    if (!vendorId) {
      setLoading(false);
      return;
    }
    getApprovedPublicVendorById(vendorId)
      .then((result) => { if (active) setVendor(result); })
      .catch(() => { if (active) setVendor(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vendorId]);

  const album = useMemo(
    () => vendor?.portfolioAlbums.find((item) => item.id === albumId) ?? null,
    [albumId, vendor],
  );
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (vendorId) router.replace({ pathname: "/VendorsProfile", params: { vendorId } });
    else router.replace("/Categories");
  };

  if (loading || !vendor || !album) {
    return (
      <View style={styles.root}>
        <View style={[styles.empty, { paddingTop: insets.top + 20 }]}>
          {loading ? <ActivityIndicator color="#E91E63" /> : <>
            <Text style={styles.emptyTitle}>Album unavailable</Text>
            <Pressable onPress={goBack} style={styles.backHome}><Text style={styles.backHomeText}>Go back</Text></Pressable>
          </>}
        </View>
        <StandaloneMobileTabBar activeRoute="Categories" />
      </View>
    );
  }

  const videoCount = album.media.filter((item) => item.resource_type === "video").length;
  const renderMedia = ({ item, index }: { item: VendorPortfolioMedia; index: number }) => (
    <AlbumMediaTile
      item={item}
      index={index}
      total={album.media.length}
      size={tileWidth}
      onOpen={() => setViewerIndex(index)}
    />
  );

  return (
    <View style={styles.root}>
      <FlatList
        key={columns}
        data={album.media}
        numColumns={columns}
        renderItem={renderMedia}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{
          width: pageWidth,
          alignSelf: "center",
          paddingHorizontal: gutter,
          paddingBottom: 98 + insets.bottom,
          gap,
        }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <LinearGradient
              colors={["#FFF9FB", "#FFF0F5", "#FFF8F2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerCard}
            >
              <View pointerEvents="none" style={styles.headerGlowOne} />
              <View pointerEvents="none" style={styles.headerGlowTwo} />
              <View style={styles.headerRow}>
                <Pressable
                  accessibilityLabel="Back to vendor profile"
                  onPress={goBack}
                  style={({ pressed, hovered }) => [
                    styles.back,
                    hovered && Platform.OS === "web" && styles.backHovered,
                    pressed && styles.backPressed,
                  ]}
                >
                  <ChevronLeft size={22} color="#7E2949" />
                </Pressable>
                <View style={styles.headerCopy}>
                  <View style={styles.eyebrowRow}>
                    <Sparkles size={11} color="#D6973B" />
                    <Text style={styles.eyebrow}>WEDDING STORIES</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.albumName}>{album.title}</Text>
                  <Text numberOfLines={1} style={styles.vendorName}>{vendor.name}</Text>
                </View>
              </View>
              {album.description ? <Text numberOfLines={3} style={styles.description}>{album.description}</Text> : null}
              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <Images size={13} color="#A43B61" />
                  <Text style={styles.statText}>{album.media.length} {album.media.length === 1 ? "item" : "items"}</Text>
                </View>
                {videoCount ? (
                  <View style={styles.statChip}>
                    <Film size={13} color="#A43B61" />
                    <Text style={styles.statText}>{videoCount} {videoCount === 1 ? "video" : "videos"}</Text>
                  </View>
                ) : null}
                <Text style={styles.openHint}>Tap any moment to view</Text>
              </View>
            </LinearGradient>
          </View>
        }
      />
      <StandaloneMobileTabBar activeRoute="Categories" />
      <FullscreenMediaViewer
        visible={viewerIndex !== null}
        media={album.media}
        initialIndex={viewerIndex ?? 0}
        title={album.title}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFF9FB" },
  header: { paddingBottom: 14 },
  headerCard: {
    minHeight: 150,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F0CAD8",
    padding: 16,
    overflow: "hidden",
    shadowColor: "#A54467",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  headerGlowOne: { position: "absolute", width: 130, height: 130, borderRadius: 65, right: -38, top: -52, backgroundColor: "rgba(233,30,99,.07)" },
  headerGlowTwo: { position: "absolute", width: 88, height: 88, borderRadius: 44, left: -34, bottom: -47, backgroundColor: "rgba(214,151,59,.08)" },
  headerRow: { minHeight: 62, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#EFC5D4", backgroundColor: "rgba(255,255,255,.84)", alignItems: "center", justifyContent: "center" },
  backHovered: { borderColor: "#DC83A3", transform: [{ translateX: -2 }] },
  backPressed: { opacity: 0.76, transform: [{ scale: 0.94 }] },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  eyebrow: { color: "#A54768", fontSize: 8, lineHeight: 12, fontWeight: "900", letterSpacing: 1.25 },
  albumName: { color: "#24141C", fontFamily: serif, fontSize: 23, lineHeight: 28, fontWeight: "700", letterSpacing: -0.25 },
  vendorName: { color: "#7A626D", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 },
  description: { color: "#66545D", maxWidth: 760, fontSize: 12, lineHeight: 18, marginTop: 7 },
  statsRow: { minHeight: 29, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 11 },
  statChip: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14, borderWidth: 1, borderColor: "#EFC8D6", backgroundColor: "rgba(255,255,255,.65)", flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { color: "#81314E", fontSize: 9, lineHeight: 12, fontWeight: "800" },
  openHint: { color: "#987B87", fontSize: 9, lineHeight: 13, fontWeight: "700", marginLeft: "auto" },
  tileShell: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFCED9",
    backgroundColor: "#160F12",
    shadowColor: "#8C3957",
    shadowOpacity: 0.11,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tile: { flex: 1, overflow: "hidden", borderRadius: 15, backgroundColor: "#090709" },
  mediaSkeleton: { backgroundColor: "#291C22" },
  tileGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "38%" },
  itemNumber: { position: "absolute", top: 7, left: 7, minWidth: 26, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: "rgba(18,9,13,.62)", alignItems: "center", justifyContent: "center" },
  itemNumberText: { color: "#FFF3F7", fontSize: 8, lineHeight: 10, fontWeight: "900", letterSpacing: 0.5 },
  play: { position: "absolute", top: "50%", left: "50%", width: 42, height: 42, marginLeft: -21, marginTop: -21, borderRadius: 21, backgroundColor: "rgba(20,13,17,.58)", alignItems: "center", justifyContent: "center" },
  duration: { position: "absolute", right: 7, bottom: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: "rgba(20,13,17,.68)" },
  durationText: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { color: "#24181E", fontFamily: serif, fontSize: 22, fontWeight: "700" },
  backHome: { marginTop: 16, minHeight: 42, paddingHorizontal: 20, borderRadius: 21, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center" },
  backHomeText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
});
