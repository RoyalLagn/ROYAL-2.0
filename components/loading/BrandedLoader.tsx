import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "@/components/ThemeProvider";
import { typeScale } from "@/constants/typography";

// The bride-and-groom emblem is a single flat illustration (ring + couple
// baked into one PNG, see assets/images/loader.png) -- there is no separate
// ring layer to spin independently. Per the branded-loader spec we animate
// it as one piece: fade in, then a slow, gentle breathing scale pulse. The
// illustration itself is never rotated.
const LOADER_SOURCE = require("../../assets/images/loader.png");

type BrandedLoaderProps = {
  /** Optional message shown under the mark, e.g. "Signing you in...". */
  message?: string;
  /** Diameter of the emblem in px. */
  size?: number;
  /** Fill the parent screen with the app background instead of just centering inline. */
  fullscreen?: boolean;
};

export default function BrandedLoader({
  message,
  size = 132,
  fullscreen = true,
}: BrandedLoaderProps) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);
  const pulse = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    if (!reducedMotion) {
      // Gentle breathing pulse -- gives the illustration a sense of life
      // without ever moving, rotating or bouncing it.
      pulse.value = withDelay(
        380,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        ),
      );
    }
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      cancelAnimation(pulse);
    };
  }, [opacity, pulse, reducedMotion, scale]);

  const emblemStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value * (1 + pulse.value * 0.035) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.25,
  }));

  const background = isDark ? "#0B0710" : "#FFFFFF";
  const textColor = isDark ? "#F3E4EC" : "#5B3446";

  const content = (
    <>
      <View style={[styles.emblemWrap, { width: size, height: size }]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { width: size * 1.35, height: size * 1.35, borderRadius: (size * 1.35) / 2 }, glowStyle]}
        />
        <Animated.View style={[{ width: size, height: size }, emblemStyle]}>
          <Image source={LOADER_SOURCE} style={styles.image} resizeMode="contain" />
        </Animated.View>
      </View>
      {message ? <Text style={[styles.message, { color: textColor }]}>{message}</Text> : null}
    </>
  );

  if (!fullscreen) {
    return <View style={styles.inline}>{content}</View>;
  }

  return (
    <View style={[styles.fullscreen, { backgroundColor: background }]} accessibilityRole="progressbar" accessibilityLabel={message ?? "Loading RoyalLagn"}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inline: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  emblemWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: "#E91E63",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  message: {
    marginTop: 18,
    fontSize: typeScale.bodyCompact,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
