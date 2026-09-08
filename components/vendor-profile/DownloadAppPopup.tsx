import React, { useEffect, useState } from "react";
import { ImageBackground, Linking, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

const CARD_ART = require("@/assets/images/download-app-card.png");
const CARD_ASPECT_RATIO = 1072 / 1467;
const PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL?.trim()
  || "https://play.google.com/store/apps/details?id=com.royallagn.app";
const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL?.trim()
  || "https://apps.apple.com/in/search?term=RoyalLagn";
const DISMISSED_AT_KEY = "royallagn:download-app-popup:v2:dismissed-at";
const DISMISSAL_COOLDOWN_MS = 2 * 60 * 60 * 1000;

type ActionOverlayProps = {
  accessibilityLabel: string;
  onPress: () => void;
  style: object;
};

function ActionOverlay({ accessibilityLabel, onPress, style }: ActionOverlayProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ hovered, focused, pressed }) => [
        styles.actionOverlay,
        style,
        (hovered || focused) && styles.actionOverlayActive,
        pressed && styles.actionOverlayPressed,
      ]}
    />
  );
}

export default function DownloadAppPopup({ dark: _dark }: { dark: boolean }) {
  const [visible, setVisible] = useState(false);
  const { width, height } = useWindowDimensions();
  const viewportWidth = typeof window === "undefined" ? width : (window.visualViewport?.width ?? window.innerWidth);
  const viewportHeight = typeof window === "undefined" ? height : (window.visualViewport?.height ?? window.innerHeight);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(globalThis.localStorage?.getItem(DISMISSED_AT_KEY)) || 0;
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
    if (Date.now() - dismissedAt < DISMISSAL_COOLDOWN_MS) return;
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (Platform.OS !== "web") return null;

  const dismissForTwoHours = () => {
    try {
      globalThis.localStorage?.setItem(DISMISSED_AT_KEY, String(Date.now()));
    } catch {
      // Still close the popup when storage is unavailable.
    }
    setVisible(false);
  };

  const openStore = async (url: string) => {
    dismissForTwoHours();
    await Linking.openURL(url);
  };

  const cardWidth = Math.max(280, Math.min(560, viewportWidth - 32, (viewportHeight - 32) * CARD_ASPECT_RATIO));
  const cardHeight = cardWidth / CARD_ASPECT_RATIO;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissForTwoHours}>
      <View style={styles.backdrop}>
        <ImageBackground
          source={CARD_ART}
          resizeMode="contain"
          style={[
            styles.card,
            {
              width: cardWidth,
              height: cardHeight,
              top: Math.max(16, (viewportHeight - cardHeight) / 2),
              left: Math.max(16, (viewportWidth - cardWidth) / 2),
            },
          ]}
          imageStyle={styles.cardImage}
          accessibilityLabel="Download the RoyalLagn app"
        >
          <ActionOverlay accessibilityLabel="Close app download reminder" onPress={dismissForTwoHours} style={styles.closeButton} />
          <ActionOverlay accessibilityLabel="Download RoyalLagn on Google Play" onPress={() => void openStore(PLAY_STORE_URL)} style={styles.playStoreButton} />
          <ActionOverlay accessibilityLabel="Download RoyalLagn on the App Store" onPress={() => void openStore(APP_STORE_URL)} style={styles.appStoreButton} />
          <ActionOverlay accessibilityLabel="Continue on web" onPress={dismissForTwoHours} style={styles.continueButton} />
        </ImageBackground>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "fixed" as never,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flex: 1,
    backgroundColor: "rgba(24, 8, 15, 0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: { position: "fixed" as never, aspectRatio: CARD_ASPECT_RATIO },
  cardImage: { borderRadius: 32 },
  actionOverlay: { position: "absolute", cursor: "pointer", borderRadius: 999 },
  actionOverlayActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    outlineColor: "#A7184B",
    outlineStyle: "solid",
    outlineWidth: 3,
  },
  actionOverlayPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  closeButton: { top: "2.4%", right: "3.3%", width: "11.5%", aspectRatio: 1 },
  playStoreButton: { top: "50.2%", left: "17.3%", width: "65.8%", height: "8.8%" },
  appStoreButton: { top: "60.6%", left: "17.3%", width: "65.8%", height: "8.8%" },
  continueButton: { top: "71.1%", left: "35.2%", width: "29.6%", height: "5.4%" },
});
