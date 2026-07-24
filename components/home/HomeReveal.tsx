import React from "react";
import { View, type ViewProps } from "react-native";

type Props = ViewProps & { direction?: "up" | "down"; delay?: number };

export default function HomeReveal({ children, direction: _direction, delay: _delay, ...props }: Props) {
  return <View {...props}>{children}</View>;
}
