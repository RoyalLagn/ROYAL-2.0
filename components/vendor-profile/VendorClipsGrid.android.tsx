import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Clapperboard, Eye, Play } from "lucide-react-native";
import type { PublicClip } from "@/clips/types";
import { typeLeading, typeScale } from "@/constants/typography";

const COLUMN_COUNT = 3;
const COLUMN_GAP = 5;

function compactCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(Math.max(0, value));
}

function physicalPixelTileWidth(containerWidth: number) {
  const density = PixelRatio.get();
  const containerPixels = Math.floor(containerWidth * density);
  const gapPixels = Math.ceil(COLUMN_GAP * density);
  return Math.max(
    0,
    Math.floor((containerPixels - (gapPixels * (COLUMN_COUNT - 1))) / COLUMN_COUNT) / density,
  );
}

function NativeClipTile({
  clip,
  index,
  width,
  onOpen,
}: {
  clip: PublicClip;
  index: number;
  width: number;
  onOpen: (index: number) => void;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  return (
    <View style={[styles.tileFrame, { width }]}>
      {thumbnailFailed ? (
        <View style={styles.thumbnailFallback}>
          <Clapperboard size={26} color="#B83A66" />
        </View>
      ) : (
        <Image
          accessible={false}
          source={{ uri: clip.thumbnailUrl }}
          resizeMode="cover"
          onError={() => setThumbnailFailed(true)}
          style={styles.thumbnail}
        />
      )}
      <LinearGradient
        colors={["transparent", "rgba(10,4,8,.72)"]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.play}>
        <Play size={13} color="#FFFFFF" fill="#FFFFFF" />
      </View>
      <View style={styles.views}>
        <Eye size={13} color="#FFFFFF" strokeWidth={2.4} />
        <Text style={styles.viewsText}>{compactCount(clip.viewsCount)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${clip.title}, ${compactCount(clip.viewsCount)} views`}
        android_ripple={{ color: "rgba(255,255,255,.18)" }}
        onPress={() => onOpen(index)}
        style={styles.pressTarget}
      />
    </View>
  );
}

export default function VendorClipsGrid({
  clips,
  loading,
  error,
  dark,
  onOpen,
  onRetry,
}: {
  clips: PublicClip[];
  loading: boolean;
  error: string;
  dark: boolean;
  onOpen: (index: number) => void;
  onRetry: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const contentPadding = windowWidth < 600 ? 28 : 44;
  const fallbackWidth = Math.max(0, Math.min(windowWidth, 960) - contentPadding);
  const tileWidth = physicalPixelTileWidth(gridWidth || fallbackWidth);

  if (loading) {
    return (
      <View style={[styles.state, { backgroundColor: dark ? "#15111A" : "#FFF7FA" }]}>
        <ActivityIndicator color="#E91E63" />
        <Text style={[styles.stateText, { color: dark ? "#D5C4CB" : "#77666D" }]}>Loading this vendor&apos;s Clips…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.state, { backgroundColor: dark ? "#15111A" : "#FFF7FA" }]}>
        <Clapperboard size={28} color="#E91E63" />
        <Text style={[styles.stateTitle, { color: dark ? "#FFF5F8" : "#251820" }]}>Clips are taking a moment</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!clips.length) {
    return (
      <View style={[styles.state, { backgroundColor: dark ? "#15111A" : "#FFF7FA" }]}>
        <View style={styles.emptyIcon}><Clapperboard size={28} color="#E91E63" /></View>
        <Text style={[styles.stateTitle, { color: dark ? "#FFF5F8" : "#251820" }]}>No Clips yet</Text>
        <Text style={[styles.stateText, { color: dark ? "#D5C4CB" : "#77666D" }]}>
          This vendor&apos;s approved Clips will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View
      onLayout={(event) => {
        const density = PixelRatio.get();
        const measuredWidth = event.nativeEvent.layout.width;
        const nextWidth = Math.floor(measuredWidth * density) / density;
        setGridWidth((current) => current === nextWidth ? current : nextWidth);
      }}
      style={styles.grid}
    >
      {clips.map((clip, index) => (
        <NativeClipTile
          key={clip.id}
          clip={clip}
          index={index}
          width={tileWidth}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: "100%",
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: COLUMN_GAP,
  },
  tileFrame: {
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#EADDE2",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6E8EE",
  },
  pressTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  play: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 25,
    height: 25,
    borderRadius: 13,
    paddingLeft: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,9,14,.38)",
  },
  views: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewsText: {
    color: "#FFFFFF",
    fontSize: typeScale.metadata,
    lineHeight: typeLeading.caption,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,.45)",
    textShadowRadius: 3,
  },
  state: {
    minHeight: 170,
    marginTop: 12,
    padding: 24,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE2EC",
  },
  stateTitle: { fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle, fontWeight: "700" },
  stateText: { maxWidth: 280, textAlign: "center", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact },
  retry: { minHeight: 48, marginTop: 4, paddingHorizontal: 18, borderRadius: 24, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center" },
  retryText: { color: "#FFFFFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
});
