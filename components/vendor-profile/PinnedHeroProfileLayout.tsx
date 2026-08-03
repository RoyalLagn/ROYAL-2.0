import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

type Props = {
  hero: React.ReactNode;
  children: React.ReactNode;
  heroHeight: number;
  pageWidth: number;
  overlap?: number;
  motionDistance?: number;
  backgroundColor: string;
  sheetColor: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** One vertical scroll owner, one hero offset, and no scroll-driven layout. */
function PinnedHeroProfileLayout({
  hero,
  children,
  heroHeight,
  pageWidth,
  overlap = 24,
  motionDistance = 220,
  backgroundColor,
  sheetColor,
  contentContainerStyle,
}: Props) {
  const scrollY = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const sheetOffset = Math.max(0, heroHeight - overlap);
  const coverDistance = Math.max(1, Math.min(heroHeight, motionDistance));

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const heroStyle = useAnimatedStyle<ViewStyle>(() => {
    if (reducedMotion) return { transform: [{ translateY: 0 }, { scale: 1 }] } as ViewStyle;
    const translateY = interpolate(
      scrollY.value,
      [-64, 0, coverDistance],
      [-64, 0, coverDistance - heroHeight * 0.12],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      scrollY.value,
      [0, coverDistance],
      [1.03, 1],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateY }, { scale }] } as ViewStyle;
  }, [coverDistance, heroHeight, reducedMotion]);

  const shadeStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion
      ? 0
      : interpolate(scrollY.value, [0, coverDistance], [0, 0.12], Extrapolation.CLAMP),
  }), [coverDistance, reducedMotion]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        directionalLockEnabled
        nestedScrollEnabled
        onScroll={onScroll}
      >
        <View style={[styles.page, { width: pageWidth, paddingTop: sheetOffset }]}>
          <Animated.View style={[styles.hero, { height: heroHeight }, heroStyle]}>
            {hero}
            <Animated.View pointerEvents="none" style={[styles.shade, shadeStyle]} />
          </Animated.View>
          <View
            style={[
              styles.sheet,
              {
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                backgroundColor: sheetColor,
              },
            ]}
          >
            {children}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

export default React.memo(PinnedHeroProfileLayout);

const styles = StyleSheet.create({
  root: { flex: 1, position: "relative", overflow: "hidden" },
  scroll: { flex: 1 },
  page: { maxWidth: "100%", alignSelf: "center", position: "relative" },
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
    overflow: "hidden",
    backgroundColor: "#050505",
  },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000" },
  sheet: { width: "100%", zIndex: 2, overflow: "hidden" },
});
