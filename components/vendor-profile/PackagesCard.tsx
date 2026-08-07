import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Tag } from "lucide-react-native";
import { fonts, typeScale, typeLeading, typeStyles } from "@/constants/typography";

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
  const [focused, setFocused] = useState(false);
  const compact = width < 360;
  const palette = dark
    ? {
        surface: "#161E2E",
        border: "#232C3D",
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed, hovered }) => [
          styles.button,
          compact && styles.buttonCompact,
          { backgroundColor: PINK },
          (hovered || focused) && Platform.OS === "web" && styles.buttonHovered,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.buttonText, compact && styles.buttonTextCompact]}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

export default React.memo(PackagesCard);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
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
  eyebrow: { fontFamily: fonts.sans.semibold, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, letterSpacing: 0.1 },
  eyebrowCompact: { fontSize: typeScale.metadata, lineHeight: typeLeading.caption },
  price: { marginTop: 1, ...typeStyles.metric },
  priceCompact: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  subtitle: { marginTop: 3, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  button: {
    minWidth: 110,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    zIndex: 1,
    shadowColor: "#A72C57",
    shadowOpacity: 0,
  },
  buttonCompact: { width: "100%", minWidth: 0, minHeight: 44, paddingHorizontal: 14 },
  buttonHovered: { transform: [{ translateY: -1 }], backgroundColor: "#BE185D" },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  buttonTextCompact: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
});
