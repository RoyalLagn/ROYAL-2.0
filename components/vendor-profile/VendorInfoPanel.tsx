import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BadgeCheck, Crown, MapPin, Share2, Star } from "lucide-react-native";
import FavoriteHeartButton from "@/components/favorites/FavoriteHeartButton";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";

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
  onToggleFavorite?: (source: FavoriteSourceRef) => void;
  onShare?: () => void;
  dark?: boolean;
  children?: React.ReactNode;
  overlap?: boolean;
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
  overlap = true,
}: VendorInfoPanelProps) {
  const { width } = useWindowDimensions();
  const compact = width < 440;
  const colors = {
    surface: dark ? "#141922" : "#FFFFFF",
    text: dark ? "#FFF8FB" : "#1B1418",
    muted: dark ? "#C8BCC2" : "#62575D",
    badge: dark ? "#35262C" : "#FFF5F7",
    badgeBorder: dark ? "#553642" : "#F4D8E1",
    actionSurface: dark ? "#202632" : "#FFFFFF",
    actionBorder: dark ? "#303846" : "#ECE7EA",
    specialtySurface: dark ? "#25202A" : "#FFF2F6",
    specialtyBorder: "transparent",
  };
  const hasActions = Boolean(onToggleFavorite || onShare);

  return (
    <View style={[styles.panel, !overlap && styles.panelEmbedded, { backgroundColor: colors.surface }]}>
      <View style={styles.headingRow}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, compact && styles.nameCompact, { color: colors.text }]}>{name}</Text>
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
          <View style={styles.headingActions}>
            {topRated ? (
              <View style={[styles.topRated, { backgroundColor: colors.badge, borderColor: colors.badgeBorder }]}>
                <Crown size={15} color="#C78439" strokeWidth={1.8} />
                <Text style={styles.topRatedText}>Top Rated</Text>
              </View>
            ) : null}
            {onToggleFavorite ? (
              <FavoriteHeartButton
                favorite={favorite}
                accessibilityLabel={favorite ? "Remove vendor from favorites" : "Add vendor to favorites"}
                hitSlop={8}
                onToggle={onToggleFavorite}
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.actionSurface, borderColor: colors.actionBorder },
                ]}
                pressedStyle={styles.actionButtonPressed}
                size={18}
              />
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
        <View style={styles.specialties}>
          {specialties.slice(0, 4).map((specialty, index) => (
            <View
              key={`${specialty}-${index}`}
              style={[
                styles.specialtyChip,
                {
                  backgroundColor: colors.specialtySurface,
                  borderColor: colors.specialtyBorder,
                },
              ]}
            >
              <Text numberOfLines={1} style={[styles.specialtyText, { color: colors.muted }]}>
                {specialty}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    marginTop: -20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 0,
    position: "relative",
    zIndex: 2,
    shadowColor: "#6F3048",
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  panelEmbedded: { marginTop: 0 },
  headingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nameLine: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 7,
  },
  name: {
    flexShrink: 1,
    fontFamily: serif,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  nameCompact: { fontSize: 21, lineHeight: 26 },
  topRated: {
    flexShrink: 0,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topRatedText: {
    color: "#C34D71",
    fontFamily: serif,
    fontSize: 12,
    fontWeight: "600",
  },
  headingActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7C4056",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  actionButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  metaRow: {
    marginTop: 7,
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 4,
  },
  rating: { fontSize: 14, fontWeight: "800" },
  metaText: { fontSize: 13 },
  separator: { fontSize: 14, paddingHorizontal: 1 },
  location: { minWidth: 0, flexShrink: 1, fontSize: 13, lineHeight: 18 },
  specialties: { marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  specialtyChip: { maxWidth: "48%", minHeight: 25, borderRadius: 12, borderWidth: 0, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  specialtyText: { maxWidth: "100%", fontSize: 10.5, lineHeight: 14, fontWeight: "700" },
});
