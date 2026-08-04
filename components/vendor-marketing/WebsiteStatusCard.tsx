import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Globe } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";

export default function WebsiteStatusCard({
  colors,
  url,
  generatedAt,
  totalViews,
  qrScans,
}: {
  colors: typeof vendorTheme.light;
  url: string;
  generatedAt: string | null;
  totalViews: number;
  qrScans: number;
}) {
  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <Globe size={22} color="#FFF" />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.text }]}>My Business Website</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusText, { color: colors.success }]}>Live</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.url, { color: colors.pink }]} numberOfLines={1}>{url}</Text>

      <View style={[styles.metaRow, { borderColor: colors.border }]}>
        <View style={styles.metaItem}>
          <Text style={[styles.metaValue, { color: colors.text }]}>{totalViews}</Text>
          <Text style={[styles.metaLabel, { color: colors.muted }]}>Total Views</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[styles.metaValue, { color: colors.text }]}>{qrScans}</Text>
          <Text style={[styles.metaLabel, { color: colors.muted }]}>QR Scans</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[styles.metaValue, { color: colors.text }]}>{formattedDate}</Text>
          <Text style={[styles.metaLabel, { color: colors.muted }]}>QR Generated</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 20, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 },
  headerRow: { flexDirection: "row", gap: 13, alignItems: "center" },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, fontWeight: "900" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "800" },
  url: { fontSize: 12, fontWeight: "700", marginTop: 14 },
  metaRow: { flexDirection: "row", marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  metaItem: { flex: 1, alignItems: "center" },
  metaValue: { fontSize: 15, fontWeight: "900" },
  metaLabel: { fontSize: 9, fontWeight: "700", marginTop: 3, textAlign: "center" },
});
