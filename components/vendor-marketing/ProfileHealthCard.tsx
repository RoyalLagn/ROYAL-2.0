import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, HeartPulse } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import type { CompletionItem } from "@/hooks/useVendorWorkspace";
import { typeScale } from "@/constants/typography";

export default function ProfileHealthCard({
  colors,
  percent,
  items,
}: {
  colors: typeof vendorTheme.light;
  percent: number;
  items: CompletionItem[];
}) {
  const router = useRouter();
  const suggestions = items.filter((item) => item.state !== "complete").slice(0, 3);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <HeartPulse size={18} color="#FFF" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Profile Health</Text>
        <View style={[styles.percentBadge, { backgroundColor: colors.surfaceSoft }]}>
          <Text style={[styles.percent, { color: colors.pink }]}>{percent}%</Text>
        </View>
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.list}>
          {suggestions.map((item) => (
            <Pressable
              key={item.id}
              android_ripple={{ color: "rgba(233,30,99,0.08)" }}
              onPress={() => router.push(item.route as any)}
              style={[styles.row, { backgroundColor: colors.surfaceSoft }]}
            >
              <Text style={[styles.rowText, { color: colors.text }]}>{item.label}</Text>
              <ChevronRight size={15} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.doneText, { color: colors.success }]}>Your profile is fully complete.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: typeScale.body, fontWeight: "700" },
  percentBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  percent: { fontSize: typeScale.body, fontWeight: "700" },
  list: { gap: 8, marginTop: 14 },
  row: { minHeight: 42, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11 },
  rowText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  doneText: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginTop: 14 },
});
