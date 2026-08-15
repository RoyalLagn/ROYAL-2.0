import React, { useEffect, useState } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Smartphone, X } from "lucide-react-native";
import { typeScale, typeLeading } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;
const PLAY_STORE_URL =
  process.env.EXPO_PUBLIC_PLAY_STORE_URL?.trim() ||
  "https://play.google.com/store/apps/details?id=com.royallagn.app";
const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL?.trim() || "https://apps.apple.com";

export default function DownloadAppPopup({ dark }: { dark: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (Platform.OS !== "web") return null;

  const cardColor = dark ? "#221A1E" : "#FFFFFF";
  const textColor = dark ? "#F8F1F4" : "#261A20";
  const mutedColor = dark ? "#B79AA5" : "#7A6670";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue on web"
            style={styles.closeButton}
            onPress={() => setVisible(false)}
          >
            <X size={18} color={mutedColor} />
          </Pressable>
          <View style={styles.icon}>
            <Smartphone size={26} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: textColor }]}>Download RoyalLagn App</Text>
          <Text style={[styles.message, { color: mutedColor }]}>
            Get a faster and better experience by downloading the RoyalLagn App.
          </Text>
          <Pressable
            style={[styles.storeButton, { backgroundColor: PINK }]}
            onPress={() => void Linking.openURL(PLAY_STORE_URL)}
          >
            <Text style={styles.storeButtonText}>Download on Google Play</Text>
          </Pressable>
          <Pressable
            style={[styles.storeButton, { backgroundColor: PINK }]}
            onPress={() => void Linking.openURL(APP_STORE_URL)}
          >
            <Text style={styles.storeButtonText}>Download on App Store</Text>
          </Pressable>
          <Pressable style={styles.continueButton} onPress={() => setVisible(false)}>
            <Text style={[styles.continueText, { color: mutedColor }]}>Continue on Web</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 360, borderRadius: 24, padding: 24, alignItems: "center" },
  closeButton: { position: "absolute", top: 14, right: 14, padding: 6 },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: PINK, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: typeScale.editorialCardTitle, fontWeight: "700", textAlign: "center" },
  message: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, textAlign: "center", marginTop: 8, marginBottom: 18 },
  storeButton: { width: "100%", minHeight: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  storeButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: typeScale.body },
  continueButton: { marginTop: 4, minHeight: 40, alignItems: "center", justifyContent: "center" },
  continueText: { fontSize: typeScale.body, fontWeight: "600", textDecorationLine: "underline" },
});
