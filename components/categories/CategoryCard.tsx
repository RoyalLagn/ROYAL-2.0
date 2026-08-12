import React from "react";
import { Platform, type ImageURISource, Pressable, StyleSheet, Text, View, } from "react-native";
import SafeImage from "@/components/SafeImage";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";

export type CategoryCardItem = {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  image: string;
  fallbackImage: number | ImageURISource;
  vendorCount?: number;
};

type CategoryCardProps = {
  category: CategoryCardItem;
  dark: boolean;
  compact: boolean;
  onPress: () => void;
};

function CategoryCard({ category, dark, compact, onPress }: CategoryCardProps) {
  const Icon = category.icon;
  const text = dark ? "#F8F2F5" : "#17111D";
  const muted = dark ? "#B5A9AF" : "#776A79";
  const surface = dark ? "#201D1F" : "#FFFFFF";
  const border = dark ? "#3D3036" : "#F3D3DE";
  const iconSurface = dark ? `${category.iconColor}1E` : category.iconBg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Browse ${category.name}`}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        compact ? styles.cardCompact : styles.cardWide,
        { backgroundColor: surface, borderColor: border },
        hovered && Platform.OS === "web" && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.details, compact && styles.detailsCompact]}>
        <View
          style={[
            styles.iconCircle,
            compact && styles.iconCircleCompact,
            { backgroundColor: iconSurface, borderColor: `${category.iconColor}2E` },
          ]}
        >
          <Icon size={compact ? 25 : 29} color={category.iconColor} strokeWidth={1.8} />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={[styles.name, compact && styles.nameCompact, { color: text }]}>
            {category.name}
            {typeof category.vendorCount === "number" ? ` (${category.vendorCount})` : ""}
          </Text>
          <Text numberOfLines={3} style={[styles.description, compact && styles.descriptionCompact, { color: muted }]}>
            {category.description}
          </Text>
        </View>
      </View>

      <View style={[styles.imageWrap, compact && styles.imageWrapCompact]}>
        <SafeImage
          accessibilityLabel={`${category.name} category`}
          source={category.image}
          fallbackSource={category.fallbackImage}
          debugLabel={`${category.name} category`}
          resizeMode="cover"
          style={styles.image}
        />
      </View>
    </Pressable>
  );
}

export default React.memo(CategoryCard);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#613548",
    shadowOpacity: 0.055,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardCompact: { height: 120, borderRadius: 16 },
  cardWide: { height: 154, borderRadius: 16 },
  cardHovered: { borderColor: "#E8B8C9", shadowOpacity: 0.1, transform: [{ translateY: -2 }] },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.98 }] },
  details: { flex: 1, minWidth: 0, paddingHorizontal: 20, paddingVertical: 18, flexDirection: "row", alignItems: "center", gap: 16 },
  detailsCompact: { paddingHorizontal: 14, paddingVertical: 13, gap: 11 },
  iconCircle: { width: 62, height: 62, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  iconCircleCompact: { width: 52, height: 52, borderRadius: 16 },
  copy: { flex: 1, minWidth: 0 },
  name: { ...typeStyles.editorialCardTitle, marginBottom: 6 },
  nameCompact: { fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle, marginBottom: 3 },
  description: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, fontWeight: "400" },
  descriptionCompact: { fontSize: typeScale.metadata, lineHeight: typeLeading.label },
  imageWrap: { width: 150, height: "100%", overflow: "hidden", backgroundColor: "#F8E9EE" },
  imageWrapCompact: { width: 108 },
  // react-native-web falls back to a local image asset's own intrinsic
  // pixel size whenever the style doesn't set explicit width/height
  // (StyleSheet.absoluteFillObject only sets inset, not width/height), so a
  // small fallback asset would render at its native size instead of filling
  // imageWrap. Force fill sizing explicitly so inset alone can't be beaten.
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
});
