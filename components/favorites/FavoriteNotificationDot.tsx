import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type FavoriteNotificationDotProps = {
  visible: boolean;
  animationToken: number;
};

export default function FavoriteNotificationDot({
  visible,
  animationToken,
}: FavoriteNotificationDotProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(visible ? 1 : 0);
  const opacity = useSharedValue(visible ? 1 : 0);
  const previousToken = useRef(animationToken);

  useEffect(() => {
    if (!visible) {
      scale.value = withTiming(0, { duration: reducedMotion ? 0 : 120 });
      opacity.value = withTiming(0, { duration: reducedMotion ? 0 : 100 });
      return;
    }

    opacity.value = 1;
    if (animationToken !== previousToken.current && !reducedMotion) {
      scale.value = 0.35;
      scale.value = withSpring(1, { damping: 10, stiffness: 280, mass: 0.55 });
    } else {
      scale.value = 1;
    }
    previousToken.current = animationToken;
  }, [animationToken, opacity, reducedMotion, scale, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      style={[styles.dot, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: 1,
    right: 3,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#F31261",
    zIndex: 4,
  },
});
