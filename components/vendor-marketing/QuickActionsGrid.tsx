import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Download, ExternalLink, Link2, QrCode, Share2, Sparkles } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale } from "@/constants/typography";

type Action = {
  key: string;
  label: string;
  icon: React.ReactNode;
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
    { key: "open", label: "Open Website", icon: <ExternalLink size={16} color="#FFF" />, onPress: onOpenWebsite },
    { key: "copy", label: "Copy Link", icon: <Link2 size={16} color="#FFF" />, onPress: onCopyLink },
    { key: "share", label: "Share Profile", icon: <Share2 size={16} color="#FFF" />, onPress: onShareProfile },
    { key: "qrdl", label: "Download QR", icon: <Download size={16} color="#FFF" />, onPress: onDownloadQr },
    { key: "qrshare", label: "Share QR", icon: <QrCode size={16} color="#FFF" />, onPress: onShareQr },
    { key: "marketingcard", label: "Marketing Card", icon: <Sparkles size={16} color="#FFF" />, onPress: onMarketingCard },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <Text style={[styles.title, { color: colors.text }]}>Quick Actions</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <View key={action.key} style={[styles.buttonTile, { backgroundColor: colors.pink }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              onPress={action.onPress}
              style={({ pressed }) => [styles.buttonHitArea, pressed && styles.pressed]}
            >
              {action.icon}
              <Text numberOfLines={2} style={styles.buttonLabel}>{action.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12, minWidth: 0, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  title: { fontSize: typeScale.body, fontWeight: "700", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, minWidth: 0 },
  buttonTile: { flexBasis: "31%", flexGrow: 1, height: 52, overflow: "hidden", borderRadius: 12, minWidth: 0 },
  buttonHitArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  buttonLabel: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700", textAlign: "center" },
});
