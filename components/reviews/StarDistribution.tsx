import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StarCounts } from "./types";
import { reviewPalette } from "./types";
import { typeScale } from "@/constants/typography";

export type StarDistributionProps = { counts: StarCounts; total: number; dark?: boolean };

export default function StarDistribution({ counts, total, dark = false }: StarDistributionProps) {
  const c = reviewPalette(dark);
  return (
    <View accessibilityLabel="Rating distribution" style={styles.wrap}>
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const percent = total ? Math.round((counts[star] / total) * 100) : 0;
        return (
          <View key={star} style={styles.row}>
            <Text style={[styles.label, { color: c.muted }]}>{star} ★</Text>
            <View style={[styles.track, { backgroundColor: c.soft }]}>
              <View style={[styles.fill, { backgroundColor: c.gold, width: `${percent}%` }]} />
            </View>
            <Text style={[styles.percent, { color: c.muted }]}>{percent}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 220, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  label: { width: 28, fontSize: typeScale.bodyCompact, fontWeight: "600" },
  track: { flex: 1, height: 7, borderRadius: 9, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 9 },
  percent: { width: 34, fontSize: typeScale.metadata, textAlign: "right" },
});
