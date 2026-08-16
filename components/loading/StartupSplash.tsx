import React, { useCallback, useEffect, useRef } from "react";
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

const PORTRAIT_SPLASH = require("../../assets/images/splash_mobile.png");
const LANDSCAPE_SPLASH = require("../../assets/images/splash_desktop.png");
const SPLASH_VISIBLE_MS = 1_600;

type StartupSplashProps = {
  onReady: () => void;
  onFinish: () => void;
};

/**
 * Branded startup handoff shown after the native launch surface is ready.
 * The real app stays mounted underneath so startup work can finish during
 * the two-second brand moment rather than beginning after it.
 */
export function StartupSplash({ onReady, onFinish }: StartupSplashProps) {
  const { width, height } = useWindowDimensions();
  const started = useRef(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = width >= height ? LANDSCAPE_SPLASH : PORTRAIT_SPLASH;

  const clearFinishTimer = useCallback(() => {
    if (!finishTimer.current) return;
    clearTimeout(finishTimer.current);
    finishTimer.current = null;
  }, []);

  useEffect(() => clearFinishTimer, [clearFinishTimer]);

  const handleImageReady = useCallback(() => {
    if (started.current) return;
    started.current = true;
    onReady();
    finishTimer.current = setTimeout(() => {
      finishTimer.current = null;
      onFinish();
    }, SPLASH_VISIBLE_MS);
  }, [onFinish, onReady]);

  const handleImageError = useCallback(() => {
    clearFinishTimer();
    onReady();
    onFinish();
  }, [clearFinishTimer, onFinish, onReady]);

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={() => undefined}
      presentationStyle="fullScreen"
      statusBarTranslucent
      transparent={false}
      visible
    >
      <View
        accessibilityLabel="RoyalLagn startup screen"
        accessibilityRole="image"
        accessibilityViewIsModal
        style={styles.root}
      >
        <Image
          accessibilityIgnoresInvertColors
          onError={handleImageError}
          onLoad={handleImageReady}
          resizeMode="cover"
          source={source}
          style={{ width, height }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#F8C8C3",
    zIndex: 10_000,
    elevation: Platform.OS === "android" ? 25 : 0,
  },
});
