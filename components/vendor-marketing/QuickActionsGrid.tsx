import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Download, ExternalLink, Link2, QrCode, Share2 } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";

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
}: {
  colors: typeof vendorTheme.light;
  onOpenWebsite: () => void;
  onCopyLink: () => void;
  onShareProfile: () => void;
  onDownloadQr: () => void;
  onShareQr: () => void;
}) {
  const actions: Action[] = [
    { key: "open", label: "Open Website", icon: <ExternalLink size={20} color="#FFF" />, onPress: onOpenWebsite },
    { key: "copy", label: "Copy Link", icon: <Link2 size={20} color="#FFF" />, onPress: onCopyLink },
    { key: "share", label: "Share Profile", icon: <Share2 size={20} color="#FFF" />, onPress: onShareProfile },
    { key: "qrdl", label: "Download QR", icon: <Download size={20} color="#FFF" />, onPress: onDownloadQr },
    { key: "qrshare", label: "Share QR", icon: <QrCode size={20} color="#FFF" />, onPress: onShareQr },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <Text style={[styles.title, { color: colors.text }]}>Quick Actions</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.pink }, pressed && styles.pressed]}
          >
            {action.icon}
            <Text style={styles.buttonLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  title: { fontSize: 15, fontWeight: "900", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { minWidth: "31%", flexGrow: 1, minHeight: 78, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 12 },
  buttonLabel: { color: "#FFF", fontSize: 11, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
