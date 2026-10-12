import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
  const { width } = useWindowDimensions();
  const wideTiles = width >= 900;
  const sources = analytics?.view?.bySource ?? {};
  const sourceEntries = Object.entries(sources).sort((a, b) => b[1] - a[1]);
  const sourceMax = Math.max(1, ...sourceEntries.map(([, count]) => count));

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
            <View key={`${tile.key}-${index}`} style={[styles.tile, wideTiles ? styles.tileWide : styles.tileNarrow, { backgroundColor: colors.surfaceSoft }]}>
              <Text numberOfLines={1} style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
              <Text numberOfLines={2} style={[styles.tileLabel, { color: colors.muted }]}>{tile.label}</Text>
            </View>
          );
        })}
      </View>

      {sourceEntries.length > 0 ? (
        <View style={[styles.sourcesWrap, { borderColor: colors.border }]}>
          <Text style={[styles.sourcesTitle, { color: colors.text }]}>Traffic Sources</Text>
          <View style={styles.sourcesGrid}>
            {sourceEntries.map(([source, count]) => (
              <View key={source} style={styles.sourceRow}>
                <View style={styles.sourceTop}>
                  <Text numberOfLines={1} style={[styles.sourceLabel, { color: colors.text }]}>{SOURCE_LABELS[source] ?? source}</Text>
                  <Text style={[styles.sourceValue, { color: colors.text }]}>{count}</Text>
                </View>
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.bar, { width: `${Math.max(8, Math.round((count / sourceMax) * 100))}%`, backgroundColor: colors.pink }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 16, minWidth: 0, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, minWidth: 0, fontSize: typeScale.body, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, minWidth: 0 },
  tile: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, minWidth: 0 },
  tileWide: { width: "23.5%", flexGrow: 1 },
  tileNarrow: { width: "48%", flexGrow: 1 },
  tileValue: { fontSize: typeScale.body, fontWeight: "700" },
  tileLabel: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 2 },
  sourcesWrap: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  sourcesTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginBottom: 8 },
  sourcesGrid: { gap: 10 },
  sourceRow: { width: "100%", minWidth: 0, gap: 6 },
  sourceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sourceLabel: { flex: 1, minWidth: 0, fontSize: typeScale.metadata, fontWeight: "600" },
  barTrack: { width: "100%", height: 4, borderRadius: 2, overflow: "hidden" },
  bar: { height: 4, borderRadius: 2 },
  sourceValue: { fontSize: typeScale.metadata, fontWeight: "700" },
});
