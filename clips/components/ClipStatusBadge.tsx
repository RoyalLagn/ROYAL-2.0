import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ClipStatus } from "../types";

const colors: Record<ClipStatus, string> = {
  draft: "#64748B", pending: "#B76A00", approved: "#168A5B",
  hidden: "#7C3AED", rejected: "#DC2626", deleted: "#6B7280",
};

export const ClipStatusBadge = React.memo(function ClipStatusBadge({ status }: { status: ClipStatus }) {
  return <View style={[styles.badge, { backgroundColor: `${colors[status]}18` }]}>
    <Text style={[styles.text, { color: colors[status] }]}>{status.toUpperCase()}</Text>
  </View>;
});

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  text: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
