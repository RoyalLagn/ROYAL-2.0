import React, { useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";
import { BadgeCheck, Crown, MapPin, Share2, Star } from "lucide-react-native";
import FavoriteHeartButton from "@/components/favorites/FavoriteHeartButton";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import { MembershipBadge, membershipBadgeFor } from "@/components/vendor/MembershipBadge";

const PINK = brandPalette.light.primary;

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
  membershipPlan?: string | null;
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
  membershipPlan,
  dark = false,
  children,
  overlap = true,
}: VendorInfoPanelProps) {
  const { width } = useWindowDimensions();
  const [shareFocused, setShareFocused] = useState(false);
  const compact = width < 440;
  const brand = brandColors(dark);
  const colors = {
    surface: dark ? brand.card : "rgba(255, 253, 254, 0.97)",
    text: brand.foreground,
    muted: brand.mutedForeground,
    badge: dark ? "#35262C" : "#FFF5F7",
    badgeBorder: dark ? "#553642" : "#F4D8E1",
    actionSurface: dark ? "#202632" : "#FFFFFF",
    actionBorder: dark ? "#303846" : "#F2DDE5",
    specialtySurface: dark ? "#25202A" : "#FFF2F6",
    specialtyBorder: "transparent",
  };
  const membershipBadge = membershipBadgeFor(membershipPlan);
  const hasActions = Boolean(membershipBadge || onToggleFavorite || onShare);

  return (
    <View style={[styles.panel, !overlap && styles.panelEmbedded, { backgroundColor: colors.surface, borderColor: dark ? "#303846" : "rgba(190, 123, 103, 0.16)" }]}>
      <View style={styles.headingRow}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, compact && styles.nameCompact, { color: colors.text }]}>{name}</Text>
          {verified ? (
            <View accessibilityLabel="Verified vendor" style={[styles.verifiedBadge, { backgroundColor: dark ? "#39242D" : "#FFF0F6" }]}>
              <BadgeCheck size={14} color={dark ? "#FF8AB2" : PINK} strokeWidth={2.2} />
              {!compact ? <Text style={[styles.verifiedText, { color: dark ? "#FFB0CA" : "#BE185D" }]}>Verified</Text> : null}
            </View>
          ) : null}
        </View>
        {topRated || hasActions ? (
          <View style={styles.headingActions}>
            {membershipBadge ? <MembershipBadge planName={membershipPlan} size={48} /> : null}
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
                hoveredStyle={styles.actionButtonHovered}
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
                onFocus={() => setShareFocused(true)}
                onBlur={() => setShareFocused(false)}
                style={({ pressed, hovered }) => [
                  styles.actionButton,
                  { backgroundColor: colors.actionSurface, borderColor: colors.actionBorder },
                  (hovered || shareFocused) && Platform.OS === "web" && styles.actionButtonHovered,
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
    borderWidth: 1,
    shadowColor: "#3C2028",
    shadowOpacity: 0.065,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  panelEmbedded: { maxWidth: 980, alignSelf: "center", marginTop: 0, paddingTop: 22, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
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
    fontFamily: fonts.serif.bold,
    fontSize: typeScale.editorialPageTitle,
    lineHeight: typeLeading.editorialPageTitle,
    letterSpacing: -0.35,
  },
  nameCompact: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  verifiedBadge: { flexShrink: 0, minHeight: 28, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { fontFamily: fonts.sans.bold, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
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
    color: "#BE185D",
    fontFamily: fonts.serif.semibold,
    fontSize: typeScale.bodyCompact,
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
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  actionButtonHovered: { backgroundColor: "#FFF5F8", borderColor: "#E91E63" },
  metaRow: {
    marginTop: 7,
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 4,
  },
  rating: { fontFamily: fonts.sans.bold, fontSize: typeScale.body },
  metaText: { fontFamily: fonts.sans.regular, fontSize: typeScale.bodyCompact },
  separator: { fontSize: typeScale.body, paddingHorizontal: 1 },
  location: { minWidth: 0, flexShrink: 1, fontFamily: fonts.sans.regular, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact },
  specialties: { marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  specialtyChip: { maxWidth: "48%", minHeight: 25, borderRadius: 12, borderWidth: 0, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  specialtyText: { maxWidth: "100%", fontFamily: fonts.sans.semibold, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
});
