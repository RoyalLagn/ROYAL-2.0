import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Download, Maximize2, Share2, X } from "lucide-react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeScale } from "@/constants/typography";

export default function QrCodeSection({
  colors,
  qrUrl,
  qrRef,
  onDownload,
  onShare,
}: {
  colors: typeof vendorTheme.light;
  qrUrl: string;
  qrRef: React.RefObject<any>;
  onDownload: () => void;
  onShare: () => void;
}) {
  const [fullScreen, setFullScreen] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <Text style={[styles.title, { color: colors.text }]}>QR Code</Text>
      <View style={styles.qrWrap}>
        <View ref={qrRef} collapsable={false} style={[styles.qrBox, { borderColor: colors.border }]}>
          <QRCode value={qrUrl} size={180} backgroundColor="#FFFFFF" />
        </View>
      </View>
      <View style={styles.actionsRow}>
        <QrButton label="Download" icon={<Download size={15} color={colors.pink} />} colors={colors} onPress={onDownload} />
        <QrButton label="Share" icon={<Share2 size={15} color={colors.pink} />} colors={colors} onPress={onShare} />
        <QrButton label="Full Screen" icon={<Maximize2 size={15} color={colors.pink} />} colors={colors} onPress={() => setFullScreen(true)} />
      </View>

      <Modal visible={fullScreen} animationType="fade" transparent onRequestClose={() => setFullScreen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalClose} onPress={() => setFullScreen(false)}>
            <X size={26} color="#FFF" />
          </Pressable>
          <View style={styles.modalQrBox}>
            <QRCode value={qrUrl} size={280} backgroundColor="#FFFFFF" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function QrButton({ label, icon, colors, onPress }: { label: string; icon: React.ReactNode; colors: typeof vendorTheme.light; onPress: () => void }) {
  return (
    <Pressable
      android_ripple={{ color: "rgba(233,30,99,0.08)" }}
      onPress={onPress}
      style={[styles.qrButton, { backgroundColor: colors.surfaceSoft }]}
    >
      {icon}
      <Text style={[styles.qrButtonLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  title: { fontSize: typeScale.body, fontWeight: "700", marginBottom: 14 },
  qrWrap: { alignItems: "center", marginBottom: 16 },
  qrBox: { padding: 14, borderRadius: 18, borderWidth: 1, backgroundColor: "#FFFFFF" },
  actionsRow: { flexDirection: "row", gap: 8 },
  qrButton: { flex: 1, height: 38, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingHorizontal: 6 },
  qrButtonLabel: { fontSize: typeScale.caption, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  modalClose: { position: "absolute", top: 50, right: 24, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  modalQrBox: { padding: 24, borderRadius: 24, backgroundColor: "#FFFFFF" },
});
