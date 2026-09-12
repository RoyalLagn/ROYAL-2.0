import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeStyles } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";

type ResultsSummaryProps = {
  count: number;
  category: string;
  sortLabel: string;
  dark: boolean;
  onSort: () => void;
  showSort?: boolean;
  /** True when more pages exist beyond what's currently loaded -- shows
   * "20+" instead of "20" so the count never falsely implies the loaded
   * page is the complete total. */
  hasMore?: boolean;
};

export default function ResultsSummary({ count, category, sortLabel, dark, onSort, hasMore, showSort = true }: ResultsSummaryProps) {
  const [sortFocused, setSortFocused] = useState(false);
  const colors = brandColors(dark);
  const text = dark ? "#F8F2F5" : colors.foreground;
  const countLabel = count === 1 && !hasMore ? category.replace(/s$/, "") : category;
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[styles.count, { color: text }]}>{count}{hasMore ? "+" : ""} {countLabel} found</Text>
      {showSort ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sort results, currently ${sortLabel}`}
        onPress={onSort}
        onHoverIn={() => setSortFocused(true)}
        onHoverOut={() => setSortFocused(false)}
        onFocus={() => setSortFocused(true)}
        onBlur={() => setSortFocused(false)}
        style={({ pressed }) => [
          styles.sort,
          sortFocused && { backgroundColor: colors.muted },
          pressed && styles.pressed,
        ]}
      >
        <Text numberOfLines={1} style={[styles.sortPrefix, { color: colors.mutedForeground }]}>Sort by:</Text>
        <Text numberOfLines={1} style={[styles.sortText, { color: colors.primaryStrong }]}>{sortLabel}</Text>
        <ChevronDown size={13} color={colors.primaryStrong} />
      </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  count: { flex: 1, minWidth: 0, ...typeStyles.cardTitle },
  sort: { maxWidth: "48%", minHeight: 40, paddingHorizontal: 8, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  sortPrefix: { fontFamily: fonts.sans.regular, fontSize: typeScale.metadata },
  sortText: { flexShrink: 1, fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
