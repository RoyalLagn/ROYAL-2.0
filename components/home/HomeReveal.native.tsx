import React from "react";
import { type ViewProps } from "react-native";
import Animated, { FadeInDown, FadeInUp, ReduceMotion } from "react-native-reanimated";

type Props = ViewProps & { direction?: "up" | "down"; delay?: number };

export default function HomeReveal({ children, direction = "up", delay = 0, ...props }: Props) {
  const animation = direction === "down" ? FadeInDown : FadeInUp;
  return (
    <Animated.View {...props} entering={animation.duration(320).delay(delay).reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}
