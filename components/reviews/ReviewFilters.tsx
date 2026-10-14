import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReviewSort, StarFilter } from "./types";
import { reviewPalette } from "./types";
import { typeScale } from "@/constants/typography";

export type ReviewFiltersProps = { sort: ReviewSort; star: StarFilter; dark?: boolean; onSortChange: (sort: ReviewSort) => void; onStarChange: (star: StarFilter) => void };
const sorts: { key: ReviewSort; label: string }[] = [{ key: "recent", label: "Most Recent" }, { key: "highest", label: "Highest Rated" }, { key: "lowest", label: "Lowest Rated" }, { key: "helpful", label: "Most Helpful" }];

export default function ReviewFilters({ sort, star, dark = false, onSortChange, onStarChange }: ReviewFiltersProps) {
  const c = reviewPalette(dark);
  const chip = (selected: boolean) => [styles.chip, { borderColor: selected ? c.pink : c.border, backgroundColor: selected ? c.soft : c.surface }];
  return <View style={styles.wrap}>
    <View style={styles.row}>
      {sorts.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityLabel={`Sort reviews by ${item.label}`} accessibilityState={{ checked: sort === item.key }} onPress={() => onSortChange(item.key)} style={chip(sort === item.key)}><Text style={[styles.text, { color: sort === item.key ? c.pink : c.muted }]}>{item.label}</Text></Pressable>)}
    </View>
    <View style={styles.row}>
      <Pressable accessibilityRole="radio" accessibilityLabel="Show all star ratings" accessibilityState={{ checked: star === null }} onPress={() => onStarChange(null)} style={chip(star === null)}><Text style={[styles.text, { color: star === null ? c.pink : c.muted }]}>All stars</Text></Pressable>
      {([5,4,3,2,1] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Show ${value}-star reviews`} accessibilityState={{ checked: star === value }} onPress={() => onStarChange(value)} style={chip(star === value)}><Text style={[styles.text, { color: star === value ? c.pink : c.muted }]}>{value} ★</Text></Pressable>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 9, width: "100%" }, row: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 24, minHeight: 48, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  text: { fontSize: typeScale.bodyCompact, fontWeight: "600" },
});
