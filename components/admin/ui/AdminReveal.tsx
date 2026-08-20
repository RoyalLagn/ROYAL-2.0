import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, type ViewProps } from "react-native";

/**
 * A small, shared arrival treatment for admin result lists. Content remains
 * visible by default and reduced-motion users receive an opacity-only reveal.
 */
export function AdminReveal({ children, index = 0, style, ...props }: ViewProps & { children: React.ReactNode; index?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; subscription?.remove?.(); };
  }, []);

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 160 : 220,
      delay: reduceMotion ? 0 : Math.min(index * 42, 210),
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduceMotion]);

  return <Animated.View {...props} style={[style, { opacity: progress, transform: reduceMotion ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}
