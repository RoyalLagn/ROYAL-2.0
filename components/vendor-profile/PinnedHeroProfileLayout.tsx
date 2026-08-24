import React, { useState } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

type Props = {
  hero: React.ReactNode;
  children: React.ReactNode;
  heroHeight: number;
  /** Initial/fallback page width (typically `Math.min(useWindowDimensions().width, DESKTOP_MAX_WIDTH)`
   * from the caller), used only until the layout below measures the real
   * rendered width. Do not treat this as authoritative -- see the note on
   * `measuredWidth` for why. */
  pageWidth: number;
  overlap?: number;
  motionDistance?: number;
  backgroundColor: string;
  sheetColor: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Reports coarse scroll progress so the profile can reveal its editorial
   * sections without making the scrolling path JS-bound. */
  onScrollPosition?: (offset: number) => void;
};

const DESKTOP_MAX_WIDTH = 1120;

/**
 * One vertical scroll owner, one hero offset, and no scroll-driven layout.
 *
 * Width is the single source of truth for every vendor-profile section
 * nested inside `children` (portfolio grid, clips grid, etc.) -- they all
 * measure their own available width relative to this component's `page`
 * container via their own `onLayout`. That only works if `page`'s width is
 * itself trustworthy. It used to come straight from the `pageWidth` prop,
 * which every caller derives from `useWindowDimensions()`; on some Android/
 * Expo Go runtimes that hook does not reliably reflect the actual rendered
 * width, so `page` (and everything measuring against it, like the portfolio
 * grid) would silently inherit a wrong width -- this is what made the
 * 2-column portfolio grid intermittently collapse to one oversized column
 * per row despite the grid's own layout math being correct. Measuring this
 * component's own root `onLayout` gives the true rendered width regardless
 * of that hook, so `pageWidth` is now only a same-frame fallback before the
 * first layout pass.
 */
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
  onScrollPosition,
}: Props) {
  const scrollY = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const sheetOffset = Math.max(0, heroHeight - overlap);
  const coverDistance = Math.max(1, Math.min(heroHeight, motionDistance));
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const lastReportedOffset = useSharedValue(-160);
  // Web is the visual reference and already receives the correct viewport
  // width from its caller. Only native needs the measured-root fallback for
  // Expo Go runtimes whose window dimensions can briefly be stale.
  const effectiveWidth = Platform.OS === "web"
    ? pageWidth
    : Math.min(measuredWidth || pageWidth, DESKTOP_MAX_WIDTH);
  const onRootLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasuredWidth((current) => (current === next ? current : next));
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (onScrollPosition && Math.abs(event.contentOffset.y - lastReportedOffset.value) >= 96) {
        lastReportedOffset.value = event.contentOffset.y;
        runOnJS(onScrollPosition)(event.contentOffset.y);
      }
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
    <View
      onLayout={Platform.OS === "web" ? undefined : onRootLayout}
      style={[styles.root, { backgroundColor }]}
    >
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        directionalLockEnabled
        nestedScrollEnabled
        onScroll={onScroll}
      >
        <View style={[styles.page, { width: effectiveWidth, paddingTop: sheetOffset }]}>
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
