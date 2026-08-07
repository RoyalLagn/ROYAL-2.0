import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { typeScale } from "@/constants/typography";

export default function LanguagesSection({ languages, dark }: { languages: string[]; dark: boolean }) {
  if (!languages.length) return null;
  const text = dark ? "#F8F1F4" : "#261A20";
  const chipBg = dark ? "#20242C" : "#F1F5FF";
  const chipBorder = dark ? "#38424F" : "#D9E4FF";
  return (
    <View style={styles.wrap}>
      {languages.map((language, index) => (
        <View key={`${language}-${index}`} style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
          <Text style={[styles.chipText, { color: text }]}>{language}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: typeScale.bodyCompact, fontWeight: "600" },
});
