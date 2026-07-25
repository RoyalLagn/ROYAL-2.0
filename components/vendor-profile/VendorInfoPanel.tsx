import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BadgeCheck, Crown, Heart, MapPin, Share2, Star } from "lucide-react-native";

const PINK = "#E91E63";

export type VendorInfoPanelProps = {
  name: string;
  rating: number | string;
  reviewCount: number;
  location: string;
  specialties?: string[];
  verified?: boolean;
  topRated?: boolean;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onShare?: () => void;
  dark?: boolean;
  children?: React.ReactNode;
};

export default function VendorInfoPanel({
  name,
  rating,
  reviewCount,
  location,
  specialties = [],
  verified = true,
  topRated = false,
  favorite = false,
  onToggleFavorite,
  onShare,
  dark = false,
  children,
}: VendorInfoPanelProps) {
  const { width } = useWindowDimensions();
  const compact = width < 440;
  const colors = {
    surface: dark ? "#1E1C1D" : "#FFFFFF",
    text: dark ? "#F8F1F4" : "#21171C",
    muted: dark ? "#B9AEB3" : "#71676D",
    badge: dark ? "#35262C" : "#FFF5F7",
    badgeBorder: dark ? "#553642" : "#F4D8E1",
    actionSurface: dark ? "#262123" : "#FFFFFF",
    actionBorder: dark ? "#64404D" : "#EEC8D4",
  };
  const hasActions = Boolean(onToggleFavorite || onShare);

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface }]}>
      <View style={[styles.headingRow, compact && styles.headingRowCompact]}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
          {verified ? (
            <BadgeCheck
              accessibilityLabel="Verified vendor"
              size={21}
              color={PINK}
              fill={PINK}
              stroke="#FFFFFF"
            />
          ) : null}
        </View>
        {topRated || hasActions ? (
          <View style={[styles.headingActions, compact && styles.headingActionsCompact]}>
            {topRated ? (
              <View style={[styles.topRated, { backgroundColor: colors.badge, borderColor: colors.badgeBorder }]}>
                <Crown size={15} color="#C78439" strokeWidth={1.8} />
                <Text style={styles.topRatedText}>Top Rated</Text>
              </View>
            ) : null}
            {onToggleFavorite ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={favorite ? "Remove vendor from favorites" : "Add vendor to favorites"}
                accessibilityState={{ selected: favorite }}
                hitSlop={8}
                onPress={onToggleFavorite}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.actionSurface, borderColor: colors.actionBorder },
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Heart size={18} color={PINK} fill={favorite ? PINK : "transparent"} strokeWidth={1.9} />
              </Pressable>
            ) : null}
            {onShare ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share vendor profile"
                hitSlop={8}
                onPress={onShare}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.actionSurface, borderColor: colors.actionBorder },
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Share2 size={18} color={PINK} strokeWidth={1.9} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <Star size={17} color="#F2B33D" fill="#F2B33D" />
        <Text style={[styles.rating, { color: colors.text }]}>{rating}</Text>
        <Text style={[styles.metaText, { color: colors.muted }]}>({reviewCount} Reviews)</Text>
        <Text style={[styles.separator, { color: colors.muted }]}>•</Text>
        <MapPin size={15} color={PINK} strokeWidth={1.9} />
        <Text numberOfLines={2} style={[styles.location, { color: colors.muted }]}>{location}</Text>
      </View>

      {specialties.length ? (
        <Text style={[styles.specialties, { color: colors.muted }]}>
          {specialties.join("  •  ")}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    marginTop: -24,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 27,
    paddingHorizontal: 20,
    paddingBottom: 8,
    position: "relative",
    zIndex: 2,
  },
  headingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headingRowCompact: { flexDirection: "column", gap: 5 },
  nameLine: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  name: {
    flexShrink: 1,
    fontFamily: serif,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.45,
  },
  topRated: {
    flexShrink: 0,
    minHeight: 37,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topRatedText: {
    color: "#C34D71",
    fontFamily: serif,
    fontSize: 14,
    fontWeight: "600",
  },
  headingActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  headingActionsCompact: {
    alignSelf: "flex-end",
    flexWrap: "wrap",
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  metaRow: {
    marginTop: 10,
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 4,
  },
  rating: { fontSize: 15, fontWeight: "700" },
  metaText: { fontSize: 14 },
  separator: { fontSize: 14, paddingHorizontal: 1 },
  location: { minWidth: 0, flexShrink: 1, fontSize: 14, lineHeight: 19 },
  specialties: { marginTop: 6, fontSize: 14, lineHeight: 21 },
});
