import React, { useCallback, useRef } from "react";
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MotionPress, MotionTiming } from "@/utils/motion";

/**
 * Shared press-feedback wrapper for cards, buttons and links across the
 * app (vendor cards, readiness-checklist cards, package/service cards,
 * notification rows, ...). Scales to ~0.98 on press-in and eases back on
 * release, matching the "immediate, subtle" feedback spec everywhere
 * instead of every screen re-implementing its own Animated.Value.
 *
 * Deliberately does NOT delay onPress -- navigation fires immediately on a
 * valid press, the scale animation runs in parallel rather than gating it.
 */
export type AnimatedPressableProps = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Custom press-in scale; defaults to the shared MotionPress.scale (0.98). */
  pressScale?: number;
  /** Guards against duplicate navigation from rapid double-taps. Set false
   *  for controls that intentionally support repeat taps (e.g. steppers). */
  preventDuplicatePress?: boolean;
  /** Milliseconds to ignore repeat presses after a guarded press fires. */
  duplicatePressWindowMs?: number;
};

export default function AnimatedPressable({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  pressScale = MotionPress.scale,
  preventDuplicatePress = true,
  duplicatePressWindowMs = 700,
  disabled,
  ...rest
}: AnimatedPressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const lastPressAt = useRef(0);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (!reducedMotion) {
        scale.value = withTiming(pressScale, MotionTiming.press);
        opacity.value = withTiming(MotionPress.opacity, MotionTiming.press);
      }
      onPressIn?.(event);
    },
    [onPressIn, opacity, pressScale, reducedMotion, scale],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (!reducedMotion) {
        scale.value = withTiming(1, MotionTiming.fast);
        opacity.value = withTiming(1, MotionTiming.fast);
      }
      onPressOut?.(event);
    },
    [onPressOut, opacity, reducedMotion, scale],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (!onPress) return;
      if (preventDuplicatePress) {
        const now = Date.now();
        if (now - lastPressAt.current < duplicatePressWindowMs) return;
        lastPressAt.current = now;
      }
      // Fire immediately -- the press-feedback animation above already
      // started on press-in and runs independently, so navigation is never
      // delayed waiting for it to finish.
      onPress(event);
    },
    [duplicatePressWindowMs, onPress, preventDuplicatePress],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[style, !disabled && animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
