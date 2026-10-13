import React from "react";
import { Platform, View, type ViewProps } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MotionDistance, MotionTiming } from "@/utils/motion";

type HomeSectionRevealProps = ViewProps & {
  scrollY: SharedValue<number>;
  viewportHeight: number;
};

function WebHomeSectionReveal({
  children,
  scrollY,
  viewportHeight,
  style,
  ...props
}: HomeSectionRevealProps) {
  const reducedMotion = useReducedMotion();
  const sectionTop = useSharedValue(Number.MAX_SAFE_INTEGER);
  const progress = useSharedValue(0);

  useAnimatedReaction(
    () => scrollY.value + viewportHeight - MotionDistance.screenEnter >= sectionTop.value,
    (visible) => {
      if (visible && progress.value === 0) {
        progress.value = withTiming(1, reducedMotion ? MotionTiming.fast : MotionTiming.base);
      }
    },
    [reducedMotion, viewportHeight],
  );

  const revealStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{
      translateY: reducedMotion ? 0 : (1 - progress.value) * MotionDistance.cardEnter,
    }],
  }));

  return (
    <Animated.View
      {...props}
      onLayout={(event) => {
        sectionTop.value = event.nativeEvent.layout.y;
      }}
      style={[style, revealStyle]}
    >
      {children}
    </Animated.View>
  );
}

export default function HomeSectionReveal(props: HomeSectionRevealProps) {
  // Moving sections while the finger is down makes Android scroll feel like it
  // slips. Keep the entrance on web, where it does not fight the scroll view.
  if (Platform.OS !== "web") {
    const { children, style, scrollY: _scrollY, viewportHeight: _viewportHeight, ...rest } = props;
    return (
      <View {...rest} style={style}>
        {children}
      </View>
    );
  }

  return <WebHomeSectionReveal {...props} />;
}
