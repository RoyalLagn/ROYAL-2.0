import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Download, ExternalLink, Link2, QrCode, Share2, Sparkles } from "lucide-react-native";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale } from "@/constants/typography";

type Action = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
};

export default function QuickActionsGrid({
  colors,
  onOpenWebsite,
  onCopyLink,
  onShareProfile,
  onDownloadQr,
  onShareQr,
  onMarketingCard,
}: {
  colors: typeof vendorTheme.light;
  onOpenWebsite: () => void;
  onCopyLink: () => void;
  onShareProfile: () => void;
  onDownloadQr: () => void;
  onShareQr: () => void;
  onMarketingCard: () => void;
}) {
  const actions: Action[] = [
    { key: "open", label: "Open Website", icon: ExternalLink, onPress: onOpenWebsite },
    { key: "copy", label: "Copy Link", icon: Link2, onPress: onCopyLink },
    { key: "share", label: "Share Profile", icon: Share2, onPress: onShareProfile },
    { key: "qrdl", label: "Download QR", icon: Download, onPress: onDownloadQr },
    { key: "qrshare", label: "Share QR", icon: QrCode, onPress: onShareQr },
    { key: "marketingcard", label: "Marketing Card", icon: Sparkles, onPress: onMarketingCard },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <Text style={[styles.title, { color: colors.text }]}>Quick Actions</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <ActionTile key={action.key} action={action} colors={colors} />
        ))}
      </View>
    </View>
  );
}

function ActionTile({ action, colors }: { action: Action; colors: typeof vendorTheme.light }) {
  const [hovered, setHovered] = useState(false);
  const Icon = action.icon;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      pressScale={0.97}
      hoverTranslateY={-2}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.tile,
        { backgroundColor: hovered ? colors.surface : colors.surfaceSoft, borderColor: hovered ? colors.pink : "transparent", cursor: "pointer" } as object,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.surface }]}>
        <Icon size={15} color={colors.pink} strokeWidth={2.2} />
      </View>
      <Text numberOfLines={1} style={[styles.tileLabel, { color: colors.text }]}>{action.label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 16, minWidth: 0, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  title: { fontSize: typeScale.body, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, minWidth: 0 },
  tile: { width: "48%", flexGrow: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  iconBox: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tileLabel: { flex: 1, minWidth: 0, fontSize: typeScale.metadata, fontWeight: "700" },
});
