import React from "react";
import { type ViewProps } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MotionDistance, MotionTiming } from "@/utils/motion";

export default function HomeSectionReveal({
  children,
  scrollY,
  viewportHeight,
  style,
  ...props
}: ViewProps & {
  scrollY: SharedValue<number>;
  viewportHeight: number;
}) {
  const reducedMotion = useReducedMotion();
  const sectionTop = useSharedValue(Number.MAX_SAFE_INTEGER);
  const progress = useSharedValue(0);

  useAnimatedReaction(
    () => scrollY.value + viewportHeight - MotionDistance.screenEnter >= sectionTop.value,
    (visible) => {
      if (visible && progress.value === 0) {
        progress.value = withTiming(1, reducedMotion ? MotionTiming.fast : MotionTiming.base);
      }
    },
    [reducedMotion, viewportHeight],
  );

  const revealStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{
      translateY: reducedMotion ? 0 : (1 - progress.value) * MotionDistance.cardEnter,
    }],
  }));

  return (
    <Animated.View
      {...props}
      onLayout={(event) => {
        sectionTop.value = event.nativeEvent.layout.y;
      }}
      style={[style, revealStyle]}
    >
      {children}
    </Animated.View>
  );
}
