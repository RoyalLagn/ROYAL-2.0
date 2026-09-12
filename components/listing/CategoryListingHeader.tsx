import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Crown } from "lucide-react-native";
import { fonts, typeLeading, typeScale, typeStyles } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

type CategoryListingHeaderProps = {
  category: string;
  dark: boolean;
  subtitle?: string;
};

export default function CategoryListingHeader({
  category,
  dark,
  subtitle,
}: CategoryListingHeaderProps) {
  const text = dark ? "#F8F2F5" : "#18111B";

  return (
    <View style={styles.header}>
      <View pointerEvents="none" style={styles.center}>
        <Text numberOfLines={1} style={[styles.title, { color: text }]}>{category}</Text>
        <View style={styles.ornament}>
          <View style={styles.line} />
          <Crown size={18} color={PINK} strokeWidth={1.8} />
          <View style={styles.line} />
        </View>
        {subtitle ? <Text style={[styles.subtitle, { color: dark ? "#CFC3C9" : "#777078" }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 108, alignItems: "center", justifyContent: "center", paddingTop: 6, paddingBottom: 12 },
  center: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 6 },
  title: { maxWidth: "100%", ...typeStyles.editorialPageTitle },
  ornament: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 10 },
  line: { width: 34, height: 1, backgroundColor: "#E9B65C" },
  subtitle: { marginTop: 7, fontFamily: fonts.sans.regular, fontSize: typeScale.body, lineHeight: typeLeading.body, textAlign: "center" },
});
