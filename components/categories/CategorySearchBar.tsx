import React, { useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { SlidersHorizontal } from "lucide-react-native";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale } from "@/constants/typography";

const PINK = brandPalette.light.primary;

type CategorySearchBarProps = {
  dark: boolean;
  query: string;
  activeFilterCount?: number;
  accessibilityLabel?: string;
  placeholder?: string;
  onChangeQuery: (value: string) => void;
  onOpenFilters: () => void;
};

export default function CategorySearchBar({
  dark,
  query,
  activeFilterCount = 0,
  accessibilityLabel = "Search categories",
  placeholder = "Search categories…",
  onChangeQuery,
  onOpenFilters,
}: CategorySearchBarProps) {
  const [filterFocused, setFilterFocused] = useState(false);
  const { width } = useWindowDimensions();
  const colors = brandColors(dark);

  return (
    <View style={styles.row}>
      <CompactSearchBar
        accessibilityLabel={accessibilityLabel}
        value={query}
        onChangeText={onChangeQuery}
        placeholder={placeholder}
        dark={dark}
        style={styles.search}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open category filters"
        onPress={onOpenFilters}
        onHoverIn={() => setFilterFocused(true)}
        onHoverOut={() => setFilterFocused(false)}
        onFocus={() => setFilterFocused(true)}
        onBlur={() => setFilterFocused(false)}
        style={({ pressed }) => [
          styles.filter,
          width < 380 && styles.filterNarrow,
          {
            backgroundColor: filterFocused ? colors.muted : colors.card,
            borderColor: activeFilterCount || filterFocused ? colors.primary : colors.border,
          },
          pressed && styles.filterPressed,
        ]}
      >
        <SlidersHorizontal size={16} color={PINK} />
        {activeFilterCount ? (
          <View style={styles.filterCount}>
            <Text style={styles.filterCountText}>{activeFilterCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 0,
    marginBottom: 14,
  },
  search: { flex: 1, minWidth: 0, height: 50 },
  filter: {
    width: 50,
    height: 50,
    flexShrink: 0,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0,
    elevation: 0,
  },
  filterNarrow: { width: 46 },
  filterPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  filterCount: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
});
