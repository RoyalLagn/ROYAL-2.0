import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Tag } from "lucide-react-native";

const PINK = "#E91E63";

export type PackagesCardProps = {
  price: string;
  onPress: () => void;
  dark?: boolean;
  eyebrow?: string;
  subtitle?: string;
  buttonLabel?: string;
  accessibilityLabel?: string;
};

export default function PackagesCard({
  price,
  onPress,
  dark = false,
  eyebrow = "Packages Start From",
  subtitle = "Customize packages available",
  buttonLabel = "View Packages",
  accessibilityLabel = "View vendor packages",
}: PackagesCardProps) {
  const { width } = useWindowDimensions();
  const compact = width < 440;
  const palette = dark
    ? {
        surface: "#302127",
        surfaceAccent: "#3A252E",
        border: "#583541",
        text: "#FFF8FB",
        muted: "#CFBBC4",
        eyebrow: "#F0AFC6",
        iconSurface: "#432833",
      }
    : {
        surface: "#FFF8FA",
        surfaceAccent: "#FFF0F5",
        border: "#F2CAD8",
        text: "#24191E",
        muted: "#74676D",
        eyebrow: "#B75472",
        iconSurface: "#FCE7EE",
      };

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          shadowColor: dark ? "#000000" : "#A64B6D",
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.decorationLarge, { borderColor: palette.border }]}
      />
      <View
        pointerEvents="none"
        style={[styles.decorationSmall, { borderColor: palette.border }]}
      />

      <View style={styles.details}>
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact, { backgroundColor: palette.iconSurface }]}>
          <Tag size={compact ? 19 : 23} strokeWidth={1.8} color={dark ? "#FF78A6" : PINK} />
        </View>

        <View style={styles.copy}>
          <Text numberOfLines={2} style={[styles.eyebrow, compact && styles.eyebrowCompact, { color: palette.eyebrow }]}>{eyebrow}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.price, compact && styles.priceCompact, { color: palette.text }]}>
            {price}
          </Text>
          <Text numberOfLines={2} style={[styles.subtitle, { color: palette.muted }]}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed, hovered }) => [
          styles.button,
          compact && styles.buttonCompact,
          { backgroundColor: dark ? "#F0437E" : "#D92D63" },
          hovered && Platform.OS === "web" && styles.buttonHovered,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.buttonText, compact && styles.buttonTextCompact]}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 142,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    shadowOpacity: 0.09,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardCompact: { minHeight: 128, padding: 12, gap: 8 },
  details: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 1,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconWrapCompact: { width: 44, height: 44, borderRadius: 22 },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 12, lineHeight: 17, fontWeight: "600", letterSpacing: 0.15 },
  eyebrowCompact: { fontSize: 10.5, lineHeight: 14 },
  price: { marginTop: 2, fontFamily: serif, fontSize: 29, lineHeight: 35, fontWeight: "700" },
  priceCompact: { fontSize: 24, lineHeight: 29 },
  subtitle: { marginTop: 2, fontSize: 11.5, lineHeight: 16 },
  button: {
    minWidth: 142,
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.68)",
    zIndex: 1,
    shadowColor: "#A72C57",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  buttonCompact: { minWidth: 128, minHeight: 46, paddingHorizontal: 14 },
  buttonHovered: { transform: [{ translateY: -1 }], backgroundColor: "#C92559" },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontFamily: serif, fontSize: 16, fontWeight: "700" },
  buttonTextCompact: { fontSize: 14 },
  decorationLarge: {
    position: "absolute",
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    right: -45,
    top: -54,
    opacity: 0.42,
  },
  decorationSmall: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    right: 28,
    bottom: -43,
    opacity: 0.32,
  },
});
