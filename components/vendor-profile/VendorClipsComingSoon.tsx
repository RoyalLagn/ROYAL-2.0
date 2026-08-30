import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Clapperboard } from "lucide-react-native";
import { typeLeading, typeScale } from "@/constants/typography";

export default function VendorClipsComingSoon({
  dark,
  loading = false,
}: {
  dark: boolean;
  loading?: boolean;
}) {
  return (
    <View style={[styles.card, { backgroundColor: dark ? "#151014" : "#FFF8FB", borderColor: dark ? "#30232A" : "#F5D7E3" }]}>
      {loading ? (
        <ActivityIndicator color="#E91E63" />
      ) : (
        <View style={styles.icon}><Clapperboard size={30} color="#E91E63" strokeWidth={1.8} /></View>
      )}
      <Text style={[styles.eyebrow, { color: dark ? "#FF8CB4" : "#C2185B" }]}>CLIPS</Text>
      <Text style={[styles.title, { color: dark ? "#FFFFFF" : "#211A1D" }]}>
        {loading ? "Checking Clips availability" : "This feature is coming soon"}
      </Text>
      {!loading ? (
        <Text style={[styles.body, { color: dark ? "#CBBBC3" : "#71666B" }]}>
          We’re preparing wedding inspiration for you. Please check back soon.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 190,
    marginTop: 12,
    padding: 24,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE2EC",
  },
  eyebrow: { fontSize: typeScale.metadata, lineHeight: typeLeading.caption, fontWeight: "800", letterSpacing: 1.2 },
  title: { textAlign: "center", fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle, fontWeight: "700" },
  body: { maxWidth: 300, textAlign: "center", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact },
});
