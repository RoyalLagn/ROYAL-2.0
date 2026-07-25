import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { ArrowUpDown, ChevronDown, SlidersHorizontal, Star, Tag } from "lucide-react-native";

const PINK = "#E91E63";

type CategoryFilterChipsProps = {
  dark: boolean;
  active: {
    sort: boolean;
    price: boolean;
    rating: boolean;
    filters: boolean;
  };
  onPress: (section: "sort" | "price" | "rating" | "filters") => void;
};

const CHIPS = [
  { key: "sort" as const, label: "Sort", icon: ArrowUpDown, dropdown: false },
  { key: "price" as const, label: "Price", icon: Tag, dropdown: true },
  { key: "rating" as const, label: "Rating", icon: Star, dropdown: true },
  { key: "filters" as const, label: "Filters", icon: SlidersHorizontal, dropdown: false },
];

export default function CategoryFilterChips({ dark, active, onPress }: CategoryFilterChipsProps) {
  const surface = dark ? "#211E20" : "#FFFFFF";
  const text = dark ? "#F8F2F5" : "#2C2228";
  const border = dark ? "#44343A" : "#F0D5DF";

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        const selected = active[chip.key];
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${chip.label} listing options`}
            onPress={() => onPress(chip.key)}
            style={({ pressed, hovered }) => [
              styles.chip,
              {
                backgroundColor: selected ? (dark ? "#3A222C" : "#FFF0F6") : surface,
                borderColor: selected ? PINK : border,
              },
              hovered && Platform.OS === "web" && styles.hover,
              pressed && styles.pressed,
            ]}
          >
            <Icon size={15} color={selected || chip.key !== "rating" ? PINK : "#F2A91F"} strokeWidth={1.9} />
            <Text style={[styles.label, { color: selected ? PINK : text }]}>{chip.label}</Text>
            {chip.dropdown ? <ChevronDown size={12} color={selected ? PINK : text} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingRight: 2 },
  chip: { minWidth: 72, height: 42, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  label: { fontSize: 10.5, fontWeight: "700" },
  hover: { transform: [{ translateY: -1 }], borderColor: PINK },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
