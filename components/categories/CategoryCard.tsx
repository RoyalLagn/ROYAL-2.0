import React from "react";
import {
  type ImageURISource,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import SafeImage from "@/components/SafeImage";

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
      style={[
        styles.card,
        compact ? styles.cardCompact : styles.cardWide,
        { backgroundColor: surface, borderColor: border },
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

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#613548",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  cardCompact: { height: 116, borderRadius: 20 },
  cardWide: { height: 142, borderRadius: 22 },
  details: { flex: 1, minWidth: 0, paddingHorizontal: 18, paddingVertical: 18, flexDirection: "row", alignItems: "center", gap: 15 },
  detailsCompact: { paddingHorizontal: 12, paddingVertical: 13, gap: 10 },
  iconCircle: { width: 68, height: 68, borderRadius: 34, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  iconCircleCompact: { width: 58, height: 58, borderRadius: 29 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontFamily: serif, fontSize: 20, lineHeight: 25, fontWeight: "700", letterSpacing: -0.3, marginBottom: 5 },
  nameCompact: { fontSize: 17, lineHeight: 21, marginBottom: 3 },
  description: { fontSize: 12, lineHeight: 18, fontWeight: "400" },
  descriptionCompact: { fontSize: 10.5, lineHeight: 15 },
  imageWrap: { width: 132, height: 134, margin: 4, marginLeft: 0, borderRadius: 18, overflow: "hidden", backgroundColor: "#F8E9EE" },
  imageWrapCompact: { width: 106, height: 108, borderRadius: 17 },
  image: StyleSheet.absoluteFillObject,
});
