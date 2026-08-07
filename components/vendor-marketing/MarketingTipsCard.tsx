import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Lightbulb } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale } from "@/constants/typography";

const TIPS = [
  "Add this website to your Instagram Bio",
  "Add this website to Google Business",
  "Print the QR on your visiting card",
  "Add the QR to wedding albums",
  "Share your website after every enquiry",
  "Add the QR on your shop banner",
];

export default function MarketingTipsCard({ colors }: { colors: typeof vendorTheme.light }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <Lightbulb size={18} color="#FFF" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Marketing Tips</Text>
      </View>
      <View style={styles.list}>
        {TIPS.map((tip) => (
          <View key={tip} style={styles.row}>
            <CheckCircle2 size={15} color={colors.success} />
            <Text style={[styles.tipText, { color: colors.text }]}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { fontSize: typeScale.body, fontWeight: "700" },
  list: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  tipText: { flex: 1, fontSize: typeScale.bodyCompact, fontWeight: "600" },
});
