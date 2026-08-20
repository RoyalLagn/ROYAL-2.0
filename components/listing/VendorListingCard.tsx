import React, { useState } from "react";
import { type ImageURISource, StyleSheet, Text, View, } from "react-native";
import { BadgeCheck, ChevronRight, Crown, MapPin, Star } from "lucide-react-native";
import FavoriteHeartButton from "@/components/favorites/FavoriteHeartButton";
import SafeImage from "@/components/SafeImage";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import { MembershipBadge, membershipBadgeFor } from "@/components/vendor/MembershipBadge";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import type { PublicVendorListing } from "@/services/publicVendorListings";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading, typeStyles } from "@/constants/typography";

const PINK = brandPalette.light.primary;

type VendorListingCardProps = {
  vendor: PublicVendorListing;
  dark: boolean;
  compact: boolean;
  favorite: boolean;
  fallbackImage: number | ImageURISource;
  onOpen: () => void;
  onToggleFavorite: (source: FavoriteSourceRef) => void;
};

function VendorListingCard({
  vendor,
  dark,
  compact,
  favorite,
  fallbackImage,
  onOpen,
  onToggleFavorite,
}: VendorListingCardProps) {
  const [interactive, setInteractive] = useState(false);
  const { getRating } = useReviewRatings();
  const displayedRating = getRating(vendor.id, vendor.rating, vendor.reviews);
  const colors = brandColors(dark);
  const surface = colors.card;
  const text = dark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const imageUri = vendor.image.replace(/([?&])w=\d+/, "$1w=900");
  const membershipBadge = membershipBadgeFor(vendor.membershipPlan);

  return (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : styles.cardWide,
        {
          backgroundColor: surface,
          borderColor: interactive ? colors.primary : border,
          shadowColor: dark ? "#000000" : "#63374A",
          shadowOpacity: interactive ? 0.14 : 0.08,
          shadowRadius: interactive ? 19 : 10,
          shadowOffset: { width: 0, height: interactive ? 9 : 4 },
          elevation: interactive ? 4 : 2,
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
        pressScale={0.99}
        style={styles.main}
      >
        <View style={[styles.imageWrap, compact ? styles.imageCompact : styles.imageWide]}>
          <SafeImage
            accessibilityLabel={`${vendor.name} listing`}
            source={imageUri}
            fallbackSource={fallbackImage}
            debugLabel={`${vendor.name} listing`}
            deliveryWidth={compact ? 138 : 184}
            deliveryHeight={compact ? 146 : 184}
            deliveryCrop="fit"
            resizeMode="contain"
            style={styles.image}
          />
          {vendor.isTopRated ? (
            <View style={styles.topRated}>
              <Crown size={11} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.topRatedText}>Top Rated</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.body, compact && styles.bodyCompact]}>
          <View style={[styles.identityRow, compact && styles.identityRowCompact]}>
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <Text numberOfLines={compact ? 1 : 2} style={[styles.name, compact && styles.nameCompact, { color: text }]}>
                  {vendor.name}
                </Text>
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel="Verified vendor"
                  style={[styles.verifiedBadge, { backgroundColor: dark ? "#38242D" : "#FFF0F6" }]}
                >
                  <BadgeCheck size={compact ? 14 : 15} color={colors.primaryStrong} strokeWidth={2.4} />
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.category, { color: muted }]}>
                {vendor.category}
              </Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Star size={13} color="#F3AC24" fill="#F3AC24" />
            <Text style={[styles.rating, { color: text }]}>{displayedRating.rating.toFixed(1)}</Text>
            <Text style={[styles.reviews, { color: muted }]}>({displayedRating.reviews})</Text>
          </View>
          <View style={styles.meta}>
            <MapPin size={13} color={PINK} />
            <Text numberOfLines={1} style={[styles.location, { color: muted }]}>{vendor.location}</Text>
          </View>
          {!compact && vendor.description ? (
            <Text numberOfLines={2} style={[styles.description, { color: muted }]}>{vendor.description}</Text>
          ) : null}
          {!compact ? (
            <View style={styles.tags}>
              {[...vendor.tags, ...vendor.services].filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: dark ? "#34272D" : "#FFF2F6" }]}>
                  <Text numberOfLines={1} style={[styles.tagText, { color: dark ? "#E7C9D5" : "#96536B" }]}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.bottomRow, compact && styles.bottomRowCompact]}>
            <View style={[styles.price, compact && styles.priceCompact, { backgroundColor: dark ? "#38242D" : "#FFF0F6" }]}>
              <Text numberOfLines={1} style={styles.priceText}>Starts from {vendor.startingPrice}</Text>
            </View>
            {!compact ? (
              <View style={styles.viewProfile}>
                <Text style={[styles.viewProfileText, { color: colors.primaryStrong }]}>View profile</Text>
                <ChevronRight size={14} color={colors.primaryStrong} />
              </View>
            ) : null}
          </View>
        </View>
      </AnimatedPressable>

      {membershipBadge ? (
        <View pointerEvents="none" style={styles.cardMembershipBadge}>
          <MembershipBadge planName={vendor.membershipPlan} size={compact ? 42 : 50} />
        </View>
      ) : null}

      <FavoriteHeartButton
        favorite={favorite}
        accessibilityLabel={favorite ? `Remove ${vendor.name} from favorites` : `Add ${vendor.name} to favorites`}
        onToggle={onToggleFavorite}
        hitSlop={5}
        style={[
          styles.favorite,
          { backgroundColor: dark ? "rgba(30,27,29,.92)" : "rgba(255,255,255,.94)", borderColor: border },
        ]}
        hoveredStyle={styles.favoriteHovered}
        pressedStyle={styles.favoritePressed}
        size={17}
      />
    </View>
  );
}

export default React.memo(VendorListingCard);

const styles = StyleSheet.create({
  card: { width: "100%", borderWidth: 1, overflow: "hidden", position: "relative", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardCompact: { height: 164, borderRadius: 16 },
  cardWide: { height: 200, borderRadius: 16 },
  main: { flex: 1, flexDirection: "row", padding: 8, gap: 14 },
  imageWrap: { position: "relative", flexShrink: 0, borderRadius: 13, overflow: "hidden", backgroundColor: "#F8E9EE" },
  imageCompact: { width: 138, height: 146 },
  imageWide: { width: 184, height: 184 },
  // react-native-web falls back to a local image asset's own intrinsic
  // pixel size whenever the style doesn't set explicit width/height
  // (StyleSheet.absoluteFillObject only sets inset, not width/height), so a
  // small fallback asset would render at its native size instead of filling
  // imageWrap. Force fill sizing explicitly so inset alone can't be beaten.
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  topRated: { position: "absolute", top: 10, left: 0, minHeight: 29, borderTopRightRadius: 999, borderBottomRightRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: PINK },
  topRatedText: { color: "#FFFFFF", fontSize: typeScale.caption, fontWeight: "700" },
  body: { flex: 1, minWidth: 0, paddingVertical: 8, paddingRight: 64, justifyContent: "center" },
  bodyCompact: { paddingVertical: 4, paddingRight: 48 },
  identityRow: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  identityRowCompact: { gap: 6, marginBottom: 2 },
  identityText: { flex: 1, minWidth: 0, justifyContent: "center" },
  nameRow: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 6 },
  name: { ...typeStyles.editorialCardTitle, flexShrink: 1 },
  nameCompact: { fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle },
  verifiedBadge: { width: 22, height: 22, flexShrink: 0, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  category: { marginTop: 2, fontFamily: fonts.sans.medium, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  meta: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: 5 },
  rating: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  reviews: { fontFamily: fonts.sans.regular, fontSize: typeScale.metadata },
  location: { flex: 1, minWidth: 0, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata },
  description: { maxWidth: 580, marginTop: 5, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  tags: { marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { maxWidth: "46%", minHeight: 25, borderRadius: 999, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  tagText: { maxWidth: "100%", fontFamily: fonts.sans.semibold, fontSize: typeScale.caption },
  bottomRow: { marginTop: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  bottomRowCompact: { marginTop: 4 },
  price: { maxWidth: "62%", alignSelf: "flex-start", minHeight: 31, borderRadius: 999, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  priceCompact: { maxWidth: "100%", paddingHorizontal: 9 },
  priceText: { maxWidth: "100%", color: PINK, fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  viewProfile: { minHeight: 36, marginRight: 52, flexDirection: "row", alignItems: "center", gap: 2 },
  viewProfileText: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  cardMembershipBadge: { position: "absolute", zIndex: 2, right: 8, bottom: 8 },
  favorite: { position: "absolute", zIndex: 3, top: 10, right: 10, width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  favoriteHovered: { transform: [{ translateY: -1 }] },
  favoritePressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
});
