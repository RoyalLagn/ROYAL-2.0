import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Crown } from "lucide-react-native";
import { typeLeading, typeScale, typeStyles } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

type CategoryListingHeaderProps = {
  category: string;
  dark: boolean;
};

export default function CategoryListingHeader({
  category,
  dark,
}: CategoryListingHeaderProps) {
  const text = dark ? "#F8F2F5" : "#18111B";

  return (
    <View style={styles.header}>
      <View pointerEvents="none" style={styles.center}>
        <Text numberOfLines={1} style={[styles.title, { color: text }]}>{category}</Text>
        <View style={styles.ornament}>
          <View style={styles.line} />
          <Crown size={14} color={PINK} strokeWidth={1.7} />
          <View style={styles.line} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 58, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 6 },
  title: { maxWidth: "100%", ...typeStyles.editorialPageTitle, fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.editorialCardTitle, letterSpacing: -0.3 },
  ornament: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 7 },
  line: { width: 30, height: 1, backgroundColor: "#E9B65C" },
});
