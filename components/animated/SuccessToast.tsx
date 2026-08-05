import React, { useEffect, useImperativeHandle, useState, forwardRef, useCallback, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CircleAlert } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "@/components/ThemeProvider";
import { MotionDistance } from "@/utils/motion";

/**
 * Lightweight, non-blocking confirmation toast for "ordinary edit saved"
 * feedback -- explicitly used instead of a large blocking success modal
 * (per spec: "Do not show a large blocking success modal for ordinary
 * edits"). Mount one <SuccessToast ref={...} /> per screen and call
 * `.show("message")` / `.showError("message")` from a save handler.
 */
export type SuccessToastHandle = {
  show: (message: string) => void;
  showError: (message: string) => void;
};

const AUTO_DISMISS_MS = 2200;

const SuccessToast = forwardRef<SuccessToastHandle>((_props, ref) => {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue<number>(MotionDistance.screenEnter);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const present = useCallback((message: string, tone: "success" | "error") => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setState({ message, tone });
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    translateY.value = reducedMotion ? 0 : withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    dismissTimer.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 180 });
      translateY.value = reducedMotion ? 0 : withTiming(MotionDistance.screenEnter, { duration: 180 });
    }, AUTO_DISMISS_MS);
  }, [opacity, reducedMotion, translateY]);

  useImperativeHandle(ref, () => ({
    show: (message: string) => present(message, "success"),
    showError: (message: string) => present(message, "error"),
  }), [present]);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!state) return null;

  const isError = state.tone === "error";
  const tint = isError ? "#D33B55" : "#16A34A";

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        { bottom: insets.bottom + 18, backgroundColor: isDark ? "#181017" : "#FFFFFF", borderColor: isDark ? "#332830" : "#EFE1E7" },
        animatedStyle,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: `${tint}18` }]}>
        {isError ? <CircleAlert size={15} color={tint} /> : <Check size={15} color={tint} />}
      </View>
      <Text style={[styles.text, { color: isDark ? "#F3E9EE" : "#241820" }]} numberOfLines={2}>{state.message}</Text>
    </Animated.View>
  );
});
SuccessToast.displayName = "SuccessToast";
export default SuccessToast;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 18,
    right: 18,
    alignSelf: "center",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    zIndex: 50,
  },
  icon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 16 },
});
