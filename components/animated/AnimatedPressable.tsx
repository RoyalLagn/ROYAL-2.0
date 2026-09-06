import React, { useCallback, useRef } from "react";
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from "react-native";
import { Platform, Pressable } from "react-native";
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
 * Layout styles are applied on the Pressable itself (not a nested View) so
 * percentage / measured widths participate correctly in flexWrap grids.
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
  /** Optional pointer-only lift for cards. Kept neutral by default. */
  hoverTranslateY?: number;
  hoverScale?: number;
  restingShadowOpacity?: number;
  hoverShadowOpacity?: number;
};

const AnimatedRNPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedPressable({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  pressScale = MotionPress.scale,
  preventDuplicatePress = true,
  duplicatePressWindowMs = 700,
  hoverTranslateY = 0,
  hoverScale = 1,
  restingShadowOpacity,
  hoverShadowOpacity,
  disabled,
  android_ripple,
  accessibilityState,
  hitSlop,
  onHoverIn,
  onHoverOut,
  ...rest
}: AnimatedPressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const hoverProgress = useSharedValue(0);
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

  const handleHoverIn = useCallback<NonNullable<PressableProps["onHoverIn"]>>(
    (event) => {
      if (!reducedMotion) hoverProgress.value = withTiming(1, MotionTiming.fast);
      onHoverIn?.(event);
    },
    [hoverProgress, onHoverIn, reducedMotion],
  );

  const handleHoverOut = useCallback<NonNullable<PressableProps["onHoverOut"]>>(
    (event) => {
      if (!reducedMotion) hoverProgress.value = withTiming(0, MotionTiming.fast);
      onHoverOut?.(event);
    },
    [hoverProgress, onHoverOut, reducedMotion],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const style: ViewStyle = {
      transform: [
        { translateY: hoverTranslateY * hoverProgress.value },
        { scale: scale.value * (1 + (hoverScale - 1) * hoverProgress.value) },
      ],
      opacity: opacity.value,
    };
    if (restingShadowOpacity != null && hoverShadowOpacity != null) {
      style.shadowOpacity =
        restingShadowOpacity +
        (hoverShadowOpacity - restingShadowOpacity) * hoverProgress.value;
    }
    return style;
  });

  return (
    <AnimatedRNPressable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop ?? 4}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      android_ripple={android_ripple ?? (Platform.OS === "android" ? { color: "rgba(127,127,127,0.14)", borderless: false } : undefined)}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={[style, !disabled ? animatedStyle : null]}
    >
      {children}
    </AnimatedRNPressable>
  );
}
