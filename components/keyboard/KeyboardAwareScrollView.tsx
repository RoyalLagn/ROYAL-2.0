import React from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  containerStyle?: StyleProp<ViewStyle>;
  keyboardGap?: number;
};

const DEFAULT_KEYBOARD_GAP = 96;
const FOCUS_POLL_MS = 80;

type MeasurableInput = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/**
 * Shared form scroller for native screens and modal bodies.
 *
 * Android already uses windowSoftInputMode="adjustResize", so the outer view
 * deliberately has no Android behavior. Once the activity or modal window is
 * resized, the bounded ScrollView can bring its focused native child into view
 * and remains manually scrollable while the IME is open.
 */
export const KeyboardAwareScrollView = React.forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function KeyboardAwareScrollView(
    {
      children,
      containerStyle,
      keyboardGap = DEFAULT_KEYBOARD_GAP,
      keyboardShouldPersistTaps = "handled",
      keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
      automaticallyAdjustKeyboardInsets = Platform.OS === "ios",
      nestedScrollEnabled = true,
      showsVerticalScrollIndicator = false,
      style,
      onLayout,
      onScroll,
      onTouchEnd,
      scrollEventThrottle = 16,
      ...props
    },
    ref,
  ) {
    const scrollRef = React.useRef<ScrollView>(null);
    const scrollYRef = React.useRef(0);
    const keyboardVisibleRef = React.useRef(false);
    const keyboardHeightRef = React.useRef(0);
    const keyboardTopRef = React.useRef(Number.POSITIVE_INFINITY);
    const [keyboardTailHeight, setKeyboardTailHeight] = React.useState(0);
    const lastFocusedRef = React.useRef<unknown>(null);
    const pendingFrameRef = React.useRef<number | null>(null);

    React.useImperativeHandle(ref, () => scrollRef.current as ScrollView);

    const revealFocusedInput = React.useCallback(() => {
      if (Platform.OS === "web") return;
      const scrollView = scrollRef.current;
      const focused = TextInput.State.currentlyFocusedInput() as unknown as MeasurableInput | null;
      if (!scrollView || !focused) return;
      scrollView.scrollResponderScrollNativeHandleToKeyboard(focused, keyboardGap, true);
      focused.measureInWindow?.((_x, inputTop, _width, inputHeight) => {
        const visibleBottom = keyboardTopRef.current - keyboardGap;
        const delta = inputTop + inputHeight - visibleBottom;
        if (delta > 0) {
          scrollView.scrollTo({ y: scrollYRef.current + delta, animated: true });
        }
      });
    }, [keyboardGap]);

    const scheduleReveal = React.useCallback(() => {
      if (Platform.OS === "web") return;
      if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = requestAnimationFrame(() => {
          pendingFrameRef.current = null;
          revealFocusedInput();
        });
      });
    }, [revealFocusedInput]);

    React.useEffect(() => {
      if (Platform.OS === "web") return;
      let focusPoll: ReturnType<typeof setInterval> | null = null;
      const startFocusPoll = () => {
        if (focusPoll) clearInterval(focusPoll);
        focusPoll = setInterval(() => {
          const focused = TextInput.State.currentlyFocusedInput();
          if (focused && focused !== lastFocusedRef.current) {
            lastFocusedRef.current = focused;
            scheduleReveal();
          }
        }, FOCUS_POLL_MS);
      };
      const show = Keyboard.addListener("keyboardDidShow", (event) => {
        keyboardVisibleRef.current = true;
        const screenHeight = Dimensions.get("screen").height;
        const keyboardTop = Math.min(
          event.endCoordinates.screenY,
          screenHeight - event.endCoordinates.height,
        );
        keyboardTopRef.current = keyboardTop;
        keyboardHeightRef.current = Math.max(0, screenHeight - keyboardTop);
        setKeyboardTailHeight(Platform.OS === "android" ? keyboardHeightRef.current : 0);
        lastFocusedRef.current = TextInput.State.currentlyFocusedInput();
        scheduleReveal();
        startFocusPoll();
      });
      const hide = Keyboard.addListener("keyboardDidHide", () => {
        keyboardVisibleRef.current = false;
        keyboardHeightRef.current = 0;
        keyboardTopRef.current = Number.POSITIVE_INFINITY;
        setKeyboardTailHeight(0);
        lastFocusedRef.current = null;
        if (focusPoll) clearInterval(focusPoll);
        focusPoll = null;
      });
      return () => {
        show.remove();
        hide.remove();
        if (focusPoll) clearInterval(focusPoll);
        if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
      };
    }, [scheduleReveal]);

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.container, containerStyle]}
      >
        <ScrollView
          {...props}
          ref={scrollRef}
          style={[styles.scroller, style]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
          nestedScrollEnabled={nestedScrollEnabled}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          scrollEventThrottle={scrollEventThrottle}
          onLayout={(event) => {
            onLayout?.(event);
            if (keyboardVisibleRef.current) scheduleReveal();
          }}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
            onScroll?.(event);
          }}
          onTouchEnd={(event) => {
            onTouchEnd?.(event);
            if (keyboardVisibleRef.current) scheduleReveal();
          }}
        >
          {children}
          {keyboardTailHeight > 0 ? <View style={{ height: keyboardTailHeight }} importantForAccessibility="no-hide-descendants" /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  scroller: { flex: 1 },
});
