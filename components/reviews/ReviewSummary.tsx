import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import StarDistribution from "./StarDistribution";
import type { StarCounts } from "./types";
import { reviewPalette } from "./types";

export type ReviewSummaryProps = {
  average: number; total: number; counts: StarCounts; dark?: boolean;
  onWriteReview?: () => void; canWriteReview?: boolean;
};

export default function ReviewSummary({ average, total, counts, dark = false, onWriteReview, canWriteReview = true }: ReviewSummaryProps) {
  const c = reviewPalette(dark);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.score}>
        <Text style={[styles.average, { color: c.text }]}>{average.toFixed(1)}</Text>
        <Text accessibilityLabel={`${average.toFixed(1)} out of 5 stars`} style={[styles.stars, { color: c.gold }]}>★★★★★</Text>
        <Text style={[styles.count, { color: c.muted }]}>{total.toLocaleString()} {total === 1 ? "review" : "reviews"}</Text>
        {onWriteReview ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Write a Review" disabled={!canWriteReview} onPress={onWriteReview} style={({ pressed, hovered }) => [
            styles.button, { backgroundColor: canWriteReview ? c.pink : c.soft, opacity: canWriteReview ? 1 : 0.55 },
            pressed && styles.pressed, hovered && Platform.OS === "web" && styles.hovered,
          ]}>
            <Text style={styles.buttonText}>Write a Review</Text>
          </Pressable>
        ) : null}
      </View>
      <StarDistribution counts={counts} total={total} dark={dark} />
    </View>
  );
}
const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 18, flexDirection: "row", flexWrap: "wrap", gap: 22, shadowColor: "#9E5870", shadowOpacity: .07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  score: { width: 152, alignItems: "flex-start" },
  average: { fontFamily: serif, fontSize: 42, lineHeight: 48, fontWeight: "600" },
  stars: { fontSize: 15, letterSpacing: 2 },
  count: { fontSize: 12, marginTop: 5, marginBottom: 14 },
  button: { minHeight: 42, borderRadius: 22, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  pressed: { opacity: .86, transform: [{ scale: .98 }] },
  hovered: { transform: [{ translateY: -1 }] },
});
