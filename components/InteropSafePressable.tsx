import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type InteractionState = { pressed: boolean; hovered: boolean; focused: boolean };

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: InteractionState) => StyleProp<ViewStyle>);
};

/** Resolve callback styles before NativeWind's native Pressable interop sees them. */
export default function InteropSafePressable({
  style, onPressIn, onPressOut, onHoverIn, onHoverOut, onFocus, onBlur,
  android_ripple, accessibilityState, children, disabled, hitSlop, ...props
}: Props) {
  const [state, setState] = useState<InteractionState>({ pressed: false, hovered: false, focused: false });
  const resolvedStyle = typeof style === "function" ? style(state) : style;
  const flattenedStyle = StyleSheet.flatten(resolvedStyle) ?? {};
  const nativeSurfaceColor = Platform.OS === "android" ? flattenedStyle.backgroundColor : undefined;
  const pressableStyle = nativeSurfaceColor
    ? [resolvedStyle, styles.nativeTransparentSurface]
    : resolvedStyle;
  const nativeSurfaceStyle: ViewStyle | undefined = nativeSurfaceColor
    ? {
        backgroundColor: nativeSurfaceColor,
        borderRadius: flattenedStyle.borderRadius,
        borderTopLeftRadius: flattenedStyle.borderTopLeftRadius,
        borderTopRightRadius: flattenedStyle.borderTopRightRadius,
        borderBottomLeftRadius: flattenedStyle.borderBottomLeftRadius,
        borderBottomRightRadius: flattenedStyle.borderBottomRightRadius,
      }
    : undefined;
  const withNativeSurface = (content: React.ReactNode) => nativeSurfaceStyle
    ? <><View pointerEvents="none" style={[styles.nativeSurface, nativeSurfaceStyle]} />{content}</>
    : content;

  return <Pressable
    {...props}
    disabled={disabled}
    hitSlop={hitSlop ?? 4}
    accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
    android_ripple={android_ripple ?? (Platform.OS === "android" ? { color: "rgba(127,127,127,0.14)", borderless: false, foreground: true } : undefined)}
    style={pressableStyle}
    onPressIn={(event) => { setState((current) => ({ ...current, pressed: true })); onPressIn?.(event); }}
    onPressOut={(event) => { setState((current) => ({ ...current, pressed: false })); onPressOut?.(event); }}
    onHoverIn={(event) => { setState((current) => ({ ...current, hovered: true })); onHoverIn?.(event); }}
    onHoverOut={(event) => { setState((current) => ({ ...current, hovered: false })); onHoverOut?.(event); }}
    onFocus={(event) => { setState((current) => ({ ...current, focused: true })); onFocus?.(event); }}
    onBlur={(event) => { setState((current) => ({ ...current, focused: false })); onBlur?.(event); }}
  >
    {typeof children === "function"
      ? (pressableState) => withNativeSurface(children(pressableState))
      : withNativeSurface(children)}
  </Pressable>;
}

const styles = StyleSheet.create({
  nativeTransparentSurface: { backgroundColor: "transparent" },
  nativeSurface: { ...StyleSheet.absoluteFillObject },
});
