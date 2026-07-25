import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Filter } from "lucide-react-native";
import CompactSearchBar from "@/components/listing/CompactSearchBar";

const PINK = "#E91E63";

type CategorySearchBarProps = {
  dark: boolean;
  query: string;
  onChangeQuery: (value: string) => void;
  onOpenFilters: () => void;
};

export default function CategorySearchBar({
  dark,
  query,
  onChangeQuery,
  onOpenFilters,
}: CategorySearchBarProps) {
  return (
    <View style={styles.row}>
      <CompactSearchBar
        accessibilityLabel="Search categories"
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search categories…"
        dark={dark}
        style={styles.search}
      />

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
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: { flex: 1 },
  filter: {
    height: 50,
    width: 50,
    borderRadius: 17,
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PINK,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  filterHover: { backgroundColor: "#D81758", transform: [{ translateY: -1 }] },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
