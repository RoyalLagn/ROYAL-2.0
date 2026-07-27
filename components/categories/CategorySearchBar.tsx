import React from "react";
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import CompactSearchBar from "@/components/listing/CompactSearchBar";

const PINK = "#E91E63";

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
  const { width } = useWindowDimensions();

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

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open category filters"
        onPress={onOpenFilters}
        activeOpacity={0.76}
        style={[
          styles.filter,
          width < 380 && styles.filterNarrow,
          { backgroundColor: dark ? "#0E141F" : "#FFFFFF" },
        ]}
      >
        <SlidersHorizontal size={16} color={PINK} />
        {activeFilterCount ? (
          <View style={styles.filterCount}>
            <Text style={styles.filterCountText}>{activeFilterCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  search: { flex: 1, minWidth: 0, height: 46 },
  filter: {
    width: 46,
    height: 46,
    flexShrink: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F04478",
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0,
    elevation: 0,
  },
  filterNarrow: { width: 44 },
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
  filterCountText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
});
