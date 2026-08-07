import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Clapperboard, Eye, Play } from "lucide-react-native";
import type { PublicClip } from "@/clips/types";
import { typeScale, typeLeading } from "@/constants/typography";

function compactCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(Math.max(0, value));
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
  const contentPadding = windowWidth < 600 ? 28 : 44;
  const availableWidth = Math.max(0, Math.min(windowWidth, 960) - contentPadding);
  const tileWidth = Math.max(0, (availableWidth - 10) / 3);

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
    <View style={styles.grid}>
      {clips.map((clip, index) => (
        <Pressable
          key={clip.id}
          accessibilityRole="button"
          accessibilityLabel={`Play ${clip.title}, ${compactCount(clip.viewsCount)} views`}
          onPress={() => onOpen(index)}
          style={({ pressed, hovered }) => [
            styles.tile,
            { width: tileWidth },
            hovered && Platform.OS === "web" && styles.tileHovered,
            pressed && styles.tilePressed,
          ]}
        >
          <Image source={{ uri: clip.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "rgba(10,4,8,.72)"]}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.play}>
            <Play size={13} color="#FFFFFF" fill="#FFFFFF" />
          </View>
          <View pointerEvents="none" style={styles.views}>
            <Eye size={13} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.viewsText}>{compactCount(clip.viewsCount)}</Text>
          </View>
        </Pressable>
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
    gap: 5,
  },
  tile: {
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#EADDE2",
  },
  tileHovered: {
    transform: [{ translateY: -2 }],
    shadowColor: "#7D2C4A",
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  tilePressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
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
  retry: { minHeight: 38, marginTop: 4, paddingHorizontal: 18, borderRadius: 19, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center" },
  retryText: { color: "#FFFFFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
});
