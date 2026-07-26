import React, { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Crown, Heart, MapPin, Star } from "lucide-react-native";
import type { PublicVendorListing } from "@/services/publicVendorListings";
import { useReviewRatings } from "@/context/ReviewRatingsContext";

const PINK = "#E91E63";

type VendorListingCardProps = {
  vendor: PublicVendorListing;
  dark: boolean;
  compact: boolean;
  favorite: boolean;
  fallbackImage: number;
  onOpen: () => void;
  onToggleFavorite: () => void;
};

export default function VendorListingCard({
  vendor,
  dark,
  compact,
  favorite,
  fallbackImage,
  onOpen,
  onToggleFavorite,
}: VendorListingCardProps) {
  const { getRating } = useReviewRatings();
  const displayedRating = getRating(vendor.id, vendor.rating, vendor.reviews);
  const [imageFailed, setImageFailed] = useState(false);
  const surface = dark ? "#201D1F" : "#FFFFFF";
  const text = dark ? "#F8F2F5" : "#181118";
  const muted = dark ? "#B3A8AE" : "#776C73";
  const border = dark ? "#3D3036" : "#F2D9E1";
  const imageUri = vendor.image.replace(/([?&])w=\d+/, "$1w=900");

  return (
    <View style={[styles.card, compact ? styles.cardCompact : styles.cardWide, { backgroundColor: surface, borderColor: border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${vendor.name}`}
        onPress={onOpen}
        style={({ pressed, hovered }) => [
          styles.main,
          hovered && Platform.OS === "web" && styles.hover,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.imageWrap, compact ? styles.imageCompact : styles.imageWide]}>
          <Image
            accessibilityLabel={`${vendor.name} listing`}
            source={imageFailed ? fallbackImage : { uri: imageUri }}
            defaultSource={fallbackImage}
            resizeMode="cover"
            onError={() => {
              if (!imageFailed) setImageFailed(true);
            }}
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
          <Text numberOfLines={2} style={[styles.name, compact && styles.nameCompact, { color: text }]}>{vendor.name}</Text>
          <View style={styles.meta}>
            <Star size={13} color="#F3AC24" fill="#F3AC24" />
            <Text style={[styles.rating, { color: text }]}>{displayedRating.rating.toFixed(1)}</Text>
            <Text style={[styles.reviews, { color: muted }]}>({displayedRating.reviews})</Text>
          </View>
          <View style={styles.meta}>
            <MapPin size={13} color={PINK} />
            <Text numberOfLines={1} style={[styles.location, { color: muted }]}>{vendor.location}</Text>
          </View>
          <View style={styles.tags}>
            {vendor.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: dark ? "#34272D" : "#FFF2F6" }]}>
                <Text numberOfLines={1} style={[styles.tagText, { color: dark ? "#E7C9D5" : "#96536B" }]}>{tag}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.price, { backgroundColor: dark ? "#38242D" : "#FFF0F6" }]}>
            <Text numberOfLines={1} style={styles.priceText}>Starts from {vendor.startingPrice}</Text>
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? `Remove ${vendor.name} from favorites` : `Add ${vendor.name} to favorites`}
        onPress={onToggleFavorite}
        style={({ pressed, hovered }) => [
          styles.favorite,
          { backgroundColor: dark ? "rgba(30,27,29,.92)" : "rgba(255,255,255,.94)", borderColor: border },
          hovered && Platform.OS === "web" && { transform: [{ translateY: -1 }] },
          pressed && styles.favoritePressed,
        ]}
      >
        <Heart size={17} color={PINK} fill={favorite ? PINK : "transparent"} />
      </Pressable>
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  card: { width: "100%", borderWidth: 1, overflow: "hidden", position: "relative", shadowColor: "#63374A", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  cardCompact: { minHeight: 172, borderRadius: 20 },
  cardWide: { minHeight: 220, borderRadius: 24 },
  main: { flex: 1, flexDirection: "row", padding: 8, gap: 13 },
  hover: { backgroundColor: "rgba(233,30,99,.018)" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  imageWrap: { position: "relative", flexShrink: 0, borderRadius: 16, overflow: "hidden", backgroundColor: "#F8E9EE" },
  imageCompact: { width: "42%", maxWidth: 146, minHeight: 154 },
  imageWide: { width: "36%", maxWidth: 340, minHeight: 202 },
  image: { width: "100%", height: "100%" },
  topRated: { position: "absolute", top: 10, left: 0, minHeight: 29, borderTopRightRadius: 999, borderBottomRightRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: PINK },
  topRatedText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  body: { flex: 1, minWidth: 0, paddingVertical: 10, paddingRight: 42, justifyContent: "center" },
  bodyCompact: { paddingVertical: 5, paddingRight: 34 },
  name: { fontFamily: serif, fontSize: 23, lineHeight: 28, fontWeight: "700", letterSpacing: -0.35, marginBottom: 9 },
  nameCompact: { fontSize: 17, lineHeight: 21, marginBottom: 6 },
  meta: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: 5 },
  rating: { fontSize: 11.5, fontWeight: "700" },
  reviews: { fontSize: 10.5 },
  location: { flex: 1, minWidth: 0, fontSize: 10.5 },
  tags: { marginTop: 7, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { maxWidth: "46%", minHeight: 25, borderRadius: 999, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  tagText: { maxWidth: "100%", fontSize: 9, fontWeight: "600" },
  price: { maxWidth: "100%", alignSelf: "flex-start", minHeight: 31, marginTop: 8, borderRadius: 999, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  priceText: { maxWidth: "100%", color: PINK, fontSize: 10.5, fontWeight: "800" },
  favorite: { position: "absolute", zIndex: 3, top: 12, right: 12, width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  favoritePressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
});
