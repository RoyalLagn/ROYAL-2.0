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
import { LinearGradient } from "expo-linear-gradient";
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
import { typeScale, typeLeading } from "@/constants/typography";

type Colors = typeof vendorTheme.light;

type ChecklistMeta = { label: string; icon: React.ComponentType<{ size?: number; color?: string }> };

const CHECKLIST_PRESENTATION: Record<string, { description: string; light: readonly [string, string]; dark: readonly [string, string]; icon: string }> = {
  business: { description: "Tell us about your business", light: ["#FFF1F6", "#FFE4EE"], dark: ["#38242D", "#302027"], icon: "#E73C78" },
  about: { description: "Share your story", light: ["#FFF8E8", "#FFF0D2"], dark: ["#382F20", "#30281C"], icon: "#EF795B" },
  location: { description: "Add your service locations", light: ["#EAF7FF", "#DDF1FC"], dark: ["#20313A", "#1B2B33"], icon: "#EE4E83" },
  contact: { description: "Let clients reach you easily", light: ["#FFF0F6", "#FFE4EE"], dark: ["#38242D", "#302027"], icon: "#E83D78" },
  identity: { description: "Show your brand identity", light: ["#FFF8E7", "#FFF0D5"], dark: ["#382F20", "#30281C"], icon: "#BF4777" },
  services: { description: "List your offerings", light: ["#EAFBF4", "#DDF6EA"], dark: ["#20352E", "#1B2D28"], icon: "#E26077" },
  pricing: { description: "Add your pricing details", light: ["#F5F0FF", "#EDE5FF"], dark: ["#2D283B", "#262233"], icon: "#D87937" },
  portfolio: { description: "Showcase your work", light: ["#FFF1F5", "#FFE5EB"], dark: ["#38242B", "#302027"], icon: "#E95682" },
  availability: { description: "Set your availability", light: ["#EAFBF5", "#DCF6EC"], dark: ["#20352F", "#1B2D28"], icon: "#F04B7F" },
  tags: { description: "Help clients find you", light: ["#EAF7FF", "#DDEFFC"], dark: ["#20313A", "#1B2A33"], icon: "#EB4A7C" },
};

export const READINESS_CHECKLIST_GAP = 12;
export const READINESS_CHECKLIST_MOBILE_COLUMNS = 1;
export const READINESS_CHECKLIST_WIDE_COLUMNS = 2;
export const READINESS_CHECKLIST_WIDE_MIN_WIDTH = 560;

/** Use one calm reading column on phones and two balanced columns on wider screens. */
export function readinessChecklistColumns(gridWidth: number) {
  return gridWidth >= READINESS_CHECKLIST_WIDE_MIN_WIDTH
    ? READINESS_CHECKLIST_WIDE_COLUMNS
    : READINESS_CHECKLIST_MOBILE_COLUMNS;
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
  sectionIcon: React.ComponentType<{ size?: number; color?: string }>;
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
  sectionIcon: SectionIcon,
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
  const StatusIcon = meta.icon;
  const presentation = CHECKLIST_PRESENTATION[item.id] ?? CHECKLIST_PRESENTATION.business;
  const compact = itemWidth == null || itemWidth < 320;

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
    ...(compact ? [styles.completionItemCompact] : []),
    itemWidth ? { width: itemWidth } : styles.completionItemFallback,
  ];

  return (
    <AnimatedPressable
      onPress={onPress}
      style={rowStyle}
      hoverTranslateY={-2}
      hoverScale={1.008}
      restingShadowOpacity={0.055}
      hoverShadowOpacity={0.14}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${meta.label}`}
      {...(Platform.OS === "web" ? { className: "readiness-checklist-card" } : null)}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.highlightGlow, { backgroundColor: `${tint}12` }, glowStyle]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={colors === vendorTheme.dark ? presentation.dark : presentation.light}
        style={styles.cardWash}
      />
      <Animated.View style={[styles.stateRow, compact && styles.stateRowCompact, { backgroundColor: colors === vendorTheme.dark ? `${tint}24` : item.state === "complete" ? "rgba(235,255,246,0.9)" : "rgba(255,238,246,0.92)" }, stateStyle]}>
          <View style={[styles.statusIcon, { backgroundColor: tint }]}>
            <StatusIcon size={10} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text style={[styles.stateLabel, { color: tint }, webTextStyle]} numberOfLines={1}>
            {meta.label}
          </Text>
      </Animated.View>
      <View style={[styles.sectionIcon, compact && styles.sectionIconCompact, { backgroundColor: colors === vendorTheme.dark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.76)", shadowColor: presentation.icon }]}>
        <SectionIcon size={compact ? 24 : 34} color={presentation.icon} strokeWidth={2.1} />
      </View>
      <View style={[styles.copy, compact && styles.copyCompact]}>
        <Text style={[styles.completionLabel, compact && styles.completionLabelCompact, { color: colors.text }, webTextStyle]} numberOfLines={2}>
          {item.label}
        </Text>
        <Text style={[styles.description, compact && styles.descriptionCompact, { color: colors.muted }, webTextStyle]} numberOfLines={2}>
          {presentation.description}
        </Text>
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
    minHeight: 140,
    borderRadius: 20,
    padding: 20,
    overflow: "hidden",
    flexGrow: 0,
    flexShrink: 0,
    shadowColor: "#7D3D58",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.055,
    shadowRadius: 16,
    elevation: 1,
  },
  completionItemCompact: { minHeight: 128, padding: 16, borderRadius: 18 },
  completionItemFallback: {
    width: "100%",
  },
  highlightGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  cardWash: { ...StyleSheet.absoluteFillObject },
  sectionIcon: {
    position: "absolute",
    width: 68,
    height: 68,
    right: 20,
    top: 44,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 2,
  },
  sectionIconCompact: { width: 52, height: 52, right: 14, top: 43, borderRadius: 16 },
  copy: {
    position: "absolute",
    left: 20,
    right: 108,
    bottom: 15,
  },
  copyCompact: { left: 16, right: 80, bottom: 12 },
  completionLabel: {
    fontSize: typeScale.cardTitle,
    fontWeight: "700",
    lineHeight: typeLeading.cardTitle,
    letterSpacing: -0.25,
  },
  completionLabelCompact: { fontSize: typeScale.body, lineHeight: typeLeading.body, letterSpacing: -0.15 },
  stateRow: {
    position: "absolute",
    left: 20,
    top: 18,
    minHeight: 34,
    paddingLeft: 7,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 17,
    shadowColor: "#7D3D58",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 1,
  },
  stateRowCompact: { left: 12, top: 12, minHeight: 30, maxWidth: 132, paddingLeft: 5, paddingRight: 9, gap: 5 },
  stateLabel: {
    fontSize: typeScale.caption,
    fontWeight: "700",
    lineHeight: typeLeading.caption,
  },
  statusIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  description: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 4 },
  descriptionCompact: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 2 },
});
