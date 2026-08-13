import React, { type ReactNode, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { ArrowUpDown, ChevronDown, Star, Tag } from "lucide-react-native";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale } from "@/constants/typography";

const PINK = "#E91E63";

type CategoryFilterChipsProps = {
  dark: boolean;
  active: {
    sort: boolean;
    price: boolean;
    rating: boolean;
  };
  onPress: (section: "sort" | "price" | "rating") => void;
  trailing?: ReactNode;
};

const CHIPS = [
  { key: "sort" as const, label: "Sort", icon: ArrowUpDown, dropdown: false },
  { key: "price" as const, label: "Price", icon: Tag, dropdown: true },
  { key: "rating" as const, label: "Rating", icon: Star, dropdown: true },
];

export default function CategoryFilterChips({ dark, active, onPress, trailing }: CategoryFilterChipsProps) {
  const [interactiveChip, setInteractiveChip] = useState<string | null>(null);
  const colors = brandColors(dark);
  const surface = colors.card;
  const text = dark ? "#F8F2F5" : colors.foreground;
  const border = colors.border;

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
            onHoverIn={() => setInteractiveChip(chip.key)}
            onHoverOut={() => setInteractiveChip(null)}
            onFocus={() => setInteractiveChip(chip.key)}
            onBlur={() => setInteractiveChip(null)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected || interactiveChip === chip.key ? (dark ? "#3A222C" : "#FFF0F6") : surface,
                borderColor: selected || interactiveChip === chip.key ? colors.primary : border,
              },
              pressed && styles.pressed,
            ]}
          >
            <Icon size={15} color={selected || chip.key !== "rating" ? PINK : "#F2A91F"} strokeWidth={1.9} />
            <Text style={[styles.label, { color: selected ? PINK : text }]}>{chip.label}</Text>
            {chip.dropdown ? <ChevronDown size={12} color={selected ? PINK : text} /> : null}
          </Pressable>
        );
      })}
      {trailing}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 4, paddingBottom: 2 },
  chip: { minWidth: 76, height: 40, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  label: { fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
