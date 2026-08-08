import React, { useState } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

type InteractionState = { pressed: boolean; hovered: boolean; focused: boolean };

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: InteractionState) => StyleProp<ViewStyle>);
};

/** Resolve callback styles before NativeWind's native Pressable interop sees them. */
export default function InteropSafePressable({
  style, onPressIn, onPressOut, onHoverIn, onHoverOut, onFocus, onBlur, ...props
}: Props) {
  const [state, setState] = useState<InteractionState>({ pressed: false, hovered: false, focused: false });
  const resolvedStyle = typeof style === "function" ? style(state) : style;

  return <Pressable
    {...props}
    style={resolvedStyle}
    onPressIn={(event) => { setState((current) => ({ ...current, pressed: true })); onPressIn?.(event); }}
    onPressOut={(event) => { setState((current) => ({ ...current, pressed: false })); onPressOut?.(event); }}
    onHoverIn={(event) => { setState((current) => ({ ...current, hovered: true })); onHoverIn?.(event); }}
    onHoverOut={(event) => { setState((current) => ({ ...current, hovered: false })); onHoverOut?.(event); }}
    onFocus={(event) => { setState((current) => ({ ...current, focused: true })); onFocus?.(event); }}
    onBlur={(event) => { setState((current) => ({ ...current, focused: false })); onBlur?.(event); }}
  />;
}
