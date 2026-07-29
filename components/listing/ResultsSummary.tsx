import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

const PINK = "#E91E63";

type ResultsSummaryProps = {
  count: number;
  category: string;
  sortLabel: string;
  dark: boolean;
  onSort: () => void;
};

export default function ResultsSummary({ count, category, sortLabel, dark, onSort }: ResultsSummaryProps) {
  const text = dark ? "#F8F2F5" : "#241B21";
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[styles.count, { color: text }]}>{count} {category} Found</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Change result sorting" onPress={onSort} style={styles.sort}>
        <Text numberOfLines={1} style={styles.sortText}>{sortLabel}</Text>
        <ChevronDown size={13} color={PINK} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  count: { flex: 1, minWidth: 0, fontFamily: Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" }), fontSize: 16, lineHeight: 21, fontWeight: "700" },
  sort: { maxWidth: "42%", minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3 },
  sortText: { flexShrink: 1, color: PINK, fontSize: 11, fontWeight: "700" },
});
