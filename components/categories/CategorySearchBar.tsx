import React from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Filter, Search, X } from "lucide-react-native";

const PINK = "#E91E63";

type CategorySearchBarProps = {
  dark: boolean;
  query: string;
  activeFilterCount: number;
  onChangeQuery: (value: string) => void;
  onOpenFilters: () => void;
};

export default function CategorySearchBar({
  dark,
  query,
  activeFilterCount,
  onChangeQuery,
  onOpenFilters,
}: CategorySearchBarProps) {
  const text = dark ? "#F8F2F5" : "#241D27";
  const muted = dark ? "#AAA0A5" : "#766B78";
  const surface = dark ? "#211E20" : "#FFFCFD";
  const border = dark ? "#44333B" : "#F2CCD9";

  return (
    <View style={styles.row}>
      <View style={[styles.search, { backgroundColor: surface, borderColor: border }]}>
        <Search size={20} color={muted} strokeWidth={1.8} />
        <TextInput
          accessibilityLabel="Search categories"
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search categories..."
          placeholderTextColor={muted}
          returnKeyType="search"
          style={[styles.input, { color: text }]}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear category search"
            onPress={() => onChangeQuery("")}
            hitSlop={8}
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            <X size={16} color={muted} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open category filters"
        onPress={onOpenFilters}
        style={({ pressed, hovered }) => [
          styles.filter,
          hovered && Platform.OS === "web" && styles.filterHover,
          pressed && styles.pressed,
        ]}
      >
        <Filter size={18} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.filterText}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: {
    flex: 1,
    minWidth: 0,
    height: 56,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#88445F",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 0, fontSize: 14, outlineStyle: "none" } as never,
  clear: { width: 30, height: 38, alignItems: "center", justifyContent: "center" },
  filter: {
    height: 56,
    minWidth: 96,
    borderRadius: 18,
    paddingHorizontal: 15,
    backgroundColor: PINK,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: PINK,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  filterHover: { backgroundColor: "#D81758", transform: [{ translateY: -1 }] },
  filterText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
