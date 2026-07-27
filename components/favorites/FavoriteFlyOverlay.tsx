import React, { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { Heart } from "lucide-react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PINK = "#E91E63";
const AnimatedHeart = Animated.createAnimatedComponent(Heart);

export type FavoriteFlight = {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type FavoriteFlyOverlayProps = {
  flight: FavoriteFlight | null;
  onComplete: (id: number) => void;
};

export default function FavoriteFlyOverlay({
  flight,
  onComplete,
}: FavoriteFlyOverlayProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!flight) return;
    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: 650,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(onComplete)(flight.id);
      },
    );
  }, [flight, onComplete, progress]);

  const animatedStyle = useAnimatedStyle<ViewStyle>(() => {
    if (!flight) {
      return {
        opacity: 0,
        transform: [
          { translateX: 0 },
          { translateY: 0 },
          { scale: 0 },
          { rotate: "0deg" },
        ],
      } as ViewStyle;
    }

    const x = flight.startX + (flight.endX - flight.startX) * progress.value;
    const linearY = flight.startY + (flight.endY - flight.startY) * progress.value;
    const horizontalDistance = Math.abs(flight.endX - flight.startX);
    const arcHeight = Math.min(90, Math.max(36, horizontalDistance * 0.18));
    const curve = arcHeight * 4 * progress.value * (1 - progress.value);

    return {
      opacity: interpolate(progress.value, [0, 0.76, 1], [1, 0.92, 0.12]),
      transform: [
        { translateX: x - 12 },
        { translateY: linearY - curve - 12 },
        { scale: interpolate(progress.value, [0, 0.72, 1], [1, 0.76, 0.52]) },
        { rotate: `${interpolate(progress.value, [0, 1], [-5, 9])}deg` },
      ],
    } as ViewStyle;
  }, [flight]);

  if (!flight) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.heart, animatedStyle]}
    >
      <AnimatedHeart size={24} color={PINK} fill={PINK} strokeWidth={1.7} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: "absolute",
    zIndex: 10001,
    elevation: 10001,
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
