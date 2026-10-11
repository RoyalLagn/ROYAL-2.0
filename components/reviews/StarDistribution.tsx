import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Pressable from "@/components/InteropSafePressable";
import type { StarCounts, StarFilter } from "./types";
import { reviewPalette } from "./types";
import { typeScale } from "@/constants/typography";

export type StarDistributionProps = {
  counts: StarCounts;
  total: number;
  dark?: boolean;
  onSelectStar?: (star: 1 | 2 | 3 | 4 | 5) => void;
  selectedStar?: StarFilter;
};

export default function StarDistribution({ counts, total, dark = false, onSelectStar, selectedStar }: StarDistributionProps) {
  const c = reviewPalette(dark);
  return (
    <View accessibilityLabel="Rating distribution" style={styles.wrap}>
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const percent = total ? Math.round((counts[star] / total) * 100) : 0;
        const isSelected = selectedStar === star;
        const content = (
          <View style={[styles.row, isSelected && [styles.selectedRow, { backgroundColor: c.soft, borderColor: c.pink }]]}>
            <Text style={[styles.label, { color: isSelected ? c.pink : c.muted }]}>{star} ★</Text>
            <View style={[styles.track, { backgroundColor: c.soft }]}>
              <View style={[styles.fill, { backgroundColor: c.gold, width: `${percent}%` }]} />
            </View>
            <Text style={[styles.percent, { color: isSelected ? c.pink : c.muted, fontWeight: isSelected ? "700" : "400" }]}>{percent}%</Text>
          </View>
        );

        if (onSelectStar) {
          return (
            <Pressable
              key={star}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${star} star reviews (${counts[star] || 0})`}
              onPress={() => onSelectStar(star)}
              style={({ pressed, hovered }: any) => [
                styles.pressableRow,
                hovered && styles.hoveredRow,
                pressed && { opacity: 0.75 },
              ]}
            >
              {content}
            </Pressable>
          );
        }

        return <View key={star}>{content}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 220, gap: 8 },
  pressableRow: { borderRadius: 8 },
  hoveredRow: { opacity: 0.9 },
  row: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 6, borderWidth: 1, borderColor: "transparent" },
  selectedRow: { borderRadius: 6 },
  label: { width: 28, fontSize: typeScale.bodyCompact, fontWeight: "600" },
  track: { flex: 1, height: 7, borderRadius: 9, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 9 },
  percent: { width: 34, fontSize: typeScale.metadata, textAlign: "right" },
});

