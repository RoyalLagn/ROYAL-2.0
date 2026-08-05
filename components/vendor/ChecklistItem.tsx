import React, { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { CompletionItem } from "@/hooks/useVendorWorkspace";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import { MotionDuration } from "@/utils/motion";

type Colors = typeof vendorTheme.light;

type ChecklistMeta = { label: string; icon: React.ComponentType<{ size?: number; color?: string }> };

type ChecklistItemProps = {
  item: CompletionItem;
  meta: ChecklistMeta;
  colors: Colors;
  desktop: boolean;
  /** True only for the section that was just completed/updated -- shows a
   *  brief highlight pulse. The parent clears this after ~1.6s so the card
   *  never stays visually "special" and never re-highlights on every
   *  revisit of the screen. */
  highlighted: boolean;
  onPress: () => void;
};

/**
 * A single readiness-checklist row. Status icon and label crossfade only
 * when `item.state` actually changes (not on every re-render), and the row
 * gets a brief tinted pulse when `highlighted` is true -- per the "only
 * animate the tapped card, the changed status, the newly completed
 * section" rule, not the whole list on every screen focus.
 */
export default function ChecklistItem({ item, meta, colors, desktop, highlighted, onPress }: ChecklistItemProps) {
  const reducedMotion = useReducedMotion();
  const tint = item.state === "complete" ? colors.success : item.state === "attention" ? colors.warning : colors.pink;
  const stateOpacity = useSharedValue(1);
  const highlightGlow = useSharedValue(0);
  const Icon = meta.icon;

  // Crossfade the icon/status text when the underlying state changes
  // (e.g. a save on the section screen made this row "Complete").
  useEffect(() => {
    if (reducedMotion) return;
    stateOpacity.value = 0.15;
    stateOpacity.value = withTiming(1, { duration: MotionDuration.fast, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.state]);

  useEffect(() => {
    if (!highlighted) return;
    highlightGlow.value = reducedMotion
      ? withSequence(withTiming(1, { duration: 1 }), withDelay(900, withTiming(0, { duration: 260 })))
      : withSequence(
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withDelay(700, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  const stateStyle = useAnimatedStyle(() => ({ opacity: stateOpacity.value }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: highlightGlow.value * 0.85,
    borderColor: tint,
  }));

  const rowStyle: ViewStyle[] = [
    styles.completionItem,
    desktop ? styles.completionItemDesktop : undefined,
    { backgroundColor: colors.background, borderColor: colors.border },
  ].filter(Boolean) as ViewStyle[];

  return (
    <AnimatedPressable
      onPress={onPress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${meta.label}`}
    >
      <Animated.View pointerEvents="none" style={[styles.highlightGlow, { backgroundColor: `${tint}12` }, glowStyle]} />
      <Animated.View style={[styles.stateIcon, { backgroundColor: `${tint}16` }, stateStyle]}>
        <Icon size={16} color={tint} />
      </Animated.View>
      <View style={styles.flex}>
        <Text style={[styles.completionLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
        <Animated.Text style={[styles.stateLabel, { color: tint }, stateStyle]}>{meta.label}</Animated.Text>
      </View>
      <ChevronRight size={15} color={colors.muted} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  completionItem: { width: "100%", minHeight: 61, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: "row", alignItems: "center", gap: 9, overflow: "hidden" },
  completionItemDesktop: { width: "49.4%" },
  highlightGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 16, borderWidth: 1.5 },
  stateIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  completionLabel: { fontSize: 11, fontWeight: "800" },
  stateLabel: { fontSize: 8, fontWeight: "800", marginTop: 3 },
});
