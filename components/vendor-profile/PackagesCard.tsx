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

function PackagesCard({
  price,
  onPress,
  dark = false,
  eyebrow = "Packages Start From",
  subtitle = "Customize packages available",
  buttonLabel = "View Packages",
  accessibilityLabel = "View vendor packages",
}: PackagesCardProps) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const palette = dark
    ? {
        surface: "#302127",
        border: "#583541",
        text: "#FFF8FB",
        muted: "#CFBBC4",
        eyebrow: "#F0AFC6",
        iconSurface: "#432833",
      }
    : {
        surface: "#FFFFFF",
        border: "#EFCED9",
        text: "#1E161A",
        muted: "#665A60",
        eyebrow: "#A73F61",
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
      <View style={styles.details}>
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact, { backgroundColor: palette.iconSurface }]}>
          <Tag size={compact ? 19 : 23} strokeWidth={1.8} color={dark ? "#FF78A6" : PINK} />
        </View>

        <View style={styles.copy}>
          <Text numberOfLines={2} style={[styles.eyebrow, compact && styles.eyebrowCompact, { color: palette.eyebrow }]}>{eyebrow}</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.price, compact && styles.priceCompact, { color: palette.text }]}>
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

export default React.memo(PackagesCard);

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });
const sans = Platform.select({ ios: "System", android: "sans-serif", web: "system-ui, sans-serif" });

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardCompact: { padding: 14, gap: 10, flexDirection: "column", alignItems: "stretch" },
  details: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconWrapCompact: { width: 42, height: 42, borderRadius: 14 },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 12, lineHeight: 17, fontWeight: "600", letterSpacing: 0.15 },
  eyebrowCompact: { fontSize: 10.5, lineHeight: 14 },
  price: { marginTop: 1, fontFamily: serif, fontSize: 20, lineHeight: 25, fontWeight: "700" },
  priceCompact: { fontSize: 21, lineHeight: 26 },
  subtitle: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  button: {
    minWidth: 110,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    zIndex: 1,
    shadowColor: "#A72C57",
    shadowOpacity: 0,
  },
  buttonCompact: { width: "100%", minWidth: 0, minHeight: 44, paddingHorizontal: 14 },
  buttonHovered: { transform: [{ translateY: -1 }], backgroundColor: "#C92559" },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontFamily: sans, fontSize: 13, fontWeight: "800" },
  buttonTextCompact: { fontFamily: sans, fontSize: 13, fontWeight: "800" },
});
