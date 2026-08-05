import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "@/components/ThemeProvider";
import { MotionDistance, MotionDuration } from "@/utils/motion";

/**
 * Shared empty/error-state block. Distinguishes "nothing here yet" from
 * "something went wrong" via `tone`, and always gives the user a way
 * forward (retry or an explicit action) instead of a dead end -- per the
 * "never leave the user on an endless or unexplained state" requirement.
 */
type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  message?: string;
  tone?: "empty" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon: Icon, title, message, tone = "empty", actionLabel, onAction }: EmptyStateProps) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue<number>(MotionDistance.cardEnter);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: MotionDuration.base, easing: Easing.out(Easing.cubic) });
    translateY.value = reducedMotion ? 0 : withTiming(0, { duration: MotionDuration.base, easing: Easing.out(Easing.cubic) });
  }, [opacity, reducedMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const tint = tone === "error" ? "#D33B55" : "#E91E63";
  const surface = isDark ? "#171015" : "#FFFFFF";
  const border = isDark ? "#2E232A" : "#F0DDE5";
  const text = isDark ? "#F5EBEF" : "#241820";
  const muted = isDark ? "#B3A4AC" : "#7A6670";

  return (
    <Animated.View style={[styles.wrap, { backgroundColor: surface, borderColor: border }, animatedStyle]}>
      <View style={[styles.icon, { backgroundColor: `${tint}16` }]}>
        <Icon size={26} color={tint} />
      </View>
      <Text style={[styles.title, { color: text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: muted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={[styles.action, { backgroundColor: tint }]}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 22, padding: 26, alignItems: "center" },
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 15, fontWeight: "800", textAlign: "center" },
  message: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6, maxWidth: 320 },
  action: { minHeight: 42, borderRadius: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 16 },
  actionText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
});
