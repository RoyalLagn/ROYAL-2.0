import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { VendorBusinessHourEntry } from "@/services/publicVendorListings";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function BusinessHoursSection({
  hours,
  dark,
}: {
  hours: VendorBusinessHourEntry[] | null;
  dark: boolean;
}) {
  if (!hours?.length) return null;
  const text = dark ? "#F8F1F4" : "#261A20";
  const muted = dark ? "#B79AA5" : "#7A6670";
  const border = dark ? "#3D3036" : "#F0DDE5";
  const sorted = [...hours].sort((a, b) => a.day - b.day);
  return (
    <View>
      {sorted.map((entry) => (
        <View key={entry.day} style={[styles.row, { borderColor: border }]}>
          <Text style={[styles.day, { color: text }]}>{DAY_LABELS[entry.day] ?? `Day ${entry.day}`}</Text>
          <Text style={[styles.time, { color: entry.closed ? muted : text }]}>
            {entry.closed ? "Closed" : `${entry.opens} – ${entry.closes}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  day: { fontSize: 13, fontWeight: "600" },
  time: { fontSize: 13 },
});
