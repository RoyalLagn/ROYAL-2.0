import React, { useState } from "react";
import {
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
import { Film, Images, Play, Sparkles, X } from "lucide-react-native";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import FullscreenMediaViewer from "@/components/vendor-profile/FullscreenMediaViewer";
import {
  portfolioMediaUrl,
  type PublicPortfolioAlbum,
  type VendorPortfolioMedia,
} from "@/services/vendorPortfolio";
import { brandPalette } from "@/constants/brandPalette";
import { fonts, typeLeading, typeScale, typeStyles } from "@/constants/typography";

const PINK = brandPalette.light.primary;
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
  dark,
  onOpen,
}: {
  item: VendorPortfolioMedia;
  index: number;
  total: number;
  size: number;
  dark?: boolean;
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
          borderColor: dark ? "#3D2B35" : "#EFCED9",
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
          resizeMode="cover"
          onLoad={() =>
            Animated.timing(imageOpacity, {
              toValue: 1,
              duration: 220,
              useNativeDriver: USE_NATIVE_DRIVER,
            }).start()
          }
          style={[StyleSheet.absoluteFillObject, { opacity: imageOpacity }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["transparent", "rgba(15,7,11,.48)"]}
          style={styles.tileGradient}
        />
        <View pointerEvents="none" style={styles.itemNumber}>
          <Text style={styles.itemNumberText}>{String(index + 1).padStart(2, "0")}</Text>
        </View>
        {item.resource_type === "video" ? (
          <>
            <View pointerEvents="none" style={styles.play}>
              <Play size={18} color="#FFF" fill="#FFF" />
            </View>
            {item.duration ? (
              <View pointerEvents="none" style={styles.duration}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export type PortfolioAlbumModalProps = {
  visible: boolean;
  album: PublicPortfolioAlbum | null;
  vendorName: string;
  dark?: boolean;
  onClose: () => void;
};

export default function PortfolioAlbumModal({
  visible,
  album,
  vendorName,
  dark = false,
  onClose,
}: PortfolioAlbumModalProps) {
  const { width } = useWindowDimensions();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const colors = {
    surface: dark ? "#151016" : "#FFFFFF",
    background: dark ? "#0D090E" : "#FFF8FA",
    text: dark ? "#FFF8FB" : "#24141C",
    muted: dark ? "#B3A2AC" : "#7A626D",
    border: dark ? "#33222D" : "#F0CAD8",
  };

  if (!album) return null;

  const isDesktop = width >= 760;
  const columns = isDesktop ? (width >= 1024 ? 4 : 3) : 2;
  const maxSheetWidth = 780;
  const containerWidth = isDesktop ? Math.min(width * 0.9, maxSheetWidth) : width;
  const gutter = width < 480 ? 12 : 16;
  const gap = width < 480 ? 8 : 12;
  const tileWidth = (containerWidth - gutter * 2 - gap * (columns - 1)) / columns;

  const videoCount = album.media.filter((item) => item.resource_type === "video").length;

  return (
    <>
      <AnimatedBottomSheet
        visible={visible}
        onRequestClose={onClose}
        variant={isDesktop ? "center" : "sheet"}
        sheetStyle={[
          styles.sheet,
          isDesktop && styles.desktopSheet,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        {!isDesktop ? <View style={styles.dragHandle} /> : null}

        <FlatList
          key={columns}
          data={album.media}
          numColumns={columns}
          renderItem={({ item, index }) => (
            <AlbumMediaTile
              item={item}
              index={index}
              total={album.media.length}
              size={tileWidth}
              dark={dark}
              onOpen={() => setViewerIndex(index)}
            />
          )}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingHorizontal: gutter,
              gap,
            },
          ]}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              <LinearGradient
                colors={dark ? ["#21151F", "#1A0F17", "#150C13"] : ["#FFF9FB", "#FFF0F5", "#FFF8F2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.headerCard, { borderColor: colors.border }]}
              >
                <View pointerEvents="none" style={styles.headerGlowOne} />
                <View pointerEvents="none" style={styles.headerGlowTwo} />

                <View style={styles.headerTopRow}>
                  <View style={styles.headerCopy}>
                    <View style={styles.eyebrowRow}>
                      <Sparkles size={12} color="#D6973B" />
                      <Text style={styles.eyebrow}>WEDDING STORIES</Text>
                    </View>
                    <Text numberOfLines={2} style={[styles.albumTitle, { color: colors.text }]}>
                      {album.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.vendorSubtitle, { color: colors.muted }]}>
                      {vendorName}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close album pop-up"
                    onPress={onClose}
                    hitSlop={8}
                    style={({ pressed, hovered }) => [
                      styles.closeBtn,
                      {
                        backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.88)",
                        borderColor: colors.border,
                      },
                      hovered && styles.closeBtnHovered,
                      pressed && styles.closeBtnPressed,
                    ]}
                  >
                    <X size={20} color={colors.text} />
                  </Pressable>
                </View>

                {album.description ? (
                  <Text numberOfLines={3} style={[styles.description, { color: colors.muted }]}>
                    {album.description}
                  </Text>
                ) : null}

                <View style={styles.statsRow}>
                  <View
                    style={[
                      styles.statChip,
                      {
                        borderColor: dark ? "#4A3241" : "#EFC8D6",
                        backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
                      },
                    ]}
                  >
                    <Images size={13} color={PINK} />
                    <Text style={[styles.statText, { color: dark ? "#FFB8D0" : "#81314E" }]}>
                      {album.media.length} {album.media.length === 1 ? "item" : "items"}
                    </Text>
                  </View>

                  {videoCount > 0 ? (
                    <View
                      style={[
                        styles.statChip,
                        {
                          borderColor: dark ? "#4A3241" : "#EFC8D6",
                          backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
                        },
                      ]}
                    >
                      <Film size={13} color={PINK} />
                      <Text style={[styles.statText, { color: dark ? "#FFB8D0" : "#81314E" }]}>
                        {videoCount} {videoCount === 1 ? "video" : "videos"}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.openHint, { color: colors.muted }]}>
                    Tap any photo to view
                  </Text>
                </View>
              </LinearGradient>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Images size={36} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                No photos in this album yet
              </Text>
            </View>
          }
        />
      </AnimatedBottomSheet>

      {/* Nested Fullscreen Media Viewer Popup */}
      <FullscreenMediaViewer
        visible={viewerIndex !== null}
        media={album.media}
        initialIndex={viewerIndex ?? 0}
        title={`${album.title} · ${vendorName}`}
        onClose={() => setViewerIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    maxHeight: "94%",
    height: "92%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  desktopSheet: {
    maxWidth: 780,
    maxHeight: "88%",
    height: "85%",
    borderRadius: 28,
    borderBottomWidth: 1,
    alignSelf: "center",
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(165,71,104,0.28)",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  listContent: {
    paddingBottom: 28,
  },
  headerContainer: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerCard: {
    minHeight: 126,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    overflow: "hidden",
    shadowColor: "#A54467",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerGlowOne: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -30,
    top: -40,
    backgroundColor: "rgba(233,30,99,0.08)",
  },
  headerGlowTwo: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    left: -20,
    bottom: -30,
    backgroundColor: "rgba(214,151,59,0.08)",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 3,
  },
  eyebrow: {
    color: "#A54768",
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  albumTitle: {
    fontSize: typeScale.editorialCardTitle,
    lineHeight: typeLeading.cardTitle,
    fontWeight: "700",
    fontFamily: fonts.serif.bold,
  },
  vendorSubtitle: {
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
    fontWeight: "600",
    marginTop: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnHovered: {
    borderColor: PINK,
    transform: [{ scale: 1.05 }],
  },
  closeBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
  description: {
    fontSize: typeScale.bodyCompact,
    lineHeight: typeLeading.bodyCompact,
    marginTop: 8,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
  },
  statChip: {
    minHeight: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
    fontWeight: "700",
  },
  openHint: {
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
    fontWeight: "600",
    marginLeft: "auto",
  },
  tileShell: {
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: "#160F12",
    shadowColor: "#8C3957",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tile: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#090709",
  },
  mediaSkeleton: {
    backgroundColor: "#291C22",
  },
  tileGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "40%",
  },
  itemNumber: {
    position: "absolute",
    top: 6,
    left: 6,
    minWidth: 24,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "rgba(18,9,13,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemNumberText: {
    color: "#FFF3F7",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  play: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -19,
    borderRadius: 19,
    backgroundColor: "rgba(20,13,17,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  duration: {
    position: "absolute",
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(20,13,17,0.72)",
  },
  durationText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  emptyContainer: {
    paddingVertical: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: typeScale.bodyCompact,
    lineHeight: typeLeading.bodyCompact,
  },
});
