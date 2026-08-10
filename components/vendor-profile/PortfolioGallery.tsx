import React, { useState } from "react";
import { Image, type ImageSourcePropType, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, } from "react-native";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";

const PINK = "#E91E63";

export type PortfolioItem = {
  id: string | number;
  image: ImageSourcePropType | string;
  alt?: string;
};

type PortfolioGalleryProps = {
  items: PortfolioItem[];
  dark?: boolean;
  title?: string;
  emptyLabel?: string;
  fallbackImage?: ImageSourcePropType;
  onViewAll?: () => void;
  onOpenItem?: (item: PortfolioItem, index: number) => void;
};

function imageSource(image: PortfolioItem["image"]): ImageSourcePropType {
  return typeof image === "string" ? { uri: image } : image;
}

function PortfolioThumbnail({
  item,
  index,
  width,
  dark,
  fallbackImage,
  onOpen,
}: {
  item: PortfolioItem;
  index: number;
  width: number;
  dark: boolean;
  fallbackImage?: ImageSourcePropType;
  onOpen?: (item: PortfolioItem, index: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const source = failed && fallbackImage ? fallbackImage : imageSource(item.image);

  return (
    <Pressable
      accessibilityRole={onOpen ? "button" : "image"}
      accessibilityLabel={item.alt ?? `Open portfolio image ${index + 1}`}
      disabled={!onOpen}
      onPress={() => onOpen?.(item, index)}
      style={({ pressed, hovered }) => [
        styles.thumbnail,
        {
          width,
          backgroundColor: dark ? "#2B2528" : "#FBEFF3",
          borderColor: dark ? "#4A3940" : "#F4D6DF",
        },
        hovered && Platform.OS === "web" && styles.thumbnailHovered,
        pressed && styles.thumbnailPressed,
      ]}
    >
      <Image
        source={source}
        resizeMode="cover"
        onError={() => setFailed(true)}
        style={styles.image}
      />
    </Pressable>
  );
}

export default function PortfolioGallery({
  items,
  dark = false,
  title = "Portfolio",
  emptyLabel = "Portfolio images will appear here.",
  fallbackImage,
  onViewAll,
  onOpenItem,
}: PortfolioGalleryProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const thumbnailWidth = viewportWidth >= 900 ? 218 : viewportWidth >= 600 ? 190 : 156;
  const text = dark ? "#FFF8FB" : "#1D1519";
  const muted = dark ? "#C6BAC0" : "#655A60";

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={[styles.heading, { color: text }]}>{title}</Text>
        {onViewAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View all ${title.toLowerCase()}`}
            onPress={onViewAll}
            hitSlop={8}
            style={({ pressed, hovered }) => [
              styles.viewAll,
              hovered && Platform.OS === "web" && styles.viewAllHovered,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Text aria-hidden style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.ornamentRow}>
        <View style={styles.ornamentLine} />
        <View style={styles.ornamentDot} />
        <View style={styles.ornamentLine} />
      </View>

      {items.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gallery}
          decelerationRate="fast"
        >
          {items.map((item, index) => (
            <PortfolioThumbnail
              key={item.id}
              item={item}
              index={index}
              width={thumbnailWidth}
              dark={dark}
              fallbackImage={fallbackImage}
              onOpen={onOpenItem}
            />
          ))}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.empty,
            {
              backgroundColor: dark ? "#282225" : "#FFF8FA",
              borderColor: dark ? "#49373F" : "#F3D7E0",
            },
          ]}
        >
          <Text style={[styles.emptyText, { color: muted }]}>{emptyLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { width: "100%", paddingVertical: 4 },
  headingRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  heading: {
    flexShrink: 1,
    ...typeStyles.editorialSectionTitle,
  },
  viewAll: {
    minHeight: 38,
    paddingLeft: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  viewAllHovered: { opacity: 0.76, transform: [{ translateX: 2 }] },
  viewAllText: { color: PINK, ...typeStyles.button },
  chevron: { color: PINK, fontSize: typeScale.editorialPageTitle, lineHeight: typeLeading.metric, fontWeight: "300" },
  ornamentRow: { width: 88, height: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#D8A55B" },
  ornamentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D8A55B" },
  gallery: { paddingTop: 13, paddingBottom: 5, paddingRight: 2, gap: 12 },
  thumbnail: {
    aspectRatio: 0.92,
    maxHeight: 230,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    shadowColor: "#8D5368",
    shadowOpacity: 0.09,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  thumbnailHovered: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.14,
  },
  thumbnailPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  image: { width: "100%", height: "100%" },
  empty: {
    minHeight: 112,
    marginTop: 13,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyText: { fontSize: typeScale.body, lineHeight: typeLeading.body, textAlign: "center" },
  pressed: { opacity: 0.66 },
});
