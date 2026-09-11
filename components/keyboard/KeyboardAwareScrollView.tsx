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
  type ScrollViewProps,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  containerStyle?: StyleProp<ViewStyle>;
  keyboardGap?: number;
  /** Transparent Android modals do not always inherit the activity's adjustResize behavior. */
  avoidKeyboardOnAndroid?: boolean;
};

const DEFAULT_KEYBOARD_GAP = 96;
type MeasurableInput = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

type KeyboardAwareFormContextValue = {
  revealInput: (input?: TextInput | null) => void;
  registerInput: (input: TextInput) => () => void;
  focusNextInput: (input: TextInput) => void;
};

const KeyboardAwareFormContext = React.createContext<KeyboardAwareFormContextValue | null>(null);

/** Lets shared auth inputs request an immediate, deterministic visibility check. */
export function useKeyboardAwareForm() {
  return React.useContext(KeyboardAwareFormContext);
}

/** TextInput that asks the nearest KeyboardAwareScrollView to reveal it. */
export const KeyboardAwareTextInput = React.forwardRef<TextInput, TextInputProps>(
  function KeyboardAwareTextInput({ onFocus, ...props }, forwardedRef) {
    const form = useKeyboardAwareForm();
    const inputRef = React.useRef<TextInput>(null);
    React.useImperativeHandle(forwardedRef, () => inputRef.current as TextInput);
    React.useEffect(() => {
      const input = inputRef.current;
      return input && form ? form.registerInput(input) : undefined;
    }, [form]);

    return (
      <TextInput
        {...props}
        ref={inputRef}
        onFocus={(event) => {
          onFocus?.(event);
          form?.revealInput(inputRef.current);
        }}
        returnKeyType={props.returnKeyType ?? (!props.multiline ? "next" : undefined)}
        blurOnSubmit={props.blurOnSubmit ?? !props.multiline}
        onSubmitEditing={(event) => {
          props.onSubmitEditing?.(event);
          if (!props.onSubmitEditing && !props.multiline && inputRef.current) {
            form?.focusNextInput(inputRef.current);
          }
        }}
      />
    );
  },
);

/**
 * Shared form scroller for native screens and modal bodies.
 *
 * Android already uses windowSoftInputMode="adjustResize", so the outer view
 * deliberately has no Android behavior. Once the activity or modal window is
 * resized, the bounded ScrollView can bring its focused native child into view.
 * Fields notify this scroller directly on focus; there is no polling loop or
 * drag-to-dismiss behavior competing with typing.
 */
export const KeyboardAwareScrollView = React.forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function KeyboardAwareScrollView(
    {
      children,
      containerStyle,
      keyboardGap = DEFAULT_KEYBOARD_GAP,
      avoidKeyboardOnAndroid = false,
      keyboardShouldPersistTaps = "handled",
      keyboardDismissMode = "none",
      automaticallyAdjustKeyboardInsets = false,
      nestedScrollEnabled = true,
      showsVerticalScrollIndicator = false,
      style,
      onLayout,
      onScroll,
      onContentSizeChange,
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
    const pendingFrameRef = React.useRef<number | null>(null);
    const inputsRef = React.useRef<TextInput[]>([]);

    React.useImperativeHandle(ref, () => scrollRef.current as ScrollView);

    const revealInput = React.useCallback((requestedInput?: TextInput | null) => {
      if (Platform.OS === "web") return;
      const scrollView = scrollRef.current;
      const focused = (requestedInput ?? TextInput.State.currentlyFocusedInput()) as unknown as MeasurableInput | null;
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

    const scheduleReveal = React.useCallback((input?: TextInput | null) => {
      if (Platform.OS === "web") return;
      if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = requestAnimationFrame(() => {
          pendingFrameRef.current = null;
          revealInput(input);
        });
      });
    }, [revealInput]);

    const registerInput = React.useCallback((input: TextInput) => {
      if (!inputsRef.current.includes(input)) inputsRef.current.push(input);
      return () => {
        inputsRef.current = inputsRef.current.filter((candidate) => candidate !== input);
      };
    }, []);

    const focusNextInput = React.useCallback((input: TextInput) => {
      const currentIndex = inputsRef.current.indexOf(input);
      const next = currentIndex >= 0 ? inputsRef.current[currentIndex + 1] : null;
      if (next) {
        next.focus();
        scheduleReveal(next);
      } else {
        Keyboard.dismiss();
      }
    }, [scheduleReveal]);

    const contextValue = React.useMemo(() => ({
      revealInput: scheduleReveal,
      registerInput,
      focusNextInput,
    }), [focusNextInput, registerInput, scheduleReveal]);

    React.useEffect(() => {
      if (Platform.OS === "web") return;
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
        scheduleReveal();
      });
      const hide = Keyboard.addListener("keyboardDidHide", () => {
        keyboardVisibleRef.current = false;
        keyboardHeightRef.current = 0;
        keyboardTopRef.current = Number.POSITIVE_INFINITY;
        setKeyboardTailHeight(0);
      });
      return () => {
        show.remove();
        hide.remove();
        if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
      };
    }, [scheduleReveal]);

    return (
      <KeyboardAwareFormContext.Provider value={contextValue}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : avoidKeyboardOnAndroid ? "height" : undefined}
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
            onContentSizeChange={(width, height) => {
              onContentSizeChange?.(width, height);
              if (keyboardVisibleRef.current) scheduleReveal();
            }}
            onScroll={(event) => {
              scrollYRef.current = event.nativeEvent.contentOffset.y;
              onScroll?.(event);
            }}
          >
            {children}
            {keyboardTailHeight > 0 ? <View style={{ height: keyboardTailHeight }} importantForAccessibility="no-hide-descendants" /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </KeyboardAwareFormContext.Provider>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  scroller: { flex: 1 },
});
