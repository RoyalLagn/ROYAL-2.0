import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
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

export const READINESS_CHECKLIST_GAP = 8;
export const READINESS_CHECKLIST_MIN_CARD_WIDTH = 156;

/** Columns for the readiness checklist based on the measured grid width. */
export function readinessChecklistColumns(gridWidth: number) {
  if (gridWidth <= 0) return 1;
  const gap = READINESS_CHECKLIST_GAP;
  const min = READINESS_CHECKLIST_MIN_CARD_WIDTH;
  if (gridWidth >= min * 3 + gap * 2) return 3;
  if (gridWidth >= min * 2 + gap) return 2;
  return 1;
}

export function readinessChecklistItemWidth(
  gridWidth: number,
  columns = readinessChecklistColumns(gridWidth),
) {
  if (gridWidth <= 0 || columns < 1) return undefined;
  const totalGap = READINESS_CHECKLIST_GAP * Math.max(0, columns - 1);
  return Math.floor((gridWidth - totalGap) / columns);
}

type ChecklistItemProps = {
  item: CompletionItem;
  meta: ChecklistMeta;
  colors: Colors;
  /** Measured card width from the parent grid. Prefer this over percentage widths. */
  itemWidth?: number;
  /** True only for the section that was just completed/updated -- shows a
   *  brief highlight pulse. The parent clears this after ~1.6s so the card
   *  never stays visually "special" and never re-highlights on every
   *  revisit of the screen. */
  highlighted: boolean;
  onPress: () => void;
};

type ChecklistGridProps = {
  children: (itemWidth: number | undefined, columns: number) => React.ReactNode;
  style?: ViewStyle;
};

/**
 * Measures available width and exposes equal card widths for the readiness
 * checklist. Keeps column math in one place for web + native.
 */
export function ReadinessChecklistGrid({ children, style }: ChecklistGridProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const columns = useMemo(() => readinessChecklistColumns(gridWidth), [gridWidth]);
  const itemWidth = useMemo(
    () => readinessChecklistItemWidth(gridWidth, columns),
    [columns, gridWidth],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== gridWidth) setGridWidth(next);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.grid, style]}
      {...(Platform.OS === "web" ? { className: "readiness-checklist-grid" } : null)}
    >
      {children(itemWidth, columns)}
    </View>
  );
}

/**
 * A single readiness-checklist card. Status icon and label crossfade only
 * when `item.state` actually changes (not on every re-render), and the row
 * gets a brief tinted pulse when `highlighted` is true -- per the "only
 * animate the tapped card, the changed status, the newly completed
 * section" rule, not the whole list on every screen focus.
 */
export default function ChecklistItem({
  item,
  meta,
  colors,
  itemWidth,
  highlighted,
  onPress,
}: ChecklistItemProps) {
  const reducedMotion = useReducedMotion();
  const tint =
    item.state === "complete"
      ? colors.success
      : item.state === "attention"
        ? colors.warning
        : colors.pink;
  const stateOpacity = useSharedValue(1);
  const highlightGlow = useSharedValue(0);
  const Icon = meta.icon;

  useEffect(() => {
    if (reducedMotion) return;
    stateOpacity.value = 0.15;
    stateOpacity.value = withTiming(1, {
      duration: MotionDuration.fast,
      easing: Easing.out(Easing.cubic),
    });
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
    itemWidth ? { width: itemWidth } : styles.completionItemFallback,
    { backgroundColor: colors.background, borderColor: colors.border },
  ];

  return (
    <AnimatedPressable
      onPress={onPress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${meta.label}`}
      {...(Platform.OS === "web" ? { className: "readiness-checklist-card" } : null)}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.highlightGlow, { backgroundColor: `${tint}12` }, glowStyle]}
      />
      <Animated.View style={[styles.stateIcon, { backgroundColor: `${tint}16` }, stateStyle]}>
        <Icon size={16} color={tint} />
      </Animated.View>
      <View style={styles.copy}>
        <Text
          style={[styles.completionLabel, { color: colors.text }, webTextStyle]}
          numberOfLines={2}
        >
          {item.label}
        </Text>
        <Animated.Text
          style={[styles.stateLabel, { color: tint }, stateStyle, webTextStyle]}
          numberOfLines={1}
        >
          {meta.label}
        </Animated.Text>
      </View>
      <View style={styles.chevron}>
        <ChevronRight size={15} color={colors.muted} />
      </View>
    </AnimatedPressable>
  );
}

const webTextStyle: TextStyle =
  Platform.OS === "web"
    ? ({
        wordBreak: "normal",
        overflowWrap: "break-word",
      } as TextStyle)
    : {};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: READINESS_CHECKLIST_GAP,
    width: "100%",
    alignItems: "stretch",
  },
  completionItem: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    overflow: "hidden",
    flexGrow: 0,
    flexShrink: 0,
  },
  completionItemFallback: {
    width: "100%",
    alignSelf: "stretch",
  },
  highlightGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  stateIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  chevron: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  completionLabel: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  stateLabel: {
    fontSize: 8,
    fontWeight: "800",
    marginTop: 3,
    lineHeight: 11,
  },
});
