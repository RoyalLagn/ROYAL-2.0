import React, { useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MotionDistance, MotionDuration, MotionEasing } from "@/utils/motion";

type AnimatedBottomSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  /** "sheet" rises from the bottom (the common case); "center" fades + scales
   *  in place, for smaller confirmation-style dialogs. */
  variant?: "sheet" | "center";
  accessibilityViewIsModal?: boolean;
  keyboardAware?: boolean;
} & Pick<ModalProps, "presentationStyle">;

/**
 * Shared modal/bottom-sheet chrome: soft backdrop fade + smooth sheet rise
 * (or center fade+scale for small dialogs), natural reverse-out on close,
 * and safe-area-aware bottom padding -- so screens stop hand-rolling their
 * own `<Modal transparent animationType="slide">` + bare backdrop `View`.
 *
 * Uses RN's `Modal` for the portal/stacking/back-button behavior (native,
 * required on both platforms) but sets `animationType="none"` and drives
 * the backdrop opacity and sheet translateY ourselves with reanimated, so
 * the backdrop actually fades instead of popping in at full opacity the
 * instant the native slide-up starts.
 *
 * Web focus: closing calls onRequestClose only after the exit animation
 * finishes, and the trigger that opened the sheet keeps its own focus
 * throughout (this component never steals or force-sets focus), so
 * closing restores keyboard/screen-reader focus to wherever it already
 * was -- no extra `document.activeElement` bookkeeping needed here.
 */
export default function AnimatedBottomSheet({
  visible,
  onRequestClose,
  children,
  sheetStyle,
  variant = "sheet",
  accessibilityViewIsModal = true,
  keyboardAware = false,
  presentationStyle,
}: AnimatedBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(visible);
  const backdropOpacity = useSharedValue(0);
  const sheetProgress = useSharedValue(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      backdropOpacity.value = withTiming(1, { duration: MotionDuration.fast, easing: MotionEasing.standard });
      sheetProgress.value = reducedMotion
        ? 1
        : withTiming(1, { duration: MotionDuration.base, easing: MotionEasing.standard });
    } else if (mounted) {
      closingRef.current = true;
      const finish = () => {
        if (closingRef.current) setMounted(false);
      };
      backdropOpacity.value = withTiming(0, { duration: MotionDuration.fast, easing: MotionEasing.standard });
      sheetProgress.value = reducedMotion
        ? 0
        : withTiming(0, { duration: MotionDuration.fast, easing: MotionEasing.standard }, (finished) => {
          if (finished) runOnJS(finish)();
        });
      if (reducedMotion) finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetAnimatedStyle = useAnimatedStyle(() => {
    if (variant === "center") {
      return {
        opacity: sheetProgress.value,
        transform: [{ scale: 0.94 + sheetProgress.value * 0.06 }],
      };
    }
    return {
      opacity: sheetProgress.value,
      transform: [{ translateY: (1 - sheetProgress.value) * MotionDistance.sheetPeek * 4 }],
    };
  });

  if (!mounted) return null;

  const content = <>
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdropTint, backdropStyle]}>
      <Pressable accessibilityLabel="Close" style={styles.backdropPress} onPress={onRequestClose} />
    </Animated.View>
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        variant === "center" ? styles.wrapCenter : styles.wrapSheet,
      ]}
    >
      <Animated.View
        style={[
          variant === "sheet" ? styles.sheet : styles.center,
          variant === "sheet" && { paddingBottom: Math.max(insets.bottom, 16) },
          sheetAnimatedStyle,
          sheetStyle,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  </>;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      presentationStyle={presentationStyle}
      onRequestClose={onRequestClose}
      accessibilityViewIsModal={accessibilityViewIsModal}
    >
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.host}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {content}
        </KeyboardAvoidingView>
      ) : <View style={styles.host}>{content}</View>}
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  backdropTint: { backgroundColor: "rgba(15,8,12,0.55)" },
  backdropPress: { flex: 1 },
  wrap: { ...StyleSheet.absoluteFillObject },
  wrapSheet: { justifyContent: "flex-end" },
  wrapCenter: { alignItems: "center", justifyContent: "center", padding: 18 },
  sheet: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "92%",
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  center: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 26,
  },
});
