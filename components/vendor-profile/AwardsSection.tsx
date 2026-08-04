import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Award } from "lucide-react-native";

export default function AwardsSection({ awards, dark }: { awards: string[]; dark: boolean }) {
  if (!awards.length) return null;
  const text = dark ? "#F8F1F4" : "#261A20";
  const chipBg = dark ? "#2C2432" : "#FFF3E4";
  const chipBorder = dark ? "#4A3B52" : "#F0D8A4";
  return (
    <View style={styles.wrap}>
      {awards.map((award, index) => (
        <View key={`${award}-${index}`} style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
          <Award size={13} color="#B7791F" />
          <Text style={[styles.chipText, { color: text }]}>{award}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "600" },
});
