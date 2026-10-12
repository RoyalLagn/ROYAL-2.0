import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Globe } from "lucide-react-native";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale } from "@/constants/typography";

export default function WebsiteStatusCard({
  colors,
  url,
  generatedAt,
  totalViews,
  qrScans,
  onOpen,
}: {
  colors: typeof vendorTheme.light;
  url: string;
  generatedAt: string | null;
  totalViews: number;
  qrScans: number;
  onOpen: () => void;
}) {
  const [linkHovered, setLinkHovered] = useState(false);
  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <Globe size={18} color="#FFF" />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.text }]}>My Business Website</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusText, { color: colors.success }]}>Live</Text>
          </View>
        </View>
      </View>

      <AnimatedPressable
        accessibilityRole="link"
        accessibilityLabel="Open business website"
        onPress={onOpen}
        pressScale={0.98}
        onHoverIn={() => setLinkHovered(true)}
        onHoverOut={() => setLinkHovered(false)}
        style={[styles.urlHit, { backgroundColor: linkHovered ? "#C2185B" : colors.pink }]}
      >
        <Text
          style={styles.url}
          numberOfLines={2}
        >
          {url}
        </Text>
      </AnimatedPressable>

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
  card: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 16, minWidth: 0, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "center", minWidth: 0 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  title: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  urlHit: { alignSelf: "stretch", marginTop: 10, maxWidth: "100%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, cursor: "pointer" } as object,
  url: { color: "#FFFFFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  metaRow: { flexDirection: "row", marginTop: 12, paddingTop: 12, borderTopWidth: 1, minWidth: 0 },
  metaItem: { flex: 1, alignItems: "center" },
  metaValue: { fontSize: typeScale.body, fontWeight: "700" },
  metaLabel: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 3, textAlign: "center" },
});
