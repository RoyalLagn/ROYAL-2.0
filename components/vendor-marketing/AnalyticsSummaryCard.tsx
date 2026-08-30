import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BarChart3 } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import type { VendorProfileAnalytics } from "@/services/vendorPublicProfile";
import { typeScale } from "@/constants/typography";

const TILES: { key: keyof VendorProfileAnalytics; label: string; field: "count" | "uniqueVisitors" }[] = [
  { key: "view", label: "Profile Views", field: "count" },
  { key: "view", label: "Unique Visitors", field: "uniqueVisitors" },
  { key: "qr_scan", label: "QR Scans", field: "count" },
  { key: "copy_link", label: "Copy Link", field: "count" },
  { key: "link_share", label: "Shares", field: "count" },
  { key: "whatsapp_click", label: "WhatsApp Enquiries", field: "count" },
  { key: "call_click", label: "Call Enquiries", field: "count" },
  { key: "enquiry", label: "Enquiries", field: "count" },
];

const SOURCE_LABELS: Record<string, string> = {
  qr: "QR Code",
  dashboard: "Dashboard Share",
  direct: "Direct",
  unknown: "Other",
};

export default function AnalyticsSummaryCard({
  colors,
  analytics,
  profileViews,
  totalEnquiries,
  whatsappEnquiries,
  callEnquiries,
}: {
  colors: typeof vendorTheme.light;
  analytics: VendorProfileAnalytics | null;
  profileViews: number;
  totalEnquiries: number;
  whatsappEnquiries: number;
  callEnquiries: number;
}) {
  const sources = analytics?.view?.bySource ?? {};
  const sourceEntries = Object.entries(sources).sort((a, b) => b[1] - a[1]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <BarChart3 size={19} color="#FFF" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Business Website Analytics</Text>
      </View>

      <View style={styles.grid}>
        {TILES.map((tile, index) => {
          const stat = analytics?.[tile.key];
          const value = tile.key === "enquiry"
            ? totalEnquiries
            : tile.key === "whatsapp_click"
              ? whatsappEnquiries
              : tile.key === "call_click"
                ? callEnquiries
                : tile.key === "view" && tile.field === "count"
                  ? profileViews
                  : tile.key === "qr_scan"
                    ? analytics?.view?.bySource?.qr ?? 0
                    : stat
                      ? stat[tile.field]
                      : 0;
          return (
            <View key={`${tile.key}-${index}`} style={[styles.tile, { backgroundColor: colors.surfaceSoft }]}>
              <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
              <Text style={[styles.tileLabel, { color: colors.muted }]}>{tile.label}</Text>
            </View>
          );
        })}
      </View>

      {sourceEntries.length > 0 ? (
        <View style={[styles.sourcesWrap, { borderColor: colors.border }]}>
          <Text style={[styles.sourcesTitle, { color: colors.text }]}>Traffic Sources</Text>
          {sourceEntries.map(([source, count]) => (
            <View key={source} style={styles.sourceRow}>
              <Text style={[styles.sourceLabel, { color: colors.muted }]}>{SOURCE_LABELS[source] ?? source}</Text>
              <Text style={[styles.sourceValue, { color: colors.text }]}>{count}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { fontSize: typeScale.body, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { minWidth: "22%", flexGrow: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  tileValue: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  tileLabel: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 4, textAlign: "center" },
  sourcesWrap: { marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  sourcesTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginBottom: 8 },
  sourceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  sourceLabel: { fontSize: typeScale.metadata, fontWeight: "600" },
  sourceValue: { fontSize: typeScale.metadata, fontWeight: "700" },
});
