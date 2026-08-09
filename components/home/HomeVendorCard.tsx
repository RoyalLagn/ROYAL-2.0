import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BadgeCheck, MapPin, Star } from "lucide-react-native";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import FavoriteHeartButton from "@/components/favorites/FavoriteHeartButton";
import SafeImage from "@/components/SafeImage";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import type { PublicVendorListing } from "@/services/publicVendorListings";
import { MembershipBadge, membershipBadgeFor } from "@/components/vendor/MembershipBadge";

type HomeVendorCardProps = {
  vendor: PublicVendorListing;
  width: number;
  imageHeight: number;
  dark: boolean;
  nearbyLabel?: string | null;
  favorite: boolean;
  fallbackSource: number;
  onOpen: () => void;
  onToggleFavorite: (source: FavoriteSourceRef) => void;
};

export default function HomeVendorCard({
  vendor,
  width,
  imageHeight,
  dark,
  nearbyLabel,
  favorite,
  fallbackSource,
  onOpen,
  onToggleFavorite,
}: HomeVendorCardProps) {
  const [interactive, setInteractive] = React.useState(false);
  const colors = brandColors(dark);
  const text = dark ? "#F5F0F3" : colors.foreground;
  const muted = colors.mutedForeground;
  const compact = width < 220;
  const membershipBadge = membershipBadgeFor(vendor.membershipPlan);

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        {
          width,
          backgroundColor: colors.card,
          borderColor: interactive ? colors.primary : colors.border,
          shadowColor: dark ? "#000000" : "#63374A",
          shadowOpacity: interactive ? 0.14 : 0.09,
        },
      ]}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${vendor.name}`}
        onPress={onOpen}
        onHoverIn={() => setInteractive(true)}
        onHoverOut={() => setInteractive(false)}
        onFocus={() => setInteractive(true)}
        onBlur={() => setInteractive(false)}
        pressScale={0.985}
        style={styles.main}
      >
        <View style={[styles.imageWrap, { height: imageHeight, backgroundColor: colors.background }]}>
          <SafeImage
            debugLabel={`home vendor card: ${vendor.name}`}
            source={{ uri: vendor.image }}
            fallbackSource={fallbackSource}
            deliveryWidth={Math.round(width)}
            deliveryHeight={Math.round(imageHeight)}
            deliveryCrop="fit"
            style={styles.image}
            resizeMode="contain"
          />

          {nearbyLabel ? (
            <View style={[styles.nearbyBadge, compact && styles.nearbyBadgeCompact]}>
              <MapPin size={11} color={colors.primaryStrong} strokeWidth={2.2} />
              <Text style={[styles.nearbyText, { color: colors.primaryStrong }]} numberOfLines={1}>
                {nearbyLabel}
              </Text>
            </View>
          ) : null}

          <View style={[styles.imageBottomRow, compact && styles.imageBottomRowCompact]}>
            <View style={[styles.ratingBadge, compact && styles.mediaBadgeCompact]}>
              <Star size={12} color={colors.rating} fill={colors.rating} />
              <Text style={styles.ratingText}>{vendor.rating}</Text>
              {!compact && vendor.reviews > 0 ? <Text style={styles.reviewText}>({vendor.reviews})</Text> : null}
            </View>
            <View style={[styles.verifiedBadge, compact && styles.mediaBadgeCompact, { backgroundColor: colors.primaryStrong }]}>
              <BadgeCheck size={12} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          </View>
        </View>

        <View style={[styles.info, compact && styles.infoCompact]}>
          <View style={styles.nameRow}>
            {membershipBadge ? <MembershipBadge planName={vendor.membershipPlan} size={compact ? 38 : 42} style={styles.membershipBadge} /> : null}
            <View style={styles.identityText}>
              <Text
                style={[styles.name, compact && styles.nameCompact, { color: text }]}
                numberOfLines={1}
              >
                {vendor.name}
              </Text>
              <Text style={[styles.category, { color: muted }]} numberOfLines={1}>
                {vendor.category}
              </Text>
            </View>
          </View>
          <View style={[styles.detailRow, compact && styles.detailRowCompact]}>
            <View style={styles.locationRow}>
              <MapPin size={12} color={muted} strokeWidth={2} />
              <Text style={[styles.location, { color: muted }]} numberOfLines={1}>
                {vendor.location}
              </Text>
            </View>
            <Text style={[styles.price, { color: colors.primaryStrong }]} numberOfLines={1}>
              {vendor.startingPrice} onwards
            </Text>
          </View>
        </View>
      </AnimatedPressable>

      <FavoriteHeartButton
        favorite={favorite}
        accessibilityLabel={favorite ? `Remove ${vendor.name} from favorites` : `Add ${vendor.name} to favorites`}
        style={[styles.favorite, compact && styles.favoriteCompact]}
        activeStyle={styles.favoriteActive}
        onToggle={onToggleFavorite}
        hitSlop={6}
        size={17}
        color="#3A3035"
        activeIconColor={colors.primaryStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardCompact: { borderRadius: 16 },
  main: { flex: 1 },
  imageWrap: { position: "relative", overflow: "hidden", backgroundColor: brandPalette.light.muted },
  image: { width: "100%", height: "100%" },
  nearbyBadge: {
    position: "absolute",
    top: 11,
    left: 11,
    maxWidth: "62%",
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  nearbyText: { flexShrink: 1, fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
  nearbyBadgeCompact: { top: 10, left: 10, minHeight: 26, maxWidth: "58%", paddingHorizontal: 8 },
  imageBottomRow: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  imageBottomRowCompact: { left: 9, right: 9, bottom: 9, gap: 5 },
  ratingBadge: {
    minHeight: 27,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(27,25,27,0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  mediaBadgeCompact: { minHeight: 26, paddingHorizontal: 7 },
  ratingText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
  reviewText: { color: "rgba(255,255,255,0.76)", fontFamily: fonts.sans.medium, fontSize: typeScale.caption },
  verifiedBadge: {
    minHeight: 27,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.86)",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  verifiedText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
  info: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 16 },
  infoCompact: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 13 },
  nameRow: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  membershipBadge: { flexShrink: 0 },
  identityText: { flex: 1, minWidth: 0, justifyContent: "center" },
  name: { fontFamily: fonts.serif.bold, fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.sectionTitle, letterSpacing: -0.3 },
  nameCompact: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact },
  category: { marginTop: 4, fontFamily: fonts.sans.medium, fontSize: typeScale.metadata },
  detailRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  detailRowCompact: { marginTop: 10, gap: 6 },
  locationRow: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  location: { flex: 1, fontFamily: fonts.sans.regular, fontSize: typeScale.caption },
  price: { maxWidth: "50%", fontFamily: fonts.sans.bold, fontSize: typeScale.caption, textAlign: "right" },
  favorite: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  favoriteActive: { backgroundColor: "rgba(255,255,255,0.97)" },
  favoriteCompact: { top: 8, right: 8, width: 34, height: 34, borderRadius: 17 },
});
