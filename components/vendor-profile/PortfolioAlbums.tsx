import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ArrowUpRight, Images, Play } from "lucide-react-native";
import {
  portfolioMediaUrl,
  type PublicPortfolioAlbum,
  type VendorPortfolioMedia,
} from "@/services/vendorPortfolio";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

type Props = {
  albums: PublicPortfolioAlbum[];
  dark?: boolean;
  mode?: "preview" | "all";
  showHeading?: boolean;
  onOpenAlbum: (album: PublicPortfolioAlbum) => void;
  onViewAll?: () => void;
};

type InteractiveTileProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  onPress: () => void;
  style: object;
};

function InteractiveTile({
  accessibilityLabel,
  children,
  onPress,
  style,
}: InteractiveTileProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const hovered = useRef(false);

  const animate = (nextScale: number, nextLift: number, duration = 150) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: nextScale,
        speed: 28,
        bounciness: 5,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(lift, {
        toValue: nextLift,
        duration,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  };

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateY: lift },
            { scale },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={() => animate(0.972, 1, 90)}
        onPressOut={() => animate(hovered.current ? 1.015 : 1, hovered.current ? -3 : 0)}
        onHoverIn={() => {
          hovered.current = true;
          animate(1.015, -3);
        }}
        onHoverOut={() => {
          hovered.current = false;
          animate(1, 0);
        }}
        style={styles.tilePressable}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function CoverImage({
  media,
  label,
  fill = false,
}: {
  media: VendorPortfolioMedia;
  label: string;
  fill?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const skeletonOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (loaded) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, { toValue: 0.9, duration: 720, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(skeletonOpacity, { toValue: 0.45, duration: 720, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [loaded, skeletonOpacity]);

  const reveal = () => {
    setLoaded(true);
    Animated.timing(imageOpacity, {
      toValue: 1,
      duration: 260,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  const focalX = Number(media.focal_point_x ?? 0.5);
  const focalY = Number(media.focal_point_y ?? 0.5);
  const focalStyle = Platform.OS === "web"
    ? ({
        objectPosition: `${Math.round(focalX * 100)}% ${Math.round(focalY * 100)}%`,
      } as object)
    : ({
        transform: [
          { scale: 1.06 },
          { translateX: (0.5 - focalX) * 14 },
          { translateY: (0.5 - focalY) * 14 },
        ],
      } as object);

  return (
    <View style={[styles.coverFrame, fill && styles.coverFill]}>
      {!loaded ? <Animated.View style={[StyleSheet.absoluteFillObject, styles.skeleton, { opacity: skeletonOpacity }]} /> : null}
      <Animated.Image
        accessibilityLabel={`${label} album cover`}
        source={{ uri: portfolioMediaUrl(media, "cover") }}
        resizeMode="cover"
        onLoad={reveal}
        style={[StyleSheet.absoluteFillObject, focalStyle, { opacity: imageOpacity }]}
      />
    </View>
  );
}

function AlbumTile({
  album,
  dark,
  width,
  height,
  onOpen,
}: {
  album: PublicPortfolioAlbum;
  dark: boolean;
  width?: number;
  height?: number;
  onOpen: () => void;
}) {
  const text = dark ? "#FFF8FB" : "#24171E";
  const muted = dark ? "#C6BAC0" : "#77676F";
  const surface = dark ? "#171D29" : "#FFFFFF";
  const border = dark ? "#303846" : "#ECE7EA";

  return (
    <InteractiveTile
      accessibilityLabel={`Open ${album.title} album, ${album.media.length} ${album.media.length === 1 ? "item" : "items"}`}
      onPress={onOpen}
      style={[
        styles.tileOuter,
        width ? { width, height } : styles.tileFallbackWidth,
        {
          backgroundColor: surface,
          borderColor: border,
          shadowColor: dark ? "#000" : "#A84268",
        },
      ]}
    >
      <View style={styles.card}>
        {album.cover ? (
          <CoverImage media={album.cover} label={album.title} />
        ) : (
          <View style={[styles.coverFrame, styles.emptyCover]}>
            <Images size={27} color="#D57A9A" />
          </View>
        )}
        <View pointerEvents="none" style={styles.imageTint} />
        {album.hasVideo ? (
          <View pointerEvents="none" style={styles.videoBadge}>
            <Play size={9} color="#FFF" fill="#FFF" />
            <Text style={styles.videoBadgeText}>Video</Text>
          </View>
        ) : null}
        <View style={styles.albumCopy}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.albumName, { color: text }]}>
            {album.title}
          </Text>
          <View style={styles.albumMetaRow}>
            <Text style={[styles.albumMeta, { color: muted }]}>
              {album.media.length} {album.media.length === 1 ? "item" : "items"}
            </Text>
            <View style={[styles.miniArrow, { borderColor: dark ? "#514052" : "#F0C4D3" }]}>
              <ArrowUpRight size={11} color="#E91E63" strokeWidth={2.4} />
            </View>
          </View>
        </View>
      </View>
    </InteractiveTile>
  );
}

function ViewMoreTile({
  albums,
  width,
  height,
  onPress,
}: {
  albums: PublicPortfolioAlbum[];
  width?: number;
  height?: number;
  onPress: () => void;
}) {
  const covers = albums.map((album) => album.cover).filter(Boolean) as VendorPortfolioMedia[];

  return (
    <InteractiveTile
      accessibilityLabel={`View ${albums.length} more portfolio ${albums.length === 1 ? "album" : "albums"}`}
      onPress={onPress}
      style={[
        styles.tileOuter,
        styles.moreOuter,
        width ? { width, height } : styles.tileFallbackWidth,
      ]}
    >
      <View style={styles.moreCard}>
        <View style={styles.moreCollage}>
          {covers.length ? covers.slice(0, 2).map((cover, index) => (
            <View key={cover.id} style={styles.collagePanel}>
              <CoverImage media={cover} label={albums[index]?.title ?? "Portfolio"} fill />
            </View>
          )) : (
            <View style={[styles.coverFrame, styles.emptyCover]}>
              <Images size={30} color="#F7A8C3" />
            </View>
          )}
        </View>
        <View pointerEvents="none" style={styles.moreOverlay} />
        <View pointerEvents="none" style={styles.moreContent}>
          <View style={styles.moreIcon}>
            <ArrowUpRight size={16} color="#FFF" strokeWidth={2.4} />
          </View>
          <Text style={styles.moreCount}>+{albums.length} {albums.length === 1 ? "Album" : "Albums"}</Text>
          <Text style={styles.moreLabel}>View More</Text>
        </View>
      </View>
    </InteractiveTile>
  );
}

function PortfolioAlbums({
  albums,
  dark = false,
  mode = "preview",
  showHeading = true,
  onOpenAlbum,
  onViewAll,
}: Props) {
  const [gridWidth, setGridWidth] = useState(0);
  const text = dark ? "#FFF8FB" : "#24171E";
  const gridAlbums = useMemo(
    () => mode === "preview" && albums.length > 4 ? albums.slice(0, 3) : albums,
    [albums, mode],
  );
  const remainingAlbums = mode === "preview" && albums.length > 4 ? albums.slice(3) : [];
  const gap = gridWidth < 480 ? 10 : 14;
  const cardWidth = gridWidth ? (gridWidth - gap) / 2 : undefined;
  const cardHeight = cardWidth ? (cardWidth / 1.08) + 72 : undefined;

  if (!albums.length) return null;

  return (
    <View style={styles.root}>
      {showHeading ? (
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.eyebrow, { color: dark ? "#F4A7C1" : "#B84B71" }]}>CURATED MOMENTS</Text>
            <Text style={[styles.heading, { color: text }]}>Portfolio</Text>
          </View>
          {onViewAll ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all portfolio albums"
              onPress={onViewAll}
              hitSlop={8}
              style={({ pressed, hovered }) => [
                styles.viewAllButton,
                dark && styles.viewAllButtonDark,
                hovered && Platform.OS === "web" && styles.viewAllHovered,
                pressed && styles.viewAllPressed,
              ]}
            >
              <Text style={styles.viewAll}>View All</Text>
              <ArrowUpRight size={14} color="#E91E63" strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          setGridWidth((current) => current === nextWidth ? current : nextWidth);
        }}
        style={[styles.grid, { columnGap: gap, rowGap: gap }]}
      >
        {gridAlbums.map((album) => (
          <AlbumTile
            key={album.id}
            album={album}
            dark={dark}
            width={cardWidth}
            height={cardHeight}
            onOpen={() => onOpenAlbum(album)}
          />
        ))}
        {remainingAlbums.length && onViewAll ? (
          <ViewMoreTile albums={remainingAlbums} width={cardWidth} height={cardHeight} onPress={onViewAll} />
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(PortfolioAlbums);

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });
const styles = StyleSheet.create({
  root: { width: "100%", paddingVertical: 16 },
  headingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  eyebrow: { fontSize: 8, lineHeight: 12, fontWeight: "900", letterSpacing: 1.35, marginBottom: 1 },
  heading: { fontFamily: serif, fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2 },
  viewAllButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#FFF2F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  viewAllButtonDark: { backgroundColor: "#251B23" },
  viewAllHovered: { transform: [{ translateY: -1 }] },
  viewAllPressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
  viewAll: { color: "#E91E63", fontSize: 11, lineHeight: 15, fontWeight: "900" },
  grid: { width: "100%", maxWidth: 590, alignSelf: "center", flexDirection: "row", flexWrap: "wrap" },
  tileOuter: {
    borderWidth: 0,
    borderRadius: 17,
    shadowOpacity: 0.025,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  tileFallbackWidth: { width: "48%" },
  tilePressable: { flex: 1, borderRadius: 14, overflow: "hidden" },
  card: { flex: 1, overflow: "hidden", borderRadius: 14 },
  coverFrame: { width: "100%", aspectRatio: 1.08, overflow: "hidden", backgroundColor: "#F8E9EF" },
  coverFill: { height: "100%", flex: 1, aspectRatio: undefined },
  skeleton: { backgroundColor: "#F3D6E1" },
  emptyCover: { alignItems: "center", justifyContent: "center", backgroundColor: "#FBEFF4" },
  imageTint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 26,
    backgroundColor: "rgba(75,22,43,0.06)",
  },
  videoBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    minHeight: 23,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(26,13,19,0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  videoBadgeText: { color: "#FFF", fontSize: 8, lineHeight: 11, fontWeight: "900" },
  albumCopy: { height: 72, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 8, justifyContent: "space-between" },
  albumName: { minHeight: 32, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  albumMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  albumMeta: { fontSize: 9, lineHeight: 12, fontWeight: "700" },
  miniArrow: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  moreOuter: {
    overflow: "hidden",
    borderColor: "#F0A9C0",
    backgroundColor: "#4A1529",
    shadowColor: "#9A3057",
  },
  moreCard: { flex: 1, overflow: "hidden", borderRadius: 17 },
  moreCollage: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  collagePanel: { flex: 1, overflow: "hidden" },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(31,8,18,0.57)" },
  moreContent: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 12 },
  moreIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.52)",
    backgroundColor: "rgba(255,255,255,.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  moreCount: { color: "#FFF", fontFamily: serif, fontSize: 16, lineHeight: 21, fontWeight: "700", textAlign: "center" },
  moreLabel: { color: "#FFD9E5", fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 0.7, marginTop: 2, textTransform: "uppercase" },
});
