import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RefreshCw, X } from "lucide-react-native";
import type { ClipQueueItem } from "../types";

export const UploadQueuePanel = React.memo(function UploadQueuePanel({
  items, colors, onRetry, onCancel, onRemove,
}: {
  items: ClipQueueItem[];
  colors: any;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.heading, { color: colors.text }]}>Upload queue</Text>
    {items.map((item) => {
      const percent = Math.round(item.progress.progress * 100);
      const active = !["completed", "failed", "cancelled"].includes(item.status);
      return <View key={item.id} style={[styles.item, { borderTopColor: colors.border }]}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{item.draft.title}</Text>
            <Text style={[styles.status, { color: item.status === "failed" ? "#DC2626" : colors.muted }]}>
              {item.status === "failed" ? item.error : `${item.status} · ${percent}%`}
            </Text>
          </View>
          {item.status === "failed" && <Pressable onPress={() => onRetry(item.id)} style={styles.action}><RefreshCw size={16} color={colors.pink} /></Pressable>}
          {active && <Pressable onPress={() => onCancel(item.id)} style={styles.action}><X size={17} color={colors.warning} /></Pressable>}
          {["completed", "cancelled"].includes(item.status) && <Pressable onPress={() => onRemove(item.id)} style={styles.action}><X size={17} color={colors.muted} /></Pressable>}
        </View>
        <View style={[styles.track, { backgroundColor: colors.surfaceSoft }]}>
          <View style={[styles.fill, { backgroundColor: item.status === "failed" ? "#DC2626" : colors.pink, width: `${percent}%` }]} />
        </View>
      </View>;
    })}
  </View>;
});

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 4 },
  heading: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 }, title: { fontSize: 12, fontWeight: "700" },
  status: { fontSize: 10, marginTop: 3 }, action: { padding: 7 },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 9 },
  fill: { height: "100%", borderRadius: 3 },
});
