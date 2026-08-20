import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, FadeInUp, useReducedMotion } from "react-native-reanimated";

type Props = {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

export default function VendorDashboardReveal({ children, delay = 0, style }: Props) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion
    ? undefined
    : FadeInUp.delay(delay).duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1)).withInitialValues({
        opacity: 0,
        transform: [{ translateY: 8 }],
      });
  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}
